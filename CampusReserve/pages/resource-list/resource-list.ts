/**
 * 资源列表页。
 *
 * Phase 1：建立页面状态骨架（loading / success / empty / error）与分类参数接收。
 * Phase 3：接入 GET /api/resources，渲染 ResourceCard 与分类筛选，实现下拉刷新。
 *
 * 数据源尚未接入的原因：后端业务 API 属于 Phase 10，Phase 3 再联调。
 */
import type { PageState } from '../../types/page'

Page({
  data: {
    /** 分类筛选参数，由上级页面通过 query 传入，Phase 3 生效 */
    category: '',
    /** 页面状态，四态之一 */
    pageState: 'loading' as PageState,
    /** 错误提示，pageState 为 error 时展示 */
    errorMessage: '',
    /** 示例资源 ID，用于验证到详情页的路由 */
    sampleResourceId: 1,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ category: query.category || '' })
    this.loadResources()
  },

  /**
   * 加载资源列表。
   * TODO(Phase 3)：调用 services/resource.ts 的 getResources({ type: this.data.category })，
   * 并按返回结果设置 pageState 为 success / empty，失败时置为 error 并写入 errorMessage。
   * 当前无数据源，直接落到 empty，避免出现无限 loading。
   */
  loadResources() {
    this.setData({ pageState: 'loading', errorMessage: '' })
    this.setData({ pageState: 'empty' })
  },

  /** ErrorState 的重试事件 */
  onRetry() {
    this.loadResources()
  },

  /** EmptyState 的操作事件：返回上一页，无上一页时回到首页 */
  onEmptyAction() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },

  /** 骨架导航：进入资源详情 */
  onOpenDetail() {
    wx.navigateTo({
      url: `/pages/resource-detail/resource-detail?id=${this.data.sampleResourceId}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
