/**
 * 预约域的共享常量与纯计算工具（提交校验 + 状态派生）。
 *
 * 技术设计 §5 约定调用链为 `Page → Service → API`，页面不堆积业务逻辑；
 * 但「一次提交的入参是否成立」「一条预约此刻该算什么状态」都属于纯计算、
 * 无副作用、无 IO 的判定，与 utils/time-slot.ts 承载的 `isTimeSlotSelectable`
 * （需求 §4.4）同一性质，因此放在 utils。
 *
 * 为什么错误码也在这里：
 * 开发期数据源（services/mock-booking.ts）与真实接口层（services/booking.ts）都要用它，
 * 而这两者若互相 import 会形成循环依赖；放在本文件后可被双方共同引用，
 * 且本文件不 import 任何 services，依赖方向始终是单向的。
 *
 * 校验只覆盖「不依赖服务端数据就能判定的部分」（需求 §4.5 提交前检查第 3、4 项）：
 * 资源是否存在、时间段是否仍可用必须由服务端判定，客户端不做也不可能做。
 *
 * Phase 7 追加状态派生：把「预约时段是否已结束」折算成展示用的状态，
 * 让「我的预约」三个页签（需求 §4.6）能正确分組。
 * Phase 8 追加 `canCancelBooking`：需求 §4.7「用户可以取消自己的**有效**预约」，
 * 哪些算有效由这里统一判定，页面不各自写一遍时间比较。
 */
import { parseDate, toMinutes } from './date'
import type { Booking, BookingStatus, CreateBookingPayload } from '../types/booking'

/**
 * 预约业务错误码。
 *
 * 编码沿用「HTTP 状态码 × 1000 + 序号」：4xx 表示请求本身有问题、用户可自行修正。
 * `CONFLICT` 取值与 docs/02_technical_design.md §13 的响应示例一致
 * （`409001`「该时间段已被预约」）。
 *
 * 待 `docs/05_api_contract.md` 建立后，本表需与该契约对齐。
 */
export const BOOKING_ERROR_CODE = {
  /** 参数错误：字段缺失或格式非法 */
  PARAM: 400001,
  /** 非法时间：结束时间不晚于开始时间，或预约时间已早于当前时间 */
  INVALID_TIME: 400002,
  /** 资源不存在或已下架 */
  RESOURCE_NOT_FOUND: 404001,
  /** 预约不存在，或不属于当前用户（需求 §4.6「用户只能看到自己的预约」） */
  NOT_FOUND: 404001,
  /** 该时间段已被预约 */
  CONFLICT: 409001,
} as const

/** 预约状态的中文名（需求 §4.6 的三个页签与卡片标签共用一份文案） */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: '待使用',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

/** 入参校验结果 */
export interface BookingValidationResult {
  /** 是否通过校验 */
  ok: boolean
  /** 未通过时的业务错误码；通过时为 0 */
  code: number
  /** 未通过时的原因，可直接展示给用户；通过时为空串 */
  message: string
}

function fail(code: number, message: string): BookingValidationResult {
  return { ok: false, code, message }
}

/**
 * 把「日期 + 开始时间」合成一个本地 Date，便于与当前时刻比较。
 * 日期或时间非法时返回 null——调用方据此判定「不可比较」，不要当成某个默认时刻。
 */
export function resolveBookingStart(date: string, startTime: string): Date | null {
  const day = parseDate(date)
  const minutes = toMinutes(startTime)
  if (!day || minutes < 0) {
    return null
  }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  )
}

/**
 * 校验创建预约的入参（需求 §4.5 提交前检查第 3、4 项、技术设计 §11 第 3、4 条）。
 *
 * 为什么客户端也要校验一遍：
 * 服务端校验是权威（Phase 6 由开发期数据源承担、Phase 10 由后端承担），
 * 但客户端校验的意义在于「不用等一个来回就能告诉用户哪里不对」；
 * 尤其是「不得早于当前时间」——用户可能在详情页停留很久，
 * 页面上的时段是加载时的快照，提交那一刻它可能已经过期，
 * 这条只能在提交前重新判定，不能在渲染时就下定论。
 *
 * @param payload 提交入参
 * @param now 比较基准，缺省为当前时刻；测试可注入固定值
 */
