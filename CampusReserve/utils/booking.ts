/**
 * 预约提交的共享常量与校验工具。
 *
 * 技术设计 §5 约定调用链为 `Page → Service → API`，页面不堆积业务逻辑；
 * 但「一次提交的入参是否成立」属于纯计算、无副作用、无 IO 的判定，
 * 与 utils/time-slot.ts 承载的 `isTimeSlotSelectable`（需求 §4.4）同一性质，因此放在 utils。
 *
 * 为什么错误码也在这里：
 * 开发期数据源（services/mock-booking.ts）与真实接口层（services/booking.ts）都要用它，
 * 而这两者若互相 import 会形成循环依赖；放在本文件后可被双方共同引用，
 * 且本文件不 import 任何 services，依赖方向始终是单向的。
 *
 * 校验只覆盖「不依赖服务端数据就能判定的部分」（需求 §4.5 提交前检查第 3、4 项）：
 * 资源是否存在、时间段是否仍可用必须由服务端判定，客户端不做也不可能做。
 */
import { parseDate, toMinutes } from './date'
import type { CreateBookingPayload } from '../types/booking'

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
  /** 该时间段已被预约 */
  CONFLICT: 409001,
} as const

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
