/**
 * 用户相关类型。
 *
 * 登录流程见 docs/01_requirements.md §4.8（Phase 5 实现）。
 * 仅缓存展示所需的最小字段，禁止缓存敏感信息。
 */

/** 登录状态 */
export type LoginState = 'LOGGED_OUT' | 'LOGGED_IN'

/** 用户基础信息 */
export interface UserInfo {
  id: number
  nickname: string
  avatarUrl?: string
}

/**
 * 登录会话：登录成功后由服务端返回、客户端负责保存的东西。
 *
 * `token` 是后续请求识别用户身份的凭证。具体是放在请求头还是别的形式，
 * 待 `docs/05_api_contract.md` 确定（与 `getResourceDetail` 的「查无此资源 resolve(null)」
 * 约定一样，此处先按最直白的形状约定，契约文件建立时一并确认）。
 */
export interface AuthSession {
  /** 登录凭证 */
  token: string
  /** 用户基础信息 */
  userInfo: UserInfo
}
