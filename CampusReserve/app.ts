/// <reference path="./typings/index.d.ts" />

import { API_BASE_URL } from './services/config'

App<IAppOption>({
  globalData: {
    userInfo: undefined,
    loginState: 'LOGGED_OUT',
    // API 根地址的唯一来源是 services/config.ts，此处仅为方便读取而透出。
    // 真机预览时需在 config.ts 中改为电脑的局域网 IP（见该文件注释）。
    baseUrl: API_BASE_URL,
  },

  onLaunch() {
    console.log('[CampusReserve] app onLaunch')
  },

  onShow() {
    console.log('[CampusReserve] app onShow')
  },

  onHide() {
    console.log('[CampusReserve] app onHide')
  },
})
