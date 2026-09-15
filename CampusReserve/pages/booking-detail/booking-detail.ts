/**
 * 预约详情页。
 *
 * Phase 1：建立页面骨架、接收 bookingId 参数、处理参数缺失的异常情况。
 * Phase 7：接入预约详情数据展示。
 * Phase 8：实现取消预约（DELETE /api/bookings/{id}）与状态刷新。
 */
Page({
  data: {
    /** 预约 ID，来自页面参数 */
    bookingId: 0,
    /** 参数是否合法；不合法时展示错误状态而不是空白页 */
    hasValidId: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const raw = query.id || ''
    const id = Number(raw)
    const hasValidId = raw !== '' && !Number.isNaN(id)
    this.setData({
      bookingId: hasValidId ? id : 0,
      hasValidId,
    })
  },

  /** 参数非法时，ErrorState 的按钮作为「返回上一页」使用 */
  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },

  /** 骨架导航：返回我的预约（通常由 navigateBack 完成，此处覆盖直接打开本页的情况） */
  onOpenBookings() {
    wx.navigateTo({
      url: '/pages/my-bookings/my-bookings',
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
