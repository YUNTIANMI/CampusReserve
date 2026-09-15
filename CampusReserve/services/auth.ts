/**
 * 登录业务服务。
 *
 * 职责边界（与 store/auth.ts 的分工）：
 * - 本模块负责「调接口」：先用 wx.login 取一次性凭证，再把凭证交给后端换取登录态；
 * - 拿到结果后交给 store/auth.ts 保存，本模块不直接碰缓存与 globalData。
 *
 * 后端登录接口属于 Phase 10，开发期由 services/mock-auth.ts 顶替，
 * 开关是 services/config.ts 的 `USE_MOCK_DATA`，联调时置为 false 即切到真实接口。
 *
 * 登录流程（docs/01_requirements.md §4.8）：
 *   小程序获取登录凭证 → 后端识别用户 → 返回登录状态 → 保存必要用户信息
 */
import { USE_MOCK_DATA } from './config'
import { mockLogin } from './mock-auth'
import { ApiError, ApiErrorCode, request } from './request'
import { clearSession, saveSession } from '../store/auth'
import type { AuthSession, UserInfo } from '../types/user'

/**
 * 获取微信登录凭证（一次性 code）。
 *
 * wx.login 本身不需要用户授权，因此「一键登录」是可行的；
 * 它失败基本等价于网络或微信服务异常，所以归一化为网络类错误。
 */
function fetchLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code)
          return
        }
        reject(new ApiError(ApiErrorCode.HTTP, '未能获取微信登录凭证，请重试'))
      },
      fail: () => {
        reject(new ApiError(ApiErrorCode.NETWORK, '微信登录失败，请检查网络后重试'))
      },
    })
  })
}

/** 用一次性凭证换取登录态 */
function exchangeSession(code: string): Promise<AuthSession> {
  if (USE_MOCK_DATA) {
    return mockLogin(code)
  }
  return request<AuthSession>({
    url: '/auth/login',
    method: 'POST',
    data: { code },
  })
}

/**
 * 登录：取凭证 → 换取登录态 → 保存。
 *
 * 成功后返回用户信息；失败时抛出 ApiError，调用方只需展示 `error.message`。
 * 三步中任何一步失败都不会留下半截状态（保存只在整个链路成功后发生）。
 */
export async function login(): Promise<UserInfo> {
  const code = await fetchLoginCode()
  const session = await exchangeSession(code)
  saveSession(session)
  return session.userInfo
}

/**
 * 登出：清除本地登录态。
 * Phase 10 接入后端后，这里还应通知服务端使登录态失效；当前只清本地。
 */
export function logout() {
  clearSession()
}
