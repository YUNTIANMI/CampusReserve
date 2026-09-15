/**
 * 首页。
 *
 * Phase 1：建立页面骨架与到其余核心页面的真实路由入口。
 * Phase 2：在此实现顶部区域、分类入口、热门/推荐资源、下拉刷新等服务端数据展示。
 */
interface NavEntry {
  /** 入口标题 */
  title: string
  /** 入口说明 */
  desc: string
  /** 目标页面路径（含参数） */
  url: string
}

Page({
  data: {
    projectName: 'CampusReserve',
    description: '校园场地预约小程序',
    navEntries: [
      {
        title: '资源列表',
        desc: '按类型筛选自习室 / 研讨室 / 摄影棚 / 球场',
        url: '/pages/resource-list/resource-list',
      },
      {
        title: '资源详情',
        desc: '查看资源信息与可用时间段（示例 id=1）',
        url: '/pages/resource-detail/resource-detail?id=1',
      },
      {
        title: '我的预约',
        desc: '查看待使用 / 已完成 / 已取消的预约',
        url: '/pages/my-bookings/my-bookings',
      },
      {
        title: '预约详情',
        desc: '查看单条预约详情（示例 id=1）',
        url: '/pages/booking-detail/booking-detail?id=1',
      },
    ] as NavEntry[],
  },

  /** 统一导航处理，目标路径由 data-url 提供 */
  onNavigate(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url as string | undefined
    if (!url) {
      return
    }
    wx.navigateTo({
      url,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
