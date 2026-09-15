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
 */
import { getLoginState } from '../../store/auth'
import type { BookingStatus } from '../../types/booking'
import type { LoginState } from '../../types/user'

interface StatusTab {
  /** 预约状态 */
  status: BookingStatus
  /** 展示文案 */
  label: string
}

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
    /** 示例预约 ID，用于验证到详情页的路由 */
    sampleBookingId: 1,

    /** 登录状态（Phase 5）：未登录时内容区改为登录引导 */
    loginState: 'LOGGED_OUT' as LoginState,
  },

  /** 每次展示都同步登录态：用户可能刚在登录页完成登录并返回 */
  onShow() {
    this.refreshLoginState()
  },

  /** 同步登录态 */
  refreshLoginState() {
    this.setData({ loginState: getLoginState() })
  },

  /** 切换状态页签 */
  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status as BookingStatus | undefined
    if (!status || status === this.data.activeStatus) {
      return
    }
    const tab = this.data.tabs.find((item) => item.status === status)
    this.setData({
      activeStatus: status,
      emptyText: `暂无${tab ? tab.label : ''}的预约`,
    })
    // TODO(Phase 7)：按 activeStatus 过滤或重新请求我的预约列表
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

  /** 骨架导航：进入预约详情 */
  onOpenDetail() {
    wx.navigateTo({
      url: `/pages/booking-detail/booking-detail?id=${this.data.sampleBookingId}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
