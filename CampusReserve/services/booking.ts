/**
 * 预约业务接口。
 *
 * 技术设计 §5 约定调用链为 `Page → Service → API`：页面只调用本文件的方法，
 * 不直接使用 services/request.ts，也不自己拼接口路径。
 *
 * 数据来源由 services/config.ts 的 `USE_MOCK_DATA` 决定：
 * 后端业务 API 属于 Phase 10，在此之前切到开发期本地数据源，调用方无感知。
 *
 * Phase 6 只实现「创建预约」；「我的预约」（GET /api/bookings/my）属于 Phase 7，
 * 「取消预约」（DELETE /api/bookings/{id}）属于 Phase 8。
 */
import { getToken } from '../store/auth'
import { USE_MOCK_DATA } from './config'
import { mockCreateBooking } from './mock-booking'
import { request } from './request'
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
