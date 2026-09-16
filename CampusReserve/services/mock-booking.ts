/**
 * 开发期本地预约数据源（Phase 6 新增）。
 *
 * 仅在启用 services/config.ts 的 `USE_MOCK_DATA` 时被 services/booking.ts 调用，
 * 用途是让「创建预约」这条核心链路在后端业务 API（Phase 10）落地前就能完整跑通，
 * 包括成功与六种失败路径。
 *
 * 它承担的不只是「造一条假数据」，而是把**服务端该做的校验**先按技术设计 §11 实现一遍：
 * 1. 参数与时间合法性（复用 utils/booking.ts，与客户端预校验同一份规则）；
 * 2. 资源存在；
 * 3. 请求的时段在开放范围内、且仍为 `AVAILABLE`；
 * 4. 同一资源同一日期同一开始时间未被重复预约。
 * 这样页面代码写完之后，把 config.ts 的开关改为 false 接真实后端，行为是一致的。
 *
 * Phase 7 追加 `GET /api/bookings/my` 的本地实现（`mockGetMyBookings`），
 * 用于「我的预约」列表与预约详情。
 *
 * 约束：数据形态严格对齐 types/booking.ts 的 `Booking`；
 * 返回 Promise 并带模拟延迟，失败时 reject 与 services/request.ts 同形态的 `ApiError`。
 *
 * 已知边界：预约记录在 services/mock-booking-store.ts，落在本地缓存键 `CR_MOCK_BOOKINGS`
 * （不是模块级变量——那样每次重新编译就清空，Phase 7 的列表会读不到刚创建的预约）。
 * 开发期不需要真正的跨会话持久化，真实持久化由 Phase 10 的数据库承担；
 * 端到端测试在每次运行开始时用 `resetMockBookings()` 拿到干净状态。
 */
import { getToken } from '../store/auth'
import { BOOKING_ERROR_CODE, validateBookingPayload } from '../utils/booking'
import { formatDateTime } from '../utils/date'
import {
  MOCK_BOOKING_MODE_STORAGE_KEY,
  MOCK_MY_BOOKINGS_MODE_STORAGE_KEY,
} from './config'
import { appendMockBooking, isSlotBooked, listMockBookings } from './mock-booking-store'
import { buildDefaultSlots, MOCK_RESOURCES } from './mock-resource'
import { ApiError, ApiErrorCode } from './request'
import type { Booking, CreateBookingPayload } from '../types/booking'

/**
 * 转出预约表的读取与清空接口。
 *
 * 预约表的归属在 `services/mock-booking-store.ts`（因为可用时间段也要读它），
 * 但从使用方看，「预约数据」这门面就是本文件，因此在这里转出；
 * Phase 7 的「我的预约」直接从这里取即可。
 */
export { listMockBookings, resetMockBookings } from './mock-booking-store'

/** 模拟网络延迟（毫秒），用于观察「提交中…」态 */
const MOCK_BOOKING_DELAY = 600

/** 列表请求的模拟延迟（毫秒），比提交略短，用于观察加载态 */
const MOCK_MY_BOOKINGS_DELAY = 500

/** 开发期创建预约的数据源模式 */
export type MockBookingMode =
  | 'success'
  | 'conflict'
  | 'resource-missing'
  | 'invalid-time'
  | 'param-error'
  | 'unauthorized'
  | 'error'

/** 各失败模式对应的错误；缺省（success）时走真实校验 */
const FORCED_ERRORS: Record<string, { code: number; message: string }> = {
  conflict: { code: BOOKING_ERROR_CODE.CONFLICT, message: '该时间段已被预约，请选择其他时段' },
  'resource-missing': {
    code: BOOKING_ERROR_CODE.RESOURCE_NOT_FOUND,
    message: '该资源不存在或已下架',
  },
  'invalid-time': {
    code: BOOKING_ERROR_CODE.INVALID_TIME,
    message: '该时间段不符合预约规则，请重新选择',
  },
  'param-error': { code: BOOKING_ERROR_CODE.PARAM, message: '预约参数有误，请重新选择' },
}

/**
 * 读取当前创建预约的数据源模式。
 * 通过 `wx.setStorageSync('CR_MOCK_BOOKING_MODE', 'conflict')` 可在调试与端到端测试中注入。
 */
export function readMockBookingMode(): MockBookingMode {
  const raw: unknown = wx.getStorageSync(MOCK_BOOKING_MODE_STORAGE_KEY)
  const modes: MockBookingMode[] = [
    'conflict',
    'resource-missing',
    'invalid-time',
    'param-error',
    'unauthorized',
    'error',
  ]
  return modes.indexOf(raw as MockBookingMode) >= 0 ? (raw as MockBookingMode) : 'success'
}

/** 开发期「我的预约」数据源模式 */
export type MockMyBookingsMode = 'success' | 'empty' | 'unauthorized' | 'error'

/**
 * 读取当前「我的预约」的数据源模式。
 * 通过 `wx.setStorageSync('CR_MOCK_MY_BOOKINGS_MODE', 'empty')` 可在调试与端到端测试中注入。
 */
export function readMockMyBookingsMode(): MockMyBookingsMode {
  const raw: unknown = wx.getStorageSync(MOCK_MY_BOOKINGS_MODE_STORAGE_KEY)
  const modes: MockMyBookingsMode[] = ['empty', 'unauthorized', 'error']
  return modes.indexOf(raw as MockMyBookingsMode) >= 0 ? (raw as MockMyBookingsMode) : 'success'
}

