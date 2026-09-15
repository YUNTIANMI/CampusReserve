/// <reference path="./typings/index.d.ts" />

App<IAppOption>({
  globalData: {
    userInfo: undefined,
    loginState: 'LOGGED_OUT',
    // 开发者工具中可在「详情 → 本地设置」勾选「不校验合法域名」以便直连本机后端。
    // 真机预览时 127.0.0.1 指向手机自身，需改为电脑的局域网 IP。
    baseUrl: 'http://127.0.0.1:8080/api',
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
