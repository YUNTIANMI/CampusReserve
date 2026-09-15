/**
 * 登录页。
 *
 * Phase 5 交付：登录入口的落点、微信一键登录流程、登录状态保存与用户信息展示、
 * 登录失败处理、未登录状态处理（docs/04_development_plan.md Phase 5）。
 *
 * 为什么做成独立页面而不是弹窗：
 * 1. 需求 §5 的页面结构里已经列了 `pages/login`（标注「必要时」）；
 * 2. 弹窗只装得下「去登录」这一个动作，而登录之后还需要一个能查看账号信息、退出登录的
 *    地方——没有退出入口，登录分支就无法验证，登录功能本身也是残缺的；
 * 3. 独立页面才能真正验证「登录失败后可以重试」这条链路。
 *
 * 登录成功后为什么用 navigateBack：
 * 调用方（资源详情页 / 我的预约页）都还在页面栈里，返回即可复用原页面实例——
 * 详情页刚选好的时间段因此不会丢。用 redirectTo 会销毁来源页，把用户的选择一并丢掉。
 *
 * 与四态的关系：登录页的语义是「表单提交」而不是「数据加载」，所以没有 empty 态。
 * loading 由按钮的 submitting 表达；error 是内联提示 + 直接重试，
 * 不用 error-state 组件整页替换——那会连登录按钮一起换掉，用户反而无法重试。
 */
import { login, logout } from '../../services/auth'
import { ApiError } from '../../services/request'
import { getLoginState, getUserInfo } from '../../store/auth'
import type { LoginState, UserInfo } from '../../types/user'

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_ERROR = '登录失败，请稍后重试'

/** 登录成功提示的停留时间（毫秒），留出时间让用户看到提示再返回 */
const BACK_DELAY = 600

/** 取昵称首字做头像占位：开发期数据源不提供 avatarUrl（见 services/mock-auth.ts） */
function nicknameInitial(userInfo: UserInfo): string {
  return userInfo.nickname ? userInfo.nickname.slice(0, 1) : '用'
}

Page({
  data: {
    /** 登录状态 */
    loginState: 'LOGGED_OUT' as LoginState,
    /** 用户信息；未登录时为 null（WXML 里不便处理 undefined） */
    userInfo: null as UserInfo | null,
    /** 头像占位文字 */
    avatarText: '登',
    /** 是否正在登录：控制按钮文案与禁用态 */
    submitting: false,
    /** 登录失败提示；空串表示不展示 */
    errorMessage: '',
  },

  /** 每次展示都重新读一次登录态：登录状态可能在别的页面被改变（如详情页引导登录） */
  onShow() {
    this.refresh()
  },

  /** 把页面数据与 store 中的登录态对齐 */
  refresh() {
    const loginState = getLoginState()
    const userInfo = getUserInfo() || null

    this.setData({
      loginState,
      userInfo,
      avatarText: userInfo ? nicknameInitial(userInfo) : '登',
      // 已登录时清掉失败提示，避免「登录失败 → 重试成功 → 返回再进来还看到旧错误」
      errorMessage: loginState === 'LOGGED_IN' ? '' : this.data.errorMessage,
    })
  },

  /**
   * 微信一键登录。
   *
   * wx.login 本身不需要用户授权，所以点击后直接走完整流程（取凭证 → 换登录态 → 保存）；
   * 任何一步失败都把原因留在页面上，用户可直接再点一次重试。
   */
  async onLogin() {
    if (this.data.submitting) {
      return
    }
    this.setData({ submitting: true, errorMessage: '' })

    try {
      await login()
      this.setData({ submitting: false })
      this.refresh()
      wx.showToast({ title: '登录成功', icon: 'success' })
      // 返回来源页；来源页的 onShow 会自行读到最新登录态
      setTimeout(() => this.back(), BACK_DELAY)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : FALLBACK_ERROR
      this.setData({ submitting: false, errorMessage: message })
    }
  },

  /** 退出登录：二次确认，避免误触把登录态清掉 */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将无法预约场地，确定退出吗？',
      confirmText: '退出',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        logout()
        this.refresh()
        wx.showToast({ title: '已退出登录', icon: 'none' })
      },
    })
  },

  /** 返回来源页；登录页始终是 push 进来的，栈底兜底回首页（与详情页的 onBack 一致） */
  back() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },
})