/** 该资源在该日期该开始时间是否已被预约（已取消的不算占用） */
function isDuplicated(payload: CreateBookingPayload): boolean {
  return isSlotBooked(payload.resourceId, payload.date, payload.startTime)
}

/**
 * 创建预约。
 *
 * 对应 `POST /api/bookings`（技术设计 §3）。用户身份由服务端从登录凭证解析，
 * 因此入参里没有 userId——前端能提交谁的预约，完全取决于带了谁的凭证。
 *
 * @throws {ApiError} 业务校验失败（参数 / 时间 / 资源 / 冲突）、登录态失效或网络异常
 */
export function mockCreateBooking(payload: CreateBookingPayload): Promise<Booking> {
  const mode = readMockBookingMode()

  return new Promise<Booking>((resolve, reject) => {
    setTimeout(() => {
      // 网络异常：与业务失败区分开，页面据此展示「稍后重试」而不是「换个时段」
      if (mode === 'error') {
        reject(new ApiError(ApiErrorCode.NETWORK, '网络连接失败，请检查网络后重试'))
        return
      }

      // 登录态失效：真实后端返回 HTTP 401，此处用同一个客户端错误码表达
      if (mode === 'unauthorized') {
        reject(new ApiError(ApiErrorCode.UNAUTHORIZED, '登录状态已失效，请重新登录'))
        return
      }

      const forced = FORCED_ERRORS[mode]
      if (forced) {
        reject(new ApiError(forced.code, forced.message))
        return
      }

      // ---- 以下为 success 模式下的真实校验 ----

      // 1. 参数与时间合法性（与客户端预校验同一份规则，服务端仍是权威）
      const validation = validateBookingPayload(payload)
      if (!validation.ok) {
        reject(new ApiError(validation.code, validation.message))
        return
      }

      // 2. 资源存在（技术设计 §11 第 2 条）
      const resource = MOCK_RESOURCES.find((item) => item.id === payload.resourceId)
      if (!resource) {
        reject(new ApiError(BOOKING_ERROR_CODE.RESOURCE_NOT_FOUND, '该资源不存在或已下架'))
        return
      }

      // 3. 请求的时段必须在开放范围内，且仍可预约（需求 §4.5 第 5 项、技术设计 §11 第 5 条）
      const slots = buildDefaultSlots(payload.resourceId, payload.date)
      const slot = slots.find(
        (item) => item.startTime === payload.startTime && item.endTime === payload.endTime,
      )
      if (!slot) {
        reject(new ApiError(BOOKING_ERROR_CODE.PARAM, '该时间段不在可预约范围内'))
        return
      }
      if (slot.status !== 'AVAILABLE') {
        reject(
          new ApiError(
            BOOKING_ERROR_CODE.CONFLICT,
            slot.status === 'BOOKED'
              ? '该时间段已被预约，请选择其他时段'
              : '该时间段已过时或不可预约，请选择其他时段',
          ),
        )
        return
      }

      // 4. 同一资源同一时间段不能重复预约（技术设计 §11 第 5 条）
      if (isDuplicated(payload)) {
        reject(new ApiError(BOOKING_ERROR_CODE.CONFLICT, '该时间段已被预约，请选择其他时段'))
        return
      }

      // 写入预约表：此后该时段对后续提交即为「已被预约」，可用时间段也会显示为已约满
      resolve(
        appendMockBooking({
          resourceId: resource.id,
          resourceName: resource.name,
          location: resource.location,
          date: payload.date,
          startTime: payload.startTime,
          endTime: payload.endTime,
          status: 'PENDING',
          createdAt: formatDateTime(new Date()),
        }),
      )
    }, MOCK_BOOKING_DELAY)
  })
}

/**
 * 我的预约列表。
 *
 * 对应 `GET /api/bookings/my`（技术设计 §3）。**入参里没有 userId**——
 * 用户身份由服务端从请求凭证解析，前端能查到谁的预约，完全取决于带了谁的凭证。
 * 这正是需求 §4.6「用户只能看到自己的预约」的落点：过滤发生在服务端，前端无从伪造。
 *
 * 未登录时直接以 `UNAUTHORIZED` 失败而不是返回空列表：
 * 空列表与「查不到」在页面上是同一副样子，用户会以为自己真的没有预约；
 * 而 401 能让页面明确地清掉失效的登录态并引导重新登录。
 *
 * @throws {ApiError} 登录态失效或网络异常
 */
export function mockGetMyBookings(): Promise<Booking[]> {
  const mode = readMockMyBookingsMode()

  return new Promise<Booking[]>((resolve, reject) => {
    setTimeout(() => {
      // 没有凭证时服务端无从判断身份：这与「凭证失效」是同一类结果
      if (!getToken()) {
        reject(new ApiError(ApiErrorCode.UNAUTHORIZED, '登录状态已失效，请重新登录'))
        return
      }

      if (mode === 'error') {
        reject(new ApiError(ApiErrorCode.NETWORK, '网络连接失败，请检查网络后重试'))
        return
      }

      if (mode === 'unauthorized') {
        reject(new ApiError(ApiErrorCode.UNAUTHORIZED, '登录状态已失效，请重新登录'))
        return
      }

      resolve(mode === 'empty' ? [] : listMockBookings())
    }, MOCK_MY_BOOKINGS_DELAY)
  })
}
