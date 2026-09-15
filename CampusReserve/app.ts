/// <reference path="./typings/index.d.ts" />

import { API_BASE_URL } from './services/config'
import { getLoginState, getUserInfo, restoreSession } from './store/auth'

App<IAppOption>({
  globalData: {
    userInfo: undefined,
    loginState: 'LOGGED_OUT',
    // API 根地址的唯一来源是 services/config.ts，此处仅为方便读取而透出。
    // 真机预览时需在 config.ts 中改为电脑的局域网 IP（见该文件注释）。
    baseUrl: API_BASE_URL,
  },

  onLaunch() {
    // 从本地缓存恢复登录态（技术设计 §9：只缓存必要数据）。
    // 缓存不完整时 store 会统一回到未登录并清掉残留，不会留下「已登录但没有凭证」的状态。
    restoreSession()
    // store 内部已尝试同步 globalData，但 onLaunch 阶段 getApp() 未必可用，
    // 这里用 this 再兜一次，确保 globalData 与 store 不出现两份互相漂移的数据。
    this.globalData.loginState = getLoginState()
    this.globalData.userInfo = getUserInfo()
    console.log('[CampusReserve] app onLaunch')
  },

  onShow() {
    console.log('[CampusReserve] app onShow')
  },

  onHide() {
    console.log('[CampusReserve] app onHide')
  },
})
