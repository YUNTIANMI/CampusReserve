/**
 * 登录态管理（全局状态）。
 *
 * 为什么需要这一层：登录态是跨页面共享的——首页要展示用户信息、资源详情页要判断能否
 * 直接预约、我的预约页要判断是否引导登录。这类状态必须**只有一个真源**，
 * 否则很容易出现「首页显示已登录、详情页仍当成未登录」这类漂移。
 * 本模块就是那个真源：内存态 + 本地缓存 + app.globalData 由它统一维护，
 * 其他模块一律通过本模块读写，不直接碰缓存，也不直接写 globalData。
 *
 * 分层（技术设计 §5 的 Page → Service → API 在登录场景下的体现）：
 *   Page             调 services/auth.ts 的 login() / logout()
 *   Service          负责「调接口」——wx.login 取凭证、向后端换取登录态
 *   Store（本模块）   负责「状态存在哪、怎么恢复」
 *
 * 缓存策略（技术设计 §9）：只缓存必要的两项——登录凭证与用户基础信息；
 * 不缓存任何敏感信息，登出时两项一并清掉。
 */
import type { AuthSession, LoginState, UserInfo } from '../types/user'

/** 登录凭证缓存键 */
export const AUTH_TOKEN_STORAGE_KEY = 'CR_AUTH_TOKEN'

/** 用户信息缓存键 */
export const AUTH_USER_STORAGE_KEY = 'CR_USER_INFO'

/** 内存态：登录态的唯一真源 */
let currentLoginState: LoginState = 'LOGGED_OUT'
let currentUserInfo: UserInfo | undefined
let currentToken = ''

/**
 * 把内存态同步到 app.globalData。
 *
 * globalData 在本项目里是登录态的一个**只读镜像**，方便按小程序惯例读取；
 * 真源始终是上面的内存态。App 实例尚未就绪时静默跳过——
 * 那种情况下内存态依然正确，页面读本模块的取值函数即可。
 */
function syncGlobalData() {
  try {
    const app = getApp<IAppOption>()
    if (!app || !app.globalData) {
      return
    }
    app.globalData.loginState = currentLoginState
    app.globalData.userInfo = currentUserInfo
  } catch {
    /* App 尚未创建（冷启动极早期），跳过；内存态才是真源 */
  }
}

/** 读缓存；key 不存在或值不合法时返回 null */
function readStorage<T>(key: string): T | null {
  try {
    const value = wx.getStorageSync(key)
    if (value === '' || value === undefined || value === null) {
      return null
    }
    return value as T
  } catch {
    return null
  }
}

/** 清除缓存中的登录信息 */
function clearStorage() {
  try {
    wx.removeStorageSync(AUTH_TOKEN_STORAGE_KEY)
    wx.removeStorageSync(AUTH_USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** 当前登录状态 */
export function getLoginState(): LoginState {
  return currentLoginState
}

/** 是否已登录 */
export function isLoggedIn(): boolean {
  return currentLoginState === 'LOGGED_IN'
}

/** 当前用户信息；未登录时为 undefined */
export function getUserInfo(): UserInfo | undefined {
  return currentUserInfo
}

/**
 * 当前登录凭证；未登录时为空串。
 * 后续请求如何带上它（请求头名称等）待 `docs/05_api_contract.md` 确认。
 */
export function getToken(): string {
  return currentToken
}

/**
 * 从本地缓存恢复登录态，App 启动时调用一次。
 *
 * 只有凭证与用户信息**同时**存在、且用户 id 有效时才判为已登录；
 * 任一缺失（例如两次写入之间被中断）一律回到未登录并清掉残留，
 * 避免出现「状态说已登录、但请求没有凭证」这种自相矛盾的情况。
 */
export function restoreSession() {
  const token = readStorage<string>(AUTH_TOKEN_STORAGE_KEY)
  const userInfo = readStorage<UserInfo>(AUTH_USER_STORAGE_KEY)

  if (token && userInfo && typeof userInfo.id === 'number' && userInfo.id > 0) {
    currentToken = token
    currentUserInfo = userInfo
    currentLoginState = 'LOGGED_IN'
  } else {
    clearStorage()
    currentToken = ''
    currentUserInfo = undefined
    currentLoginState = 'LOGGED_OUT'
  }

  syncGlobalData()
}

/** 保存登录会话：写入缓存并切换为已登录 */
export function saveSession(session: AuthSession) {
  try {
    wx.setStorageSync(AUTH_TOKEN_STORAGE_KEY, session.token)
    wx.setStorageSync(AUTH_USER_STORAGE_KEY, session.userInfo)
  } catch {
    /* 缓存写入失败不阻断本次登录：内存态已足够本次会话使用 */
  }

  currentToken = session.token
  currentUserInfo = session.userInfo
  currentLoginState = 'LOGGED_IN'
  syncGlobalData()
}

/** 清除登录态：内存与缓存一并清掉 */
export function clearSession() {
  clearStorage()
  currentToken = ''
  currentUserInfo = undefined
  currentLoginState = 'LOGGED_OUT'
  syncGlobalData()
}
