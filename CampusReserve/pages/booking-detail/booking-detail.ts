/**
 * 预约详情页。
 *
 * Phase 1：建立页面骨架、接收 bookingId 参数、处理参数缺失的异常情况。
 * Phase 7：接入预约详情数据展示。
 * Phase 8：实现取消预约（DELETE /api/bookings/{id}）与状态刷新。
 * Phase 9：二次确认与 toast 改走 utils/feedback.ts，确认框 Promise 化。
 *
 * 八个刻意的设计判断：
 * 1. **数据来源复用 `GET /api/bookings/my` 再按 id 查找**，不新增按 id 直查的接口。
 *    技术设计 §3 的接口清单里没有 `GET /api/bookings/{id}`，本阶段不擅自扩充契约；
 *    而且 `/my` 本来就只返回本人的数据，查不到即等于「不存在或无权访问」——
 *    需求「用户只能看到自己的预约」不需要额外写一遍归属校验。
 *    详见 services/booking.ts 的 `getBookingDetail`。
 * 2. **查不到用 empty 态而不是 error 态**。请求本身是成功的，只是没有这条数据，
 *    重试没有意义；给「重新加载」按钮只会让用户点一次失望一次。
 * 3. **本页不处理登录态**。登录态失效时 `/my` 会失败，本页统一按「查不到」处理；
 *    清掉本地登录态并引导重新登录由「我的预约」页负责（它才是登录后的主入口），
 *    不在每一页重复同一套逻辑。Phase 8 取消失败遇到 401 也照此办理：只提示，不跳登录。
 * 4. **取消后停在本页，不自动返回**（Phase 8）。取消是不可逆的，用户需要亲眼看到
 *    「已取消」这个结果；自动跳走会让人怀疑到底有没有取消成功。
 *    返回上一页时的刷新是自然发生的——「我的预约」的 onShow 每次都重新拉取。
 * 5. **取消必须二次确认**（Phase 8）。原时段一旦释放就可能立刻被别人约走，
 *    不是「取消了还能原样约回来」的操作，一次误触的代价不该由用户承担。
 * 6. **取消中的防重复与提交预约同理**（Phase 8）：一次点击只发一个请求，
 *    期间按钮置灰并显示「取消中…」。
 * 7. **只给「值得重试」的失败以重试机会**（Phase 8）。网络异常保留按钮并给出错误条；
 *    而「该预约已取消 / 已结束」说明页面上的数据已经过期，重试必然失败——
 *    正确做法是直接重新拉详情，把页面刷成真实状态。
 * 8. **「等待确认」与「请求进行中」是两个阶段，各自防重复**（Phase 9）。
 *    确认框 Promise 化后，`await` 期间 `canceling` 尚未置位，
 *    只靠它就拦不住「连点两次弹出两个确认框」。因此另设 `confirming`。
 */
import { cancelBooking, getBookingDetail } from '../../services/booking'
import { ApiError, ApiErrorCode } from '../../services/request'
import {
  BOOKING_ERROR_CODE,
  BOOKING_STATUS_LABELS,
  canCancelBooking,
  resolveBookingStatus,
} from '../../utils/booking'
import { getWeekdayLabel } from '../../utils/date'
import { confirm, toastError, toastInfo, toastNavigateFailed } from '../../utils/feedback'
import type { Booking, BookingStatus } from '../../types/booking'
import type { PageState } from '../../types/page'

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '预约详情加载失败，请稍后重试'

/** 取消失败的兜底文案 */
const FALLBACK_CANCEL_ERROR = '取消失败，请稍后重试'

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

    /** 当前是否允许取消：由派生状态决定，已结束 / 已取消的都不显示按钮（需求 §4.7） */
    canCancel: false,
    /**
     * 确认框是否正在展示（Phase 9）。
     * 与 `canceling` 分开是因为它们是两个阶段：先「等用户确认」，再「发请求」。
     * 没有这个标记的话，Promise 化的确认框在 `await` 期间不会改变 `canceling`，
     * 连点两次就会弹出两个确认框。
     */
    confirming: false,
    /** 取消请求进行中：用于防重复与按钮文案 */
    canceling: false,
    /** 取消失败的原因；与 toast 的区别是它不会消失 */
    cancelError: '',
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
    this.setData({ pageState: 'loading', errorMessage: '', cancelError: '' })

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
      // 已结束的预约会自动派生为 COMPLETED，按钮随之消失——
      // 用派生状态而不是 status 原值，保证与列表页的判断是同一把尺子
      canCancel: canCancelBooking(booking),
      canceling: false,
      cancelError: '',
    })
  },

  /**
   * 点击「取消预约」：先二次确认（见文件头设计判断 5）。
   * 确认框由系统渲染，用户点「再想想」时什么都不做——记录保持原状，也不发请求。
   *
   * Phase 9 改用 `await confirm(...)`：原先「确认后发请求」只能写在 `wx.showModal` 的
   * `success` 回调里；Promise 化后是一条直线。
   * 代价是「等待确认」这段期间 `canceling` 还没被置位，因此需要 `confirming` 补上防重复。
   */
  async onCancel() {
    if (this.data.canceling || this.data.confirming || !this.data.canCancel) {
      return
    }

    this.setData({ confirming: true })
    const confirmed = await confirm({
      title: '取消预约',
      content: '取消后该时间段将释放给其他同学，确定要取消吗？',
      confirmText: '确定取消',
      cancelText: '再想想',
      // 危险操作：确认按钮用红色，让用户在点下去之前意识到这一步不可逆
      danger: true,
    })
    this.setData({ confirming: false })

    if (!confirmed) {
      return
    }
    this.performCancel()
  },

  /** 真正发起取消请求 */
  async performCancel() {
    if (this.data.canceling) {
      return
    }

    this.setData({ canceling: true, cancelError: '' })

    try {
      const updated = await cancelBooking(this.data.bookingId)
      // 服务端返回空（DELETE 的常见实现）时重新拉一次，保证看到的是真实状态
      if (updated) {
        this.renderBooking(updated)
      } else {
        await this.loadDetail()
      }
      toastInfo('已取消')
    } catch (error) {
      this.afterCancelFailure(error)
    } finally {
      this.setData({ canceling: false })
    }
  },

  /** 取消失败：按错误码分流，只有网络类值得原样重试 */
  afterCancelFailure(error: unknown) {
    const apiError = error instanceof ApiError ? error : null
    const code = apiError ? apiError.code : 0
    const message = apiError ? apiError.message : FALLBACK_CANCEL_ERROR

    if (RETRYABLE_CODES.indexOf(code) >= 0) {
      this.setData({ cancelError: message })
      return
    }

    // 查不到该预约（含「不属于当前用户」）：与详情加载失败同一处理，落到 empty 态
    if (code === BOOKING_ERROR_CODE.NOT_FOUND) {
      toastError(message)
      this.setData({ pageState: 'empty' })
      return
    }

    // 状态冲突（已取消 / 已结束）：页面上的数据已经过期，重新拉详情把它刷成真实状态
    if (code === BOOKING_ERROR_CODE.CONFLICT) {
      toastError(message)
      this.loadDetail()
      return
    }

    // 登录态失效：只提示。清态与引导登录由「我的预约」页负责（见文件头设计判断 3）
    toastError(message)
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
      fail: toastNavigateFailed,
    })
  },
})
