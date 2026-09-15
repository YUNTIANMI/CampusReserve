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
