/**
 * 全局 ambient 类型声明。
 *
 * 本文件只保留必须全局可见的声明（App 实例类型）。
 * 业务类型一律放在同目录的模块文件中（api.ts / booking.ts / page.ts / resource.ts / user.ts），
 * 由 types/index.ts 统一出口，使用方显式 import，避免隐式全局耦合。
 *
 * 由 typings/index.d.ts 通过 reference 引入，同时在 tsconfig.json 的 include 范围内。
 */
import type { LoginState, UserInfo } from './user'

declare global {
  /**
   * 全局 App 实例类型。
   * 必须与 app.ts 中 App<IAppOption>({ ... }) 的 globalData 结构保持一致。
   */
  interface IAppOption {
    globalData: {
      /** 已登录用户信息；未登录时为 undefined */
      userInfo?: UserInfo
      /** 登录状态 */
      loginState: LoginState
      /** 后端 API 根地址（来自 services/config.ts） */
      baseUrl: string
    }
  }
}