export function validateBookingPayload(
  payload: CreateBookingPayload,
  now: Date = new Date(),
): BookingValidationResult {
  // 1. 资源 ID 必须是正整数（与详情页 onLoad 的参数判定保持一致）
  if (!Number.isInteger(payload.resourceId) || payload.resourceId <= 0) {
    return fail(BOOKING_ERROR_CODE.PARAM, '资源信息有误，请返回重新选择')
  }

  // 2. 日期格式与真实性（parseDate 会拒绝 2026-02-31 这类不存在的日期）
  if (!parseDate(payload.date)) {
    return fail(BOOKING_ERROR_CODE.PARAM, '预约日期不合法，请重新选择日期')
  }

  // 3. 时间格式合法且结束晚于开始
  const startMinutes = toMinutes(payload.startTime)
  const endMinutes = toMinutes(payload.endTime)
  if (startMinutes < 0 || endMinutes < 0 || endMinutes <= startMinutes) {
    return fail(BOOKING_ERROR_CODE.INVALID_TIME, '预约时间不合法，请重新选择时间段')
  }

  // 4. 不得早于当前时间（技术设计 §11 第 4 条）
  const start = resolveBookingStart(payload.date, payload.startTime)
  if (!start || start.getTime() < now.getTime()) {
    return fail(BOOKING_ERROR_CODE.INVALID_TIME, '该时间段已过时，请选择其他时段')
  }

  return { ok: true, code: 0, message: '' }
}

/**
 * 把「日期 + 结束时间」合成一个本地 Date，用于判断预约是否已结束。
 * 与 `resolveBookingStart` 成对；日期或时间非法时返回 null。
 */
export function resolveBookingEnd(date: string, endTime: string): Date | null {
  const day = parseDate(date)
  const minutes = toMinutes(endTime)
  if (!day || minutes < 0) {
    return null
  }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  )
}

/**
 * 派生一条预约「此刻」的展示状态（Phase 7）。
 *
 * 为什么需要派生而不是直接读 `booking.status`：
 * 服务端的 `status` 只记录**已发生的显式变更**——创建时是 `PENDING`、
 * 取消后是 `CANCELLED`；而「用完场地下班了」没有任何人去点一下，
 * 状态却已经变了。若直接读原值，昨天约的场地今天仍显示在「待使用」里，
 * 用户会以为它还能用。
 *
 * 为什么不改成「查询时顺手把过期记录写成 COMPLETED」：
 * 那是让 `GET` 请求产生写副作用。状态推进该由服务端定时任务或下次写入时做，
 * 前端只按同一套规则**派生展示**，不改数据——真实后端哪天自行推进了，
 * 这里的判断（`COMPLETED` 直接沿用）也不会冲突。
 *
 * 规则：`CANCELLED` / `COMPLETED` 是终态，直接沿用；
 * `PENDING` 且结束时刻已过则视为 `COMPLETED`。
 *
 * @param now 比较基准，缺省为当前时刻；测试可注入固定值
 */
export function resolveBookingStatus(booking: Booking, now: Date = new Date()): BookingStatus {
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return booking.status
  }
  const end = resolveBookingEnd(booking.date, booking.endTime)
  if (!end) {
    return 'PENDING'
  }
  return end.getTime() <= now.getTime() ? 'COMPLETED' : 'PENDING'
}

/**
 * 按时间的自然先后比较两条预约。
 * `date` 与 `startTime` 都是定长补零格式（`YYYY-MM-DD` / `HH:mm`），
 * 直接字符串比较即等价于时间比较，不必再构造 Date。
 */
function compareChronologically(a: Booking, b: Booking): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1
  }
  if (a.startTime !== b.startTime) {
    return a.startTime < b.startTime ? -1 : 1
  }
  return a.id - b.id
}

/**
 * 筛出某个展示状态下的全部预约，并按该状态合适的顺序排列。
 *
 * 排序方向刻意不同：
 * - 待使用按时间**升序**——最近要用的一条在最上面，这才是用户打开页面想先看到的；
 * - 已完成 / 已取消按时间**降序**——这些是历史，越近的越可能还想点开看看，
 *   按升序反而会把它们推到列表最底下。
 *
 * @param now 比较基准，缺省为当前时刻；测试可注入固定值
 */
export function selectBookingsByStatus(
  list: Booking[],
  status: BookingStatus,
  now: Date = new Date(),
): Booking[] {
  const matched = list.filter((item) => resolveBookingStatus(item, now) === status)
  const sorted = matched.slice().sort(compareChronologically)
  return status === 'PENDING' ? sorted : sorted.reverse()
}

/**
 * 这条预约此刻是否还允许取消（需求 §4.7、技术设计 §11 第 6 条）。
 *
 * 判据是**派生状态**而不是 `booking.status` 原值：
 * 一条 `PENDING` 但时段早已过去的预约，取消它没有任何意义——
 * 场地早就空出来了，用户也不需要它「恢复可用」。
 * 这里复用 `resolveBookingStatus` 而不是再写一遍时间比较，
 * 是为了让「列表里显示已完成」与「详情页不显示取消按钮」永远用同一把尺子，
 * 不会出现「这一页说已结束、那一页还能取消」的自相矛盾。
 *
 * 「不得取消其他用户预约」不在这里判定：那是服务端按登录凭证做的归属校验
 * （技术设计 §11 第 6 条），客户端无从也不该自己判断归属。
 *
 * @param now 比较基准，缺省为当前时刻；测试可注入固定值
 */
export function canCancelBooking(booking: Booking, now: Date = new Date()): boolean {
  return resolveBookingStatus(booking, now) === 'PENDING'
}
