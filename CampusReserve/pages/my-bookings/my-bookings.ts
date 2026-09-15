/**
 * 我的预约页。
 *
 * Phase 1：建立页面骨架、三类状态切换与到预约详情的路由。
 * Phase 7：接入 GET /api/bookings/my，渲染 BookingCard 并按状态分组展示。
 * 注意：登录校验属于 Phase 5，本阶段不处理未登录分支。
 */
import type { BookingStatus } from '../../types/booking'

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
