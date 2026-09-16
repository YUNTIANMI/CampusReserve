/**
 * 我的预约页。
 *
 * Phase 1：建立页面骨架、三类状态切换与到预约详情的路由。
 * Phase 5：接入登录态——未登录时引导登录（需求 §4.3「查看自己的预约」本身就要求有身份）。
 * Phase 7：接入 GET /api/bookings/my，渲染 BookingCard 并按状态分组展示。
 *
 * 未登录时为什么不连页签一起藏掉：
 * 页签是 Phase 1 的交付物，也是「这个页面能做什么」的信息。未登录用户看到三个状态页签、
 * 再看到一句「登录后查看」，比整页只剩一个按钮更清楚自己在哪里、接下来要做什么。
 * 所以这里只替换下方的内容区。
 *
 * 五个刻意的设计判断：
 * 1. **一次请求全量，页签切换只做本地过滤**。三个页签是同一份数据的不同视图；
 *    每切一次就发一次请求，用户只会觉得卡，而且「已完成」是按当前时刻派生的
 *    （见 utils/booking.ts），两次请求之间它可能漂移。
 * 2. **状态分组用派生状态而不是服务端原值**。服务端只记录显式变更（创建 / 取消），
 *    「时段已经过去了」没有任何人去点一下，但它确实已经不是「待使用」了。
 *    直接读 `status` 会让昨天约的场地今天仍挂在待使用里。
 * 3. **待使用升序、已完成/已取消降序**。待使用里最近要用的一条最该被先看到；
 *    历史则相反，越近的越可能还想点开看（见 utils/booking.ts 的 `selectBookingsByStatus`）。
 * 4. **未登录不发起请求**。没有凭证时服务端无从判断身份，请求必然是 401；
 *    既然页面已经知道未登录，就不该先转一圈 loading 再落到引导上。
 * 5. **登录态失效要真的清掉本地状态**。与详情页提交时同一条原则：
 *    继续保留「已登录」只会让用户反复碰壁。
 */
import { getMyBookings } from '../../services/booking'
import { ApiError, ApiErrorCode } from '../../services/request'
import { clearSession, getLoginState, isLoggedIn } from '../../store/auth'
import { selectBookingsByStatus } from '../../utils/booking'
import type { Booking, BookingStatus } from '../../types/booking'
import type { PageState } from '../../types/page'
import type { LoginState } from '../../types/user'

interface StatusTab {
  /** 预约状态 */
  status: BookingStatus
  /** 展示文案 */
  label: string
}

/** 各页签为空时的补充说明：空态只说「没有」是不够的，要告诉用户那条路怎么走 */
const EMPTY_DESCRIPTIONS: Record<BookingStatus, string> = {
  PENDING: '去首页挑一个场地，选好日期和时间就能预约。',
  COMPLETED: '用过的场地会出现在这里，方便你回头查看。',
  CANCELLED: '取消后的预约会保留在这里，可随时查看。',
}

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '预约加载失败，请稍后重试'

Page({
  data: {
    tabs: [
      { status: 'PENDING', label: '待使用' },
      { status: 'COMPLETED', label: '已完成' },
      { status: 'CANCELLED', label: '已取消' },
    ] as StatusTab[],
    /** 当前选中的状态页签 */
    activeStatus: 'PENDING' as BookingStatus,
    /** 空状态文案，随页签变化（避免在 WXML 中写复杂表达式） */
    emptyText: '暂无待使用的预约',
    /** 空状态补充说明，随页签变化 */
    emptyDescription: EMPTY_DESCRIPTIONS.PENDING,

    /** 登录状态（Phase 5）：未登录时内容区改为登录引导 */
    loginState: 'LOGGED_OUT' as LoginState,
    /** 内容区四态（技术设计 §7） */
    pageState: 'loading' as PageState,
    /** 服务端返回的原始列表，含全部状态 */
    allBookings: [] as Booking[],
    /** 当前页签要展示的列表：已按派生状态过滤并排序 */
    list: [] as Booking[],
    /** 错误态文案 */
    errorMessage: FALLBACK_ERROR,
  },

  /**
   * 每次展示都同步登录态并重新拉取。
   *
   * 为什么要每次都拉：预约状态会随时间和别处的操作变化——
   * 用户在详情页取消了一条、刚提交了一条约、或者某个时段已经过去了。
   * 这一页是「我接下来要做什么」的入口，显示过期数据比多等半秒严重得多。
   */
  onShow() {
    this.refreshLoginState()
    this.loadBookings()
  },

  /** 同步登录态 */
  refreshLoginState() {
    this.setData({ loginState: getLoginState() })
  },

  /** 拉取我的预约；未登录时直接返回，不发请求（见文件头设计判断 4） */
  async loadBookings() {
    if (!isLoggedIn()) {
      this.setData({ pageState: 'loading', allBookings: [], list: [] })
      return
    }

    this.setData({ pageState: 'loading', errorMessage: '' })

    try {
      const all = await getMyBookings()
      this.setData({ allBookings: all })
      this.applyFilter()
    } catch (error) {
      this.handleLoadError(error)
    }
  },

  /** 请求失败：登录态失效单独处理，其余落到可重试的错误态 */
  handleLoadError(error: unknown) {
    const apiError = error instanceof ApiError ? error : null

    if (apiError && apiError.code === ApiErrorCode.UNAUTHORIZED) {
      clearSession()
      this.setData({ loginState: 'LOGGED_OUT', pageState: 'loading', allBookings: [], list: [] })
      wx.showToast({ title: '登录状态已失效，请重新登录', icon: 'none' })
      return
    }

    this.setData({
      pageState: 'error',
      errorMessage: apiError ? apiError.message : FALLBACK_ERROR,
      allBookings: [],
      list: [],
    })
  },

  /** 按当前页签从全量列表中筛出要展示的部分，并决定四态 */
  applyFilter() {
    const list = selectBookingsByStatus(this.data.allBookings, this.data.activeStatus)
    this.setData({
      list,
      pageState: list.length > 0 ? 'success' : 'empty',
    })
  },

  /** 切换状态页签：只重新过滤，不重新请求（见文件头设计判断 1） */
  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status as BookingStatus | undefined
    if (!status || status === this.data.activeStatus) {
      return
    }
    const tab = this.data.tabs.find((item) => item.status === status)
    this.setData({
      activeStatus: status,
      emptyText: `暂无${tab ? tab.label : ''}的预约`,
      emptyDescription: EMPTY_DESCRIPTIONS[status] || '',
    })
    this.applyFilter()
  },

  /** error-state 的重试事件 */
  onRetry() {
    this.loadBookings()
  },

  /** 未登录引导：进入登录页 */
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/login/login',
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },

  /** 点击预约卡片：进入预约详情 */
  onOpenBooking(e: WechatMiniprogram.CustomEvent<{ booking: Booking }>) {
    const booking = e.detail.booking
    if (!booking || !booking.id) {
      return
    }
    wx.navigateTo({
      url: `/pages/booking-detail/booking-detail?id=${booking.id}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
