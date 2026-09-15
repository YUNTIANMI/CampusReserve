/**
 * 资源列表页。
 *
 * Phase 1：建立页面状态骨架（loading / success / empty / error）与分类参数接收。
 * Phase 3：接入资源接口，实现分类筛选、ResourceCard 列表、四态与下拉刷新。
 *
 * 数据经由 `services/resource.ts` 获取（调用链 Page → Service → API，技术设计 §5），
 * 后端业务 API 落地前由 services/config.ts 的 `USE_MOCK_DATA` 切到本地数据源。
 * 筛选不在本地做：真实接口本身就支持按类型筛选，本地过滤会掩盖接口差异。
 *
 * 三个刻意的设计判断：
 * 1. **筛选栏是静态内容，不随四态变化**：与首页一致，接口失败或结果为空时用户仍能
 *    切换分类，避免「一次请求失败就整页不可用」（技术设计 §7「禁止白屏」）。
 * 2. **非法 `category` 归一化为「全部」而非错误态**：详情页缺少 id 就无事可做，但列表页
 *    的筛选条件不满足时页面依然可用，一个脏链接不该把功能全部挡掉。
 * 3. **丢弃过期响应**：快速切换分类时先发的请求可能后返回，若直接渲染会覆盖新筛选的结果。
 *    因此请求返回后比对筛选条件，已变化则丢弃本次结果。
 */
import { getResources } from '../../services/resource'
import { ApiError } from '../../services/request'
import {
  RESOURCE_FILTER_OPTIONS,
  getResourceTypeLabel,
  normalizeResourceType,
} from '../../utils/resource'
import type { PageState } from '../../types/page'
import type { Resource, ResourceType } from '../../types/resource'

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '资源加载失败，请稍后重试'

Page({
  data: {
    /**
     * 当前筛选值，空串表示「全部」。
     * 同时是 URL 中 `category` 参数的归一化结果，对外保持不变。
     */
    category: '' as ResourceType | '',
    /** 筛选项，「全部」在首位 */
    filterOptions: RESOURCE_FILTER_OPTIONS,

    /** 列表区状态，四态之一 */
    pageState: 'loading' as PageState,
    /** 错误提示，pageState 为 error 时展示 */
    errorMessage: '',
    /** 资源列表 */
    resources: [] as Resource[],

    /** 空态主文案，随筛选条件变化 */
    emptyText: '',
    /** 空态补充说明 */
    emptyDescription: '',
    /** 空态操作按钮文案；空串表示不展示按钮 */
    emptyActionText: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const category = normalizeResourceType(query.category)
    this.setData({ category })
    this.applyEmptyCopy(category)
    this.loadResources()
  },

  /**
   * 加载资源列表。
   * 四态由本方法统一维护：成功落到 success / empty，失败落到 error，不存在无限 loading。
   */
  async loadResources() {
    const type = this.data.category
    this.setData({ pageState: 'loading', errorMessage: '' })

    try {
      const list = await getResources({ type })
      // 等待期间用户切换了筛选条件：本次结果已过期，丢弃以免覆盖新筛选的结果
      if (type !== this.data.category) {
        return
      }
      this.renderResources(list)
    } catch (error) {
      if (type !== this.data.category) {
        return
      }
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR
      this.setData({ pageState: 'error', errorMessage: message, resources: [] })
    }
  },

  /** 渲染列表：空结果落到 empty，其余落到 success */
  renderResources(list: Resource[]) {
    if (list.length === 0) {
      this.setData({ pageState: 'empty', resources: [] })
      return
    }
    this.setData({ pageState: 'success', resources: list })
  },

  /**
   * 切换分类筛选并重新加载。
   *
   * 这里用 `=== undefined` 判断而不是真假值：`data-value` 为空串时（「全部」筛选项）
   * `dataset.value` 得到的是 `''`，用 `if (!value)` 会把「全部」直接吞掉。
   */
  onTapFilter(e: WechatMiniprogram.TouchEvent) {
    const raw = e.currentTarget.dataset.value as string | undefined
    if (raw === undefined) {
      return
    }

    const category = normalizeResourceType(raw)
    // 点击当前分类不产生副作用（幂等）；失败后重试有 error-state 的专门入口
    if (category === this.data.category) {
      return
    }

    this.setData({ category })
    this.applyEmptyCopy(category)
    this.loadResources()
  },

  /**
   * 依据筛选条件写入空态文案。
   *
   * 分两种情况：筛选到具体分类却没有数据时，重试不会有结果，「重新加载」是个无效按钮，
   * 因此不给按钮，改为引导用户换分类（筛选栏常驻，切换入口就在上方）。
   */
  applyEmptyCopy(category: ResourceType | '') {
    if (category) {
      this.setData({
        emptyText: `暂无${getResourceTypeLabel(category)}`,
        emptyDescription: '换个分类看看其他资源',
        emptyActionText: '',
      })
      return
    }

    this.setData({
      emptyText: '暂无资源',
      emptyDescription: '暂时没有可预约的资源，可以稍后重试',
      emptyActionText: '重新加载',
    })
  },

  /** 下拉刷新：重新拉取数据，完成后必须收起刷新动画 */
  async onPullDownRefresh() {
    await this.loadResources()
    wx.stopPullDownRefresh()
  },

  /** error-state 的重试事件，与 empty-state 的「重新加载」共用 */
  onRetry() {
    this.loadResources()
  },

  /** 资源卡片点击：进入资源详情 */
  onTapResource(e: WechatMiniprogram.CustomEvent<{ resource: Resource }>) {
    const resource = e.detail.resource
    if (!resource || !resource.id) {
      return
    }
    wx.navigateTo({
      url: `/pages/resource-detail/resource-detail?id=${resource.id}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
