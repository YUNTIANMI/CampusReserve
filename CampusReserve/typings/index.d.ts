/// <reference path="./types/index.d.ts" />
/// <reference path="../types/global.d.ts" />

/**
 * 全局 App 实例类型。
 * 必须与 app.ts 中 App<IAppOption>({ ... }) 的 globalData 结构保持一致。
 */
interface IAppOption {
  globalData: {
    /** 已登录用户信息；未登录时为 undefined */
    userInfo?: UserInfo
    /** 登录状态，取值见 types/global.d.ts */
    loginState: LoginState
    /** 后端 API 根地址 */
    baseUrl: string
  }
}
