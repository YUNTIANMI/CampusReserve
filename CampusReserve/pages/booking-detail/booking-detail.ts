/**
 * 预约详情页。
 *
 * Phase 1：建立页面骨架、接收 bookingId 参数、处理参数缺失的异常情况。
 * Phase 7：接入预约详情数据展示。
 * Phase 8：实现取消预约（DELETE /api/bookings/{id}）与状态刷新。
 *
 * 三个刻意的设计判断：
 * 1. **数据来源复用 `GET /api/bookings/my` 再按 id 查找**，不新增按 id 直查的接口。
 *    技术设计 §3 的接口清单里没有 `GET /api/bookings/{id}`，本阶段不擅自扩充契约；
 *    而且 `/my` 本来就只返回本人的数据，查不到即等于「不存在或无权访问」——
 *    需求「用户只能看到自己的预约」不需要额外写一遍归属校验。
 *    详见 services/booking.ts 的 `getBookingDetail`。
 * 2. **查不到用 empty 态而不是 error 态**。请求本身是成功的，只是没有这条数据，
 *    重试没有意义；给「重新加载」按钮只会让用户点一次失望一次。
 * 3. **本页不处理登录态**。登录态失效时 `/my` 会失败，本页统一按「查不到」处理；
 *    清掉本地登录态并引导重新登录由「我的预约」页负责（它才是登录后的主入口），
 *    不在每一页重复同一套逻辑。
 */
import { getBookingDetail } from '../../services/booking'
import { ApiError, ApiErrorCode } from '../../services/request'
import { BOOKING_STATUS_LABELS, resolveBookingStatus } from '../../utils/booking'
import { getWeekdayLabel } from '../../utils/date'
import type { Booking, BookingStatus } from '../../types/booking'
import type { PageState } from '../../types/page'

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '预约详情加载失败，请稍后重试'

/**
 * 值得「原样重试」的错误码：只有网络、超时与 HTTP 层故障。
 * 业务码（查不到）与登录态失效重试一万次也是同一个结果，不该给重试按钮。
 */
const RETRYABLE_CODES: number[] = [
  ApiErrorCode.NETWORK,
  ApiErrorCode.TIMEOUT,
  ApiErrorCode.HTTP,
]

Page({
  data: {
    /** 预约 ID，来自页面参数 */
    bookingId: 0,
    /** 参数是否合法；不合法时展示错误状态而不是空白页 */
    hasValidId: false,

    /** 内容区四态（技术设计 §7） */
    pageState: 'loading' as PageState,
    /** 错误态文案 */
    errorMessage: FALLBACK_ERROR,

    /** 资源名称 */
    resourceName: '',
    /** 资源地点 */
    location: '',
    /** 日期文案，如「2026-09-16 周三」 */
    dateLabel: '',
    /** 时间段文案，如「09:00-10:00」 */
    timeLabel: '',
    /** 派生状态 */
    status: 'PENDING' as BookingStatus,
    /** 状态中文名 */
    statusLabel: '',
    /** 状态标签样式后缀 */
    statusModifier: 'pending',
    /** 下单时间 */
    createdAt: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const raw = query.id || ''
    const id = Number(raw)
    const hasValidId = raw !== '' && !Number.isNaN(id)
    this.setData({
      bookingId: hasValidId ? id : 0,
      hasValidId,
    })

    if (hasValidId) {
      this.loadDetail()
    }
  },

  /** 拉取预约详情 */
  async loadDetail() {
    this.setData({ pageState: 'loading', errorMessage: '' })

    try {
      const booking = await getBookingDetail(this.data.bookingId)
      this.renderBooking(booking)
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 0
      // 网络类异常值得原样重试；「查不到」与登录态失效重试也一样没有，落到 empty 态
      if (RETRYABLE_CODES.indexOf(code) >= 0) {
        this.setData({
          pageState: 'error',
          errorMessage: error instanceof ApiError ? error.message : FALLBACK_ERROR,
        })
        return
      }
      this.setData({ pageState: 'empty' })
    }
  },

  /** 把一条预约摊平成展示字段：WXML 不做嵌套取值，避免 booking 为 null 时整片空白 */
  renderBooking(booking: Booking) {
    const status = resolveBookingStatus(booking)
    const weekday = getWeekdayLabel(booking.date)

    this.setData({
      pageState: 'success',
      resourceName: booking.resourceName,
      location: booking.location,
      dateLabel: weekday ? `${booking.date} ${weekday}` : booking.date,
      timeLabel: `${booking.startTime}-${booking.endTime}`,
      status,
      statusLabel: BOOKING_STATUS_LABELS[status],
      statusModifier: status.toLowerCase(),
      createdAt: booking.createdAt,
    })
  },

  /** error-state 的重试事件 */
  onRetry() {
    this.loadDetail()
  },

  /** 参数非法、查不到该预约、error 态兜底时统一作为「返回上一页」使用 */
  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },

  /** empty 态的「返回我的预约」：覆盖直接打开本页（没有上级页面）的情况 */
  onOpenBookings() {
    wx.navigateTo({
      url: '/pages/my-bookings/my-bookings',
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
