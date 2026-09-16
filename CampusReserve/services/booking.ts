/**
 * 预约业务接口。
 *
 * 技术设计 §5 约定调用链为 `Page → Service → API`：页面只调用本文件的方法，
 * 不直接使用 services/request.ts，也不自己拼接口路径。
 *
 * 数据来源由 services/config.ts 的 `USE_MOCK_DATA` 决定：
 * 后端业务 API 属于 Phase 10，在此之前切到开发期本地数据源，调用方无感知。
 *
 * Phase 6 实现「创建预约」；Phase 7 追加「我的预约」（GET /api/bookings/my）
 * 与「预约详情」；「取消预约」（DELETE /api/bookings/{id}）属于 Phase 8。
 */
import { getToken } from '../store/auth'
import { BOOKING_ERROR_CODE } from '../utils/booking'
import { USE_MOCK_DATA } from './config'
import { mockCreateBooking, mockGetMyBookings } from './mock-booking'
import { ApiError, request } from './request'
import type { Booking, CreateBookingPayload } from '../types/booking'

/**
 * 创建预约。
 *
 * 对应 `POST /api/bookings`（技术设计 §3），入参为需求 §4.5 的四项：
 * `resourceId` / `date` / `startTime` / `endTime`。
 * 用户身份由服务端从登录凭证解析，请求头带 `Authorization`（同 /api/auth/login 的约定）。
 *
 * 为什么这里不做校验：客户端预校验属于「让用户少等一个来回」的体验优化，由页面在调用前
 * 用 utils/booking.ts 完成；本层是纯传输层，把服务端的判定结果原样交给调用方。
 * 服务端返回失败时 reject 的 `ApiError.code` 即业务错误码，
 * 调用方可据此区分「换个时段」与「稍后重试」——见 utils/booking.ts 的 BOOKING_ERROR_CODE。
 *
 * @throws {ApiError} 参数 / 时间 / 资源 / 冲突等业务失败，或登录态失效、网络异常
 */
export function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  if (USE_MOCK_DATA) {
    return mockCreateBooking(payload)
  }

  const token = getToken()
  return request<Booking>({
    url: '/bookings',
    method: 'POST',
    // 显式列出字段而不是展开 payload：接口契约只认这四项，
    // 避免将来 payload 增加仅前端使用的字段时被误传到服务端。
    data: {
      resourceId: payload.resourceId,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
    },
    header: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

/**
 * 我的预约列表。
 *
 * 对应 `GET /api/bookings/my`（技术设计 §3）。**入参里没有 userId**（与创建预约同理）：
 * 服务端从请求凭证解析用户，返回的自然只会是该用户的预约。
 * 需求 §4.6「用户只能看到自己的预约」因此不需要前端做任何过滤——
 * 前端过滤是假的安全，真正的边界在服务端。
 *
 * 返回**全部状态**的原始列表，不做排序与分组：三个页签（待使用 / 已完成 / 已取消）
 * 属于同一份数据的不同视图，一次请求全量返回后由页面本地切换即可，
 * 每切一次页签都发一次请求只会让用户等、并让「已完成」的派生状态在两次请求之间漂移。
 *
 * @throws {ApiError} 登录态失效或网络异常
 */
export function getMyBookings(): Promise<Booking[]> {
  if (USE_MOCK_DATA) {
    return mockGetMyBookings()
  }

  const token = getToken()
  return request<Booking[]>({
    url: '/bookings/my',
    method: 'GET',
    header: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

/**
 * 单条预约详情。
 *
 * 为什么这里没有 `GET /api/bookings/{id}`：技术设计 §3 的接口清单里没有它，
 * 本阶段不擅自扩充契约。改为复用 `/bookings/my` 再按 id 查找——
 * 除了不新增接口，还有个额外的好处：**天然满足「只能看自己的预约」**。
 * 若新增按 id 直查的接口，服务端就必须再实现一遍归属校验；而 `/my`
 * 本来只返回本人的数据，查不到即等于「不存在或无权访问」，无需额外判断。
 *
 * 代价是每次进详情都会拉一次全量列表。开发期与数据量小的场景无感；
 * 若将来成为瓶颈，正确做法是补一个带归属校验的 `GET /api/bookings/{id}`，
 * 届时只需改本函数内部，调用方不用动（已记入 docs/PROJECT_MEMORY.md 已知问题）。
 *
 * @throws {ApiError} 预约不存在或不属于当前用户（`404001`）、登录态失效、网络异常
 */
export function getBookingDetail(bookingId: number): Promise<Booking> {
  return getMyBookings().then((list) => {
    const found = list.find((item) => item.id === bookingId)
    if (!found) {
      throw new ApiError(BOOKING_ERROR_CODE.NOT_FOUND, '未找到该预约，或它不属于当前用户')
    }
    return found
  })
}
