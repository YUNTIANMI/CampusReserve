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

/**
 * 是否使用开发期本地数据源（临时开关，联调后置为 false）。
 *
 * 背景：后端业务 API 属于 Phase 10，前端页面（Phase 2 / Phase 3 / Phase 4）先于后端实现。
 * 若此时直接请求后端，接口一律 404，页面只能落到 error 态，无法验证 success / empty 展示。
 * 因此由 services/mock-resource.ts 提供与 Resource / Availability 类型一致的本地数据，
 * 请求链路（services/resource.ts）与页面代码保持不变，联调时把本开关改为 false 即可切到真实接口。
 *
 * 该开关只决定数据来源，不改变任何页面逻辑。
 */
export const USE_MOCK_DATA = true

/**
 * 开发期数据源模式存储键，取值 'success' | 'empty' | 'error'。
 * 用于调试与端到端测试注入三种响应，缺省为 'success'。
 * 作用于资源列表与资源详情（Phase 4 起也用于详情）。
 */
export const MOCK_MODE_STORAGE_KEY = 'CR_MOCK_MODE'

/**
 * 开发期「可用时间段」数据源模式存储键，取值 'default' | 'full' | 'none' | 'error'。
 *
 * 为什么与 MOCK_MODE_STORAGE_KEY 分开：两者的语义不同——列表/详情的 empty 指「没有资源」，
 * 而时间段的 empty 指「该日期没有时段」，用一个键表达不了
 * 「详情正常但该日期时段为空」这种组合，端到端测试需要分别控制。
 *
 * 取值含义：
 * - `default`：混合状态，任意资源任意日期都同时存在可预约与不可预约时段
 * - `full`：全部时段 `BOOKED`，用于验证「无可选时段时按钮保持禁用」
 * - `none`：该日期没有任何时段，用于验证时间段的空态
 * - `error`：请求失败，用于验证时间段的错误态与重试
 */
export const MOCK_AVAIL_MODE_STORAGE_KEY = 'CR_MOCK_AVAIL_MODE'

/**
 * 开发期「登录」数据源模式存储键，取值 'success' | 'error'。
 *
 * - `success`：默认，模拟登录成功，返回固定用户
 * - `error`：模拟登录失败，用于验证登录页的失败提示与重试
 *
 * 为什么单独一个键：登录失败与「资源接口失败」是两回事，
 * 端到端测试需要在不影响其他数据源的前提下单独把登录打失败。
 */
export const MOCK_AUTH_MODE_STORAGE_KEY = 'CR_MOCK_AUTH_MODE'

/**
 * 开发期「创建预约」数据源模式存储键（Phase 6 追加）。
 *
 * 取值与含义：
 * - `success`：默认，走完整的真实校验（参数 / 资源 / 时段可用性 / 重复预约），
 *   校验通过才写入开发期预约表
 * - `conflict`：强制返回「该时间段已被预约」
 * - `resource-missing`：强制返回「资源不存在」
 * - `invalid-time`：强制返回「非法时间」
 * - `param-error`：强制返回「参数错误」
 * - `unauthorized`：强制返回「登录状态已失效」（对应 HTTP 401）
 * - `error`：请求失败（网络异常），与业务失败区分开
 *
 * 为什么单独一个键：创建预约有六种要分别验证的失败路径，
 * 靠「构造非法入参」只能覆盖参数相关的几种（资源不存在、重复预约、
 * 登录态失效这几种无法从客户端凭据构造），必须由数据源直接注入。
 *
 * 另：开发期「预约记录」本身存在 `CR_MOCK_BOOKINGS` 缓存键里，
 * 见 services/mock-booking-store.ts（端到端测试会直接清掉它以拿到干净状态）。
 */
export const MOCK_BOOKING_MODE_STORAGE_KEY = 'CR_MOCK_BOOKING_MODE'

/**
 * 开发期「我的预约」数据源模式存储键（Phase 7 追加）。
 *
 * 取值与含义：
 * - `success`：默认，返回开发期预约表中的全部记录
 * - `empty`：返回空列表，用于验证三个页签的空态
 * - `unauthorized`：模拟登录态失效（HTTP 401），用于验证「清掉登录态并引导重新登录」
 * - `error`：请求失败（网络异常），用于验证错误态与重试
 *
 * 为什么与 `MOCK_BOOKING_MODE_STORAGE_KEY` 分开：两者是不同接口——
 * 一个管「创建」、一个管「查询」。端到端测试要能表达
 * 「创建成功但列表拉取失败」「列表正常但提交冲突」这类组合，共用一个键就做不到了。
 * 这与既有四个键刻意分开是同一条原则。
 *
 * 注意：该键只影响 `GET /api/bookings/my`；预约详情复用的也是这个接口，因此同样受影响。
 */
export const MOCK_MY_BOOKINGS_MODE_STORAGE_KEY = 'CR_MOCK_MY_BOOKINGS_MODE'

/**
 * 开发期「取消预约」数据源模式存储键（Phase 8 追加）。
 *
 * 取值与含义：
 * - `success`：默认，走完整的真实校验（ID 合法 / 预约存在 / 状态仍可取消），
 *   校验通过才把该条记录改为 `CANCELLED`
 * - `not-found`：强制返回「预约不存在或不属于当前用户」（`404001`），
 *   用于验证客户端无法构造的「归属校验失败」路径——需求 §4.7「不得取消其他用户预约」
 * - `conflict`：强制返回「该预约已结束或已取消」（`409001`），用于验证重复取消的提示
 * - `unauthorized`：强制返回「登录状态已失效」（HTTP 401）
 * - `error`：请求失败（网络异常），用于验证「取消失败后可原样重试」
 *
 * 为什么又一个键：`DELETE /api/bookings/{id}` 与「创建」「查询」是三个不同接口，
 * 端到端测试要能表达「列表正常但取消失败」「取消成功但列表刷新失败」这类组合，
 * 共用一个键就做不到了。这与前面五个键刻意分开是同一条原则。
 */
export const MOCK_CANCEL_MODE_STORAGE_KEY = 'CR_MOCK_CANCEL_MODE'
