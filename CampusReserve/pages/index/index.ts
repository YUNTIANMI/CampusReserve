/**
 * 首页。
 *
 * Phase 2 实现：顶部区域、分类入口、热门资源、推荐资源、四态展示与下拉刷新。
 * Phase 5 追加：用户区（登录入口 + 用户信息展示），登录态变化后即时反映。
 *
 * 数据经由 `services/resource.ts` 获取（调用链 Page → Service → API，技术设计 §5），
 * 后端业务 API 落地前由 services/config.ts 的 `USE_MOCK_DATA` 切到本地数据源。
 *
 * 状态约定（技术设计 §7）：资源区始终处于 loading / success / empty / error 之一，
 * 任何分支都不会停留在 loading，也不会白屏；顶部区域、用户区与分类入口均为静态内容，
 * 即使接口失败也保持可点击，保证首页可用。
 */
import { getResources } from '../../services/resource'
import { ApiError } from '../../services/request'
import { getLoginState, getUserInfo } from '../../store/auth'
import { RESOURCE_TYPE_OPTIONS } from '../../utils/resource'
import type { PageState } from '../../types/page'
import type { Resource } from '../../types/resource'
import type { LoginState } from '../../types/user'

/** 「热门资源」展示条数，其余进入「推荐资源」 */
const HOT_LIMIT = 4

/** 首页一次拉取的资源条数（热门 + 推荐） */
const FETCH_LIMIT = 8

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '资源加载失败，请稍后重试'

/** 未登录时用户区的固定文案 */
const LOGGED_OUT_NAME = '未登录'
const LOGGED_OUT_HINT = '登录后可预约场地'

Page({
  data: {
    /** 顶部区域文案 */
    projectName: 'CampusReserve',
    slogan: '校园场地预约',
    /** 分类入口，来自资源类型常量，顺序即展示顺序 */
    categories: RESOURCE_TYPE_OPTIONS,

    /** 登录状态（Phase 5）：用户区据此在「未登录」与用户信息之间切换 */
    loginState: 'LOGGED_OUT' as LoginState,
    /** 用户区主文案 */
    userName: LOGGED_OUT_NAME,
    /** 用户区副文案 */
    userHint: LOGGED_OUT_HINT,
    /** 用户区头像占位文字（开发期数据源不提供 avatarUrl，见 services/mock-auth.ts） */
    avatarText: '登',

    /** 资源区状态 */
    pageState: 'loading' as PageState,
    /** 错误提示，pageState 为 error 时展示 */
    errorMessage: '',
    /** 热门资源 */
    hotResources: [] as Resource[],
    /** 推荐资源 */
    recommendResources: [] as Resource[],
  },

  onLoad() {
    this.loadResources()
  },

  /**
   * 每次展示都同步一次登录态（Phase 5）。
   *
   * 用户区必须跟随登录态变化：从登录页返回、或在登录页退出后回到首页，都要立刻反映出来。
   * 这里用 onShow 而不是自建事件订阅——页面在返回时本来就会触发 onShow，覆盖所有返回路径，
   * 也比维护一套事件中心简单。
   */
  onShow() {
    this.refreshUserBar()
  },

  /**
   * 把用户区数据与 store 里的登录态对齐。
   * 未登录分支写固定文案而不是留空——留空会看起来像加载失败。
   */
  refreshUserBar() {
    const loginState = getLoginState()
    const userInfo = getUserInfo()

    if (loginState === 'LOGGED_IN' && userInfo) {
      this.setData({
        loginState,
        userName: userInfo.nickname,
        userHint: '已登录，可预约场地',
        avatarText: userInfo.nickname ? userInfo.nickname.slice(0, 1) : '用',
      })
      return
    }

    this.setData({
      loginState: 'LOGGED_OUT',
      userName: LOGGED_OUT_NAME,
      userHint: LOGGED_OUT_HINT,
      avatarText: '登',
    })
  },

  /**
   * 用户区点击：去登录页。
   *
   * 未登录与已登录都进同一个页面——已登录时它同时承担「查看账号信息」与「退出登录」，
   * 因此不再单独做一个「我的」页面。
   */
  onTapUser() {
    this.navigate('/pages/login/login')
  },

  /**
   * 加载首页资源。
   * 四态由本方法统一维护：成功落到 success / empty，失败落到 error，不存在无限 loading。
   */
  async loadResources() {
    this.setData({ pageState: 'loading', errorMessage: '' })

    try {
      const list = await getResources({ limit: FETCH_LIMIT })
      this.renderResources(list)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR
      this.setData({
        pageState: 'error',
        errorMessage: message,
        hotResources: [],
        recommendResources: [],
      })
    }
  },

  /**
   * 渲染资源列表。
   *
   * 热门 / 推荐为前端临时划分：前 `HOT_LIMIT` 条为热门，其余为推荐。
   * `docs/05_api_contract.md` 确定后，若后端提供独立的热门 / 推荐语义（独立接口或排序字段），
   * 只需调整本方法，页面结构与组件无需改动。
   */
  renderResources(list: Resource[]) {
    if (list.length === 0) {
      this.setData({ pageState: 'empty', hotResources: [], recommendResources: [] })
      return
    }

    this.setData({
      pageState: 'success',
      hotResources: list.slice(0, HOT_LIMIT),
      recommendResources: list.slice(HOT_LIMIT),
    })
  },

  /** 下拉刷新：重新拉取数据，完成后必须收起刷新动画 */
  async onPullDownRefresh() {
    await this.loadResources()
    wx.stopPullDownRefresh()
  },

  /** error-state 的重试事件与 empty-state 的操作事件共用 */
  onRetry() {
    this.loadResources()
  },

  /** 分类入口：进入资源列表并带上分类参数 */
  onTapCategory(e: WechatMiniprogram.TouchEvent) {
    const category = e.currentTarget.dataset.category as string | undefined
    if (!category) {
      return
    }
    this.navigate(`/pages/resource-list/resource-list?category=${category}`)
  },

  /** 资源卡片点击：进入资源详情 */
  onTapResource(e: WechatMiniprogram.CustomEvent<{ resource: Resource }>) {
    const resource = e.detail.resource
    if (!resource || !resource.id) {
      return
    }
    this.navigate(`/pages/resource-detail/resource-detail?id=${resource.id}`)
  },

  /** 顶部「我的预约」入口 */
  onOpenMyBookings() {
    this.navigate('/pages/my-bookings/my-bookings')
  },

  /** 「查看全部」入口：进入资源列表（不限定分类） */
  onOpenAllResources() {
    this.navigate('/pages/resource-list/resource-list')
  },

  /** 统一的页面跳转，失败时给出提示而不是静默无反馈 */
  navigate(url: string) {
    wx.navigateTo({
      url,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' })
      },
    })
  },
})
