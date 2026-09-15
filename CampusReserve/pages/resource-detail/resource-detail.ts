/**
 * 资源详情页。
 *
 * Phase 1：建立页面骨架、接收 resourceId 参数、处理参数缺失的异常情况。
 * Phase 4：接入资源详情与指定日期可用时间段（GET /api/resources/{id} 与 /availability），
 * 实现图片展示、日期选择、TimeSlot 与预约入口。
 */
Page({
  data: {
    /** 资源 ID，来自页面参数 */
    resourceId: 0,
    /** 参数是否合法；不合法时展示错误状态而不是空白页 */
    hasValidId: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const raw = query.id || ''
    const id = Number(raw)
    const hasValidId = raw !== '' && !Number.isNaN(id)
    this.setData({
      resourceId: hasValidId ? id : 0,
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

  /** 骨架导航：进入我的预约（Phase 4 会改为预约成功后跳转） */
  onOpenBookings() {
    wx.navigateTo({
      url: '/pages/my-bookings/my-bookings',
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
