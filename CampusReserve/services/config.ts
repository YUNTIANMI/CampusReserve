/**
 * 小程序端运行配置。
 *
 * 这里是 API 根地址的唯一来源，app.ts 的 globalData.baseUrl 引用本文件，
 * services/request.ts 也直接使用本文件，避免出现两处配置。
 *
 * 联调说明：
 * 1. 开发者工具：需在「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、
 *    TLS 版本以及 HTTPS 证书」，否则 http://127.0.0.1 会被拦截。
 * 2. 真机预览：127.0.0.1 指向手机自身，必须改为电脑的局域网 IP，例如
 *    http://192.168.1.10:8080/api，并保证手机与电脑在同一局域网。
 * 3. 后端默认端口 8080，见 backend/src/main/resources/application.yml。
 */

/** 后端 API 根地址（末尾不带斜杠，各接口以 / 开头拼接） */
export const API_BASE_URL = 'http://127.0.0.1:8080/api'

/** 请求超时时间（毫秒） */
export const REQUEST_TIMEOUT = 10000

/** 是否输出请求日志（开发期便于联调排查） */
export const ENABLE_REQUEST_LOG = true
