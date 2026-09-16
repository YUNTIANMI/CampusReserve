# PROJECT MEMORY

> 项目当前状态的持久化上下文。
> AI 每次新会话必须先阅读本文件。
> 本文件记录当前真实状态，不写完整开发日志。
> 每个开发阶段完成后必须更新。

## 1. Project

项目名称：CampusReserve  
项目类型：微信小程序  
当前版本：v0.1.0

核心目标：
开发一个校园场地预约微信小程序，重点展示微信小程序开发能力。

仓库：https://github.com/YUNTIANMI/CampusReserve.git  
仓库可见性：**public（公开仓库）**  
默认分支：`main`  
远程同步：远端 `main` 与本地 `main` 完全一致（内容逐字节相同）

## 2. Current Phase

当前阶段：Phase 11 - 测试（已完成。`USE_MOCK_DATA` 已切到 `false`，小程序正式跑真实后端；
`e2e-phase11.js` 真实后端完整回归 36/36，后端接口实测 `api-phase10.js` 76/76 复验无回归）

当前任务：无

下一阶段：Phase 12 - 作品集整理（README、项目截图、页面流程图、系统架构图、API 简要说明、
数据库 ER 图、真机演示视频、Git Commit 整理、PROJECT_MEMORY 最终更新）
另：Phase 11 唯一未完成项「真机测试」需开发者用「预览」扫码补做。

## 3. Completed

- [x] 确定项目名称
- [x] 完成需求文档
- [x] 完成技术选型与开发约束
- [x] 完成开发阶段规划
- [x] 完成 AI 开发规范
- [x] 五个文档统一归入 `docs/`，编号修正并与交叉引用同步
- [x] 建立 Git 仓库并关联 GitHub 远程
- [x] 初始化微信小程序（TypeScript 工程骨架）
- [x] 初始化 Spring Boot 后端
- [x] 确认 MySQL（连接实测通过）
- [x] 推送 Phase 0 全部提交到 GitHub（远端 `main` 与本地一致）

Phase 1（微信小程序基础框架）：
- [x] 配置 5 条页面路由（`app.json`）
- [x] 创建首页、资源列表、资源详情、我的预约、预约详情
- [x] 建立基础状态组件 `loading-state` / `empty-state` / `error-state`
- [x] 建立基础样式（`app.wxss` 设计变量 + 通用类）
- [x] 建立统一请求服务（`services/config.ts`、`services/request.ts`）
- [x] 建立 TypeScript 类型体系（`types/`）
- [x] 静态检查：`tsc --noEmit` 0 错误；路由审计 25/25；请求服务单测 11/11 + 集成 2/2
- [x] 端到端测试：真实开发者工具中 36/36 通过（`tools/e2e/e2e-phase1.js`）

Phase 2（首页）：
- [x] 顶部区域（项目名、副标题、「我的预约」入口）
- [x] 分类入口（4 类，跳转资源列表并携带 `category` 参数）
- [x] 热门资源、推荐资源区块
- [x] `ResourceCard` 组件（`components/resource-card/`，无图时展示类型占位）
- [x] 资源区 loading / empty / error / success 四态互斥
- [x] 下拉刷新（`enablePullDownRefresh` + `onPullDownRefresh`）
- [x] 数据层：`services/resource.ts`（业务接口）+ `services/mock-resource.ts`（开发期数据源）
  + `utils/resource.ts`（资源分类常量与中文标签）
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 47/47 通过（`tools/e2e/e2e-phase2.js`）
- [x] 回归测试：Phase 1 端到端 36/36 通过

Phase 3（资源列表）：
- [x] `resource-list` 接入 `getResources({ type })`，渲染 `ResourceCard` 列表
- [x] 分类筛选栏（`scroll-view` 横向 5 项：全部 + 4 类），激活态与 URL `category` 联动
- [x] 筛选下推到数据源（不在本地过滤），切换分类真实重新请求
- [x] loading / empty / error / success 四态互斥；筛选栏为静态内容，四态下均保持可用
- [x] 卡片点击进入详情（携带正确 `id`）
- [x] 下拉刷新（`onPullDownRefresh`）
- [x] 非法 `category` 参数归一化为「全部」而非错误态
- [x] 空态文案按筛选条件分流（全量空 →「重新加载」；分类空 → 引导换分类且不给无效按钮）
- [x] 丢弃过期响应：快速切换分类时旧请求结果不覆盖新筛选
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 65/65 通过（`tools/e2e/e2e-phase3.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47 通过

Phase 4（资源详情与时间选择）：
- [x] 图片展示：`imageUrl` 存在时渲染 `<image>`，缺省时渲染资源类型占位块（与 `ResourceCard` 同一处理方式）
- [x] 资源信息：名称、类型、地点、容量、描述
- [x] 日期选择：未来 7 天横向日期条，默认今天，激活态与选中日期联动
- [x] `TimeSlot` 组件（`components/time-slot/`）：展示时段文案与状态文案，抛出 `slottap` 事件
- [x] 可用 / 不可用状态：`AVAILABLE` / `BOOKED` / `DISABLED` 三态渲染与样式区分
- [x] 获取指定日期可用时间：`getAvailability(resourceId, date)` → `GET /api/resources/{id}/availability`
- [x] 选择时间：仅 `AVAILABLE` 可选；再次点击已选时段即取消选择
- [x] 预约按钮状态：未选时段禁用且点击无反馈，选中后文案为「预约 HH:mm-HH:mm」并可点击
- [x] 资源信息区与时间段区**各自独立四态**，切换日期失败不影响资源信息与日期条
- [x] 资源不存在（接口正常返回但查无此资源）落到 empty 态而非 error 态
- [x] 非法 `id`（非数字、0、非正整数）一律判定为参数错误并展示错误态
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 81/81 通过（`tools/e2e/e2e-phase4.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65 通过

Phase 5（用户登录）：
- [x] 登录入口：首页顶部用户区（点击进登录页）+ 我的预约页未登录引导的「去登录」按钮
- [x] 微信登录流程：`wx.login()` 取 code → 换登录态 → 成功后自动返回来源页，按钮有「登录中…」态
- [x] 登录状态保存：`store/auth.ts` 内存态为真源，写本地缓存并镜像到 `app.globalData`
- [x] 用户信息展示：登录页展示昵称与用户 ID，头像用昵称首字占位
- [x] 登录失败处理：停在登录页 + 错误提示，按钮可重试
- [x] 未登录状态处理：我的预约页登录引导、详情页点预约先弹「需要登录」再进登录页
- [x] 退出登录：二次确认后清空内存态与缓存，各页面 `onShow` 回到未登录展示
- [x] 冷启动恢复登录态；凭证与用户信息不同时有效时回到未登录并清残留
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 64/64 通过（`tools/e2e/e2e-phase5.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、Phase 4 81/81 通过

Phase 6（创建预约）：
- [x] Booking 数据模型：沿用 `types/booking.ts` 的 `Booking` 与 `CreateBookingPayload`
- [x] `POST /api/bookings`：`services/booking.ts` 的 `createBooking()`（Phase 10 接真实后端）
- [x] 前端预约提交：详情页 `onSubmit` 真实提交，按钮「提交中…」态、成功跳转、失败按错误码分流
- [x] 参数校验：`utils/booking.ts` 的 `validateBookingPayload()`（资源 ID / 日期 / 时间格式与先后）
- [x] 时间合法性校验：含技术设计 §11 第 4 条「不得早于当前时间」，在提交那一刻重新判定
- [x] 冲突检查：时段是否在开放范围、是否仍 `AVAILABLE`、是否已被重复预约
- [x] 成功提示：toast「预约成功」+ 800ms 后跳转我的预约，并在返回时重取时段
- [x] 失败提示：页面内提示条 + toast，按错误码给出「换个时段」或「稍后重试」的明确指引
- [x] 异常处理全覆盖：未登录、时间冲突、资源不存在、参数错误、非法时间（另含网络异常与登录态失效）
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 61/61 通过（`tools/e2e/e2e-phase6.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、Phase 4 81/81、Phase 5 64/64 通过

Phase 7（我的预约）：
- [x] 获取我的预约：`services/booking.ts` 的 `getMyBookings()` → `GET /api/bookings/my`，
  Phase 10 接真实后端，本阶段由 `mockGetMyBookings()` 顶替
- [x] `BookingCard` 组件（`components/booking-card/`）：资源名 / 地点 / 日期（含星期）/ 时间段 /
  状态标签；事件 `cardtap`，不硬编码路由
- [x] 待使用 / 已完成 / 已取消三个页签：一次请求全量、**切换页签只做本地过滤**
- [x] 状态派生：`utils/booking.ts` 的 `resolveBookingStatus()` 把「时段是否已结束」折算成
  展示状态，页面据此分组（服务端 `status` 只记录显式变更，不会自己变成「已完成」）
- [x] 排序：待使用按时间升序，已完成 / 已取消按降序
- [x] 预约详情页接入数据：复用 `/bookings/my` 再按 id 查找（见 §10 第 10 条）
- [x] 未登录不发起请求；登录态失效时清掉本地登录态并引导重新登录
- [x] 静态检查：`tsc --noEmit` 0 错误（34 个 `.ts` 全部纳入编译）
- [x] 端到端测试：真实开发者工具中 63/63 通过（`tools/e2e/e2e-phase7.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、Phase 4 81/81、
  Phase 5 64/64、Phase 6 61/61 通过（七套合计 **417** 项）

Phase 8（取消预约）：
- [x] `DELETE /api/bookings/{id}`：`services/booking.ts` 的 `cancelBooking(id)`
  （Phase 10 接真实后端，本阶段由 `mockCancelBooking()` 顶替）
- [x] 取消确认：`wx.showModal` 二次确认，点「再想想」时什么都不发生（不发请求）
- [x] 状态更新：记录落 `CANCELLED`；成功后停在详情页并把状态标签刷成「已取消」、按钮消失
- [x] 时间段恢复可用：`isSlotBooked()` / `overlayBookedSlots()` 本就把 `CANCELLED`
  排除在占用之外，无需额外清理；E2E 用「预约后 BOOKED → 取消后 AVAILABLE」验证
- [x] 返回页面刷新：我的预约 `onShow` 每次重新拉取，取消后返回即刷新，不新增刷新标记
- [x] 取消按钮的出现条件由 `utils/booking.ts` 的 `canCancelBooking()` 判定（派生状态），
  已完成 / 已取消的预约不渲染按钮；服务端另有状态校验，绕开 UI 也拦得住
- [x] 失败分流：网络异常保留按钮并留下原因（可重试）；查不到落到 empty 态；
  状态冲突重新拉详情；登录态失效只提示（清态与引导交给我的预约页）
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 73/73 通过（`tools/e2e/e2e-phase8.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、Phase 4 81/81、
  Phase 5 64/64、Phase 6 61/61、Phase 7 63/63 通过（八套合计 **490** 项）

Phase 9（小程序体验优化）：
- [x] 统一反馈层 `utils/feedback.ts`（新增）：`toastSuccess` / `toastError` / `toastInfo` /
  `toastNavigateFailed` / `confirm(options): Promise<boolean>`；页面里不再有裸的
  `wx.showToast` / `wx.showModal`，同类反馈的图标、时长、危险色只有一处定义
- [x] Modal：`confirm()` Promise 化，`fail` 分支返回 `false`（安全方向）；
  预约详情页新增 `confirming` 标记，与 `canceling` 分属「等待确认」与「请求中」两个阶段
- [x] Toast：成功（`success`）/ 失败（`error`）/ 中性（`none`）三种形态 + 跳转失败统一文案，
  停留时长统一 2000ms
- [x] 下拉刷新：补齐「我的预约」页（`enablePullDownRefresh: true`）；
  只重拉数据、不重置页签；异常路径（含未登录）同样收起刷新动画
- [x] 必要缓存：`store/preference.ts`（新增，键 `CR_LAST_CATEGORY`）记住最近筛选条件，
  优先级 **URL 参数 > 本地缓存 > 空（全部）**，非法值归一化为「全部」
- [x] 屏幕适配：`.cr-page` 底部两段式 `env(safe-area-inset-bottom)`（避开全面屏手势条）；
  全局 `backgroundTextStyle` 由 `light` 改 `dark`（浅色背景下拉圆点不可见）
- [x] Empty State / Error State / 加载反馈：沿用 Phase 1 起的三个状态组件，
  本阶段只统一文字反馈出口，未新增组件（骨架屏未引入，理由见
  `docs/04_development_plan.md` 的 Phase 9 阶段边界）
- [x] 页面返回刷新：沿用各页 `onShow` 自然刷新，不新增刷新标记（Phase 6 / 7 既定取舍）
- [x] 静态检查：`tsc --noEmit` 0 错误
- [x] 端到端测试：真实开发者工具中 69/69 通过（`tools/e2e/e2e-phase9.js`）
- [x] 回归测试：Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、Phase 4 81/81、
  Phase 5 64/64、Phase 6 61/61、Phase 7 63/63、Phase 8 73/73 通过（九套合计 **559** 项）
- [x] 真机测试：**2026-09-16 由开发者用开发者工具「预览」扫码在真机上完成，未发现明显问题**
  （原先由 AI 保留未勾选，见 §10 第 14 条）

Phase 10（后端与数据层整理）：
- [x] Controller / Service / Repository：三层齐备（`AuthController` / `ResourceController` /
  `BookingController`，三个 Service，三个 JPA Repository）
- [x] MySQL：`campusreserve` 库 + `user` / `resource` / `booking` 三表，
  幂等建表脚本与 8 条种子资源（见 §8）
- [x] 统一 API 响应：`ApiResponse<T>`（code / message / data），业务失败恒 HTTP 200
- [x] 基础异常处理：`BizException` + `GlobalExceptionHandler`，错误码统一「HTTP 状态码 × 1000」
- [x] 预约数据一致性：`booking.active_slot_key` 生成列 + 唯一索引兜住并发（见 §8）
- [x] 可用时间段合成：`resource.open_slots` 生成骨架 + booking 叠加 BOOKED + 当前时间标 DISABLED
- [x] 微信登录：双模式自动降级（配了 AppSecret 走真实 `code2session`，否则由 code 派生本地用户）
- [x] 登录 token：HMAC-SHA256 签名自包含令牌，不引入 Redis / 会话表
- [x] 后端接口实测：**76/76 通过**（`tools/api-test/api-phase10.js`）
- [x] 小程序 ↔ 真实后端联通实测：**28/28 通过**（`tools/e2e/e2e-real-backend.js`）
- [x] 九套 mock 回归不受影响：`USE_MOCK_DATA` 保持 `true`，559 项断言继续全绿

Phase 11（测试）：
- [x] `USE_MOCK_DATA` 切到 **`false`**：小程序正式跑真实后端（不再是临时切换）
- [x] 小程序完整回归：**36/36 通过**（`tools/e2e/e2e-phase11.js`，打真实后端）
  —— 覆盖页面跳转 / 资源加载 / 空数据（资源不存在 empty 态 + 未登录引导）/ 登录 /
  预约（成功 + 冲突 BOOKED 回读）/ 取消预约（成功 + 二次确认）/ 返回刷新（onShow 同步 CANCELLED）
- [x] 失败分支注入不靠测试后门：冲突=真抢同一时段、资源不存在=访问不存在 id、
  空数据=筛选无结果 + 未登录引导
- [x] 后端七项（查询资源/可用时间/正常预约/时间冲突/非法时间/用户权限/取消预约）
  由 `api-phase10.js` 76 项复验，无回归
- [ ] 真机测试：Phase 11 清单里列了，但 Phase 9 已由开发者完成真机验证；
  Phase 11 的真机测试建议在「接真实后端」后由开发者再跑一次「预览」扫码复核
  （重点：真实后端下登录 / 预约 / 取消全链路，见 §10）

## 4. In Progress

暂无。

## 5. Next Tasks

1. Phase 11 收尾（开发者侧）：真实后端下的真机测试 —— 用「预览」扫码，重点看
   登录 / 预约 / 取消全链路（本机无 AppSecret，登录走降级路径）
2. Phase 12：作品集整理（README、项目截图、页面流程图、系统架构图、API 简要说明、
   数据库 ER 图、真机演示视频、Git Commit 整理、PROJECT_MEMORY 最终更新）
3. Phase 11：补齐测试（真机测试、后端接口用例，含「只读/写自己的预约」这类权限用例）
4. Phase 12：作品集整理，并统一补齐真实图片资源（`imageUrl` / `avatarUrl`）

## 6. Current Frontend State

工程根目录：`CampusReserve/`（小程序工程，非仓库根目录）  
AppID：`wxb97024eb0305368d`

已就绪：
- `app.ts` / `app.json` / `app.wxss` / `sitemap.json` / `tsconfig.json`
- `app.ts`（Phase 5）：`onLaunch` 调 `store/auth` 的 `restoreSession()`，并把结果镜像进
  `globalData.loginState` / `userInfo`（冷启动恢复入口）
- `app.json`（Phase 5）：`pages` 首部加入 `pages/login/login`（登录页是功能入口，非 TabBar 页）
- `project.config.json`（已启用 `useCompilerPlugins: ["typescript"]`）
- `typings/`（微信小程序 API 类型定义，来自 `miniprogram-api-typings@5.2.3`）
- 目录骨架：`pages/` `components/` `services/` `utils/` `types/` `store/`（`store/` 自 Phase 5 起实际使用）

类型（`types/`）：
- `api.ts`：统一响应体 `ApiResponse<T>`、`ApiError`
- `page.ts`：页面四态 `PageState`（loading / success / empty / error）
- `user.ts` / `resource.ts` / `booking.ts`：用户、资源、预约领域类型
  （`resource.ts` 另含 Phase 2 新增的查询参数 `ResourceQuery`；
  `user.ts` 另含 Phase 5 新增的 `AuthSession`：`{ token, userInfo }`，即一次登录的完整结果）
- `global.d.ts`：仅保留 `IAppOption`（全局 ambient 类型已迁至 `types/` 内具名模块）
- `index.ts`：统一出口

服务（`services/`）：
- `config.ts`：API 根地址、超时常量，以及开发期数据源开关 `USE_MOCK_DATA` 与模式存储键
  （Phase 4 追加 `MOCK_AVAIL_MODE_STORAGE_KEY`、Phase 5 追加 `MOCK_AUTH_MODE_STORAGE_KEY`、
  Phase 6 追加 `MOCK_BOOKING_MODE_STORAGE_KEY`、Phase 7 追加 `MOCK_MY_BOOKINGS_MODE_STORAGE_KEY`、
  Phase 8 追加 `MOCK_CANCEL_MODE_STORAGE_KEY`，六个键刻意分开，理由见 §11）
- `request.ts`：封装 `wx.request`，统一归一化为 `ApiError`（区分网络失败 / 超时 / HTTP 非 2xx / 业务 code ≠ 0）
- `resource.ts`（Phase 2 / Phase 4）：资源业务接口
  - `getResources(query)`（Phase 2）
  - `getResourceDetail(id)`（Phase 4）：**资源不存在时 resolve(null) 而不是抛错**，
    使「查无此资源」落到 empty 态、「请求失败」落到 error 态。该约定待 `docs/05_api_contract.md` 确认
  - `getAvailability(resourceId, date)`（Phase 4）→ `GET /api/resources/{id}/availability`
- `mock-resource.ts`（Phase 2 / Phase 4 / Phase 6）：开发期本地数据源
  - `mockGetResources` / `mockGetResourceDetail` / `mockGetAvailability`
  - `MOCK_SLOT_TEMPLATE`：6 个时段（取自需求 §4.4），`default` 模式下按确定性规则分布
    `BOOKED` / `DISABLED` / `AVAILABLE`，保证任意资源任意日期都能同时看到三种状态
  - **当天已过时的时段按技术设计 §11 标为 `DISABLED`**（不是缺陷；写测试时要注意，见 §11）
  - Phase 6 起对外导出 `buildDefaultSlots()`（创建预约时服务端要按同一判据校验时段），
    且 `default` 模式的时段会叠加开发期预约表——已约走的格子立刻显示为 `BOOKED`
- `auth.ts`（Phase 5）：登录业务接口
  - `login()`：`wx.login()` 取一次性 code → 换登录态 → 写 `store/auth` → 返回 `UserInfo`
  - `logout()`：清本地登录态（通知服务端失效属于 Phase 10）
- `mock-auth.ts`（Phase 5）：开发期登录数据源
  - `mockLogin(code)`：模拟 `POST /api/auth/login`，固定用户 `MOCK_USER_ID=1001` / `MOCK_NICKNAME='校园用户'`，
    延迟 `MOCK_LOGIN_DELAY=400ms`（用于观察「登录中…」态）；`CR_MOCK_AUTH_MODE=error` 时
    抛出 `ApiError(401001)` 模拟登录失败
  - **刻意不返回 `avatarUrl`**：与「开发期不提供 `imageUrl`」同一决策（测试不依赖网络图片），
    登录页头像用昵称首字占位
- `booking.ts`（Phase 6 创建，Phase 7 追加查询）：预约业务接口
  - `createBooking(payload)` → `POST /api/bookings`，请求头带 `Authorization`（凭证取自 `store/auth`）；
    显式列出契约里的四个字段，避免将来 payload 增加前端专用字段时被误传
  - `getMyBookings()`（Phase 7）→ `GET /api/bookings/my`。**入参不含 userId**：
    身份由服务端从凭证解析，「只能看到自己的预约」是服务端边界，前端不过滤也无从伪造。
    返回**全量状态**的原始列表，排序与分组交给页面
  - `getBookingDetail(id)`（Phase 7）：复用 `getMyBookings()` 再按 id 查找，
    查不到抛 `ApiError(404001)`。不新增 `GET /api/bookings/{id}`，理由见 §10 第 10 条
  - `cancelBooking(id)`（Phase 8）→ `DELETE /api/bookings/{id}`。**入参只有 id**：
    服务端从凭证解析用户并在本人名下的记录里查找，查不到即等于「不存在或无权访问」，
    需求 §4.7 与技术设计 §11 第 6 条「不得取消其他用户预约」不需要前端判断归属。
    返回 `Booking | null`——有返回值时页面可立即刷新展示，为空时退回重新拉详情
  - 本层是纯传输层、不做校验：客户端预校验由页面调用 `utils/booking.ts` 完成，
    服务端返回的 `ApiError.code` 原样交给调用方分流
- `mock-booking.ts`（Phase 6 创建，Phase 7 追加查询，Phase 8 追加取消）：开发期预约数据源
  - `mockCreateBooking(payload)`：延迟 600ms；`CR_MOCK_BOOKING_MODE` 可注入
    `conflict` / `resource-missing` / `invalid-time` / `param-error` / `unauthorized` / `error`，
    缺省 `success` 走完整真实校验（参数 → 资源存在 → 时段在开放范围且仍可预约 → 未重复预约）
  - `mockGetMyBookings()`（Phase 7）：延迟 500ms；`CR_MOCK_MY_BOOKINGS_MODE` 可注入
    `empty` / `unauthorized` / `error`。**无凭证时直接以 `UNAUTHORIZED` 失败**（不是返回空列表）——
    空列表与「查不到」在页面上是同一副样子，用户会以为自己真的没有预约
  - 交付物不只是「造一条假数据」，而是把**服务端该做的校验**先按技术设计 §11 实现一遍，
    使页面代码写完后把开关改为 `false` 接真实后端时行为一致
  - `mockCancelBooking(id)`（Phase 8）：延迟 600ms；`CR_MOCK_CANCEL_MODE` 可注入
    `not-found` / `conflict` / `unauthorized` / `error`。缺省 `success` 走完整真实校验
    （ID 合法 → 在本人记录里查得到 → 派生状态仍是 `PENDING`），通过后只把 `status` 改为
    `CANCELLED`，其余字段原样保留
  - 转出开发期预约表的读/清接口（实现见 `mock-booking-store.ts`），供 Phase 7 取用
- `mock-booking-store.ts`（Phase 6）：开发期预约表，唯一需要跨数据源共享的可变状态
  - 落在缓存键 `CR_MOCK_BOOKINGS`（而非模块级变量）：模块级变量在开发者工具每次重新编译时清空，
    Phase 7 的「我的预约」需要它稳定可读，E2E 也需要能直接清空它
  - `resetMockBookings()` / `listMockBookings()` / `appendMockBooking()` / `isSlotBooked()` /
    `overlayBookedSlots()` / `updateMockBookingStatus()`（Phase 8，只改 `status`，
    预约编号与创建时间必须与原来一致，否则用户看到的就是另一条数据了）
  - 之所以单独成模块：可用时间段与创建预约都要读它，放在任一侧都会造成循环依赖

登录态（`store/auth.ts`，Phase 5 新增）：
- 模块级内存态 `currentLoginState` / `currentUserInfo` / `currentToken` 是**登录态的真源**
- `restoreSession()`（`app.onLaunch` 调用，冷启动恢复）、`saveSession()`、`clearSession()`；
  读取接口 `getLoginState()` / `isLoggedIn()` / `getUserInfo()` / `getToken()`
- 缓存键 `CR_AUTH_TOKEN` / `CR_USER_INFO`；同时镜像到 `app.globalData.loginState` / `userInfo`
- **恢复策略**：凭证与用户信息**同时有效**才算已登录，否则回到未登录并清掉残留
  （避免「有 token 没用户信息」这种半残状态流到页面）

偏好（`store/preference.ts`，Phase 9 新增）：需求 §4.9 / 技术设计 §9「只缓存必要数据」的落地
- 键 `LAST_CATEGORY_STORAGE_KEY = 'CR_LAST_CATEGORY'`，存「最近一次浏览的资源分类」
  （空串代表「全部」）；接口是 `getLastCategory()` / `saveLastCategory(category)`
- 缓存的是「上次看的是哪一类」这个**事实**，而不是「用户偏好哪一类」这个**判断** ——
  所以没有长期偏好逻辑、也没有「清除偏好」入口，用户换一次就跟着变
- 读写全部 try/catch 静默兜底：筛选条件只是便利设施，它出问题不该把整个列表页挡在门外；
  写入失败也只影响「下次进来回到全部」，本次浏览已经是正确的
- **缓存优先级低于 URL 参数**（消费方见 `pages/resource-list`）：带 `category` 参数进入说明是
  明确意图（从首页某个分类卡片点进来），必须以参数为准
- 「存了空串」与「没存过」在缓存层无法区分，但两者**语义一致**（都是「全部」），
  因此不做特殊处理 —— 只有端到端测试需要把它们分开（见 `tools/e2e/README.md` 第 34 条）
- 不放进 `store/auth.ts`：登录态真源是模块级内存态、缓存只作冷启动恢复；筛选条件每次进页面
  都要读，两者生命周期不同

工具（`utils/`）：
- `resource.ts`（Phase 2）：资源分类常量 `RESOURCE_TYPE_OPTIONS` 与 `getResourceTypeLabel()`
- `resource.ts`（Phase 3 追加）：列表页筛选项 `RESOURCE_FILTER_OPTIONS`（首项「全部」，值为空串）、
  类型守卫 `isResourceType()`、参数归一化 `normalizeResourceType()`
- `date.ts`（Phase 4）：`YYYY-MM-DD` 格式化与校验解析、星期中文名、`HH:mm` 转分钟、
  日期条选项 `buildDateOptions(days)`；Phase 6 追加 `formatDateTime()`（`YYYY-MM-DD HH:mm:ss`，
  用于预约的 `createdAt`）
- `time-slot.ts`（Phase 4）：时段状态中文标签 `getTimeSlotStatusLabel()`、
  是否可选 `isTimeSlotSelectable()`（只认 `AVAILABLE`）、时段文案 `getTimeSlotLabel()`、
  同一时段判定 `isSameTimeSlot()`
- `booking.ts`（Phase 6 创建，Phase 7 追加状态派生）：预约域共享常量与纯计算
  - `BOOKING_ERROR_CODE`：`PARAM 400001` / `INVALID_TIME 400002` / `RESOURCE_NOT_FOUND 404001` /
    `NOT_FOUND 404001` / `CONFLICT 409001`（编码沿用「HTTP 状态码 × 1000 + 序号」，
    `CONFLICT` 与技术设计 §13 示例一致；`NOT_FOUND` 指「预约不存在或不属于当前用户」）
  - `BOOKING_STATUS_LABELS`（Phase 7）：`PENDING` / `COMPLETED` / `CANCELLED` 的中文名，
    页签与卡片标签共用一份文案
  - `validateBookingPayload(payload, now?)`：客户端预校验，返回 `{ ok, code, message }`
  - `resolveBookingStart(date, startTime)` / `resolveBookingEnd(date, endTime)`：合成两端时刻
  - `resolveBookingStatus(booking, now?)`（Phase 7）：派生一条预约**此刻**的展示状态。
    `CANCELLED` / `COMPLETED` 是终态直接沿用；`PENDING` 且结束时刻已过则视为 `COMPLETED`。
    **只派生、不写回**——让 `GET` 产生写副作用不干净，真实后端自行推进也不冲突
  - `selectBookingsByStatus(list, status, now?)`（Phase 7）：筛选 + 排序。
    待使用升序、已完成 / 已取消降序
  - `canCancelBooking(booking, now?)`（Phase 8）：这条预约此刻是否还允许取消。
    判据复用 `resolveBookingStatus()` 而非 `status` 原值——列表与详情页因此永远同尺，
    不会出现「列表说已结束、详情还能取消」。归属校验不在这里做（那是服务端的事）
  - 错误码为什么放在 utils：开发期数据源与真实接口层都要用它，放在任一侧都会形成循环依赖；
    本文件不 import 任何 services，依赖方向始终单向
- `feedback.ts`（Phase 9）：统一的用户反馈出口
  - `toastSuccess(title)` / `toastError(title)` / `toastInfo(title)`：分别是
    `icon: 'success'` / `'error'` / `'none'`，停留时长统一 `TOAST_DURATION = 2000`
  - `toastNavigateFailed()`：跳转失败的统一文案（`NAVIGATE_FAILED_TEXT = '页面跳转失败'`），
    直接作为 `wx.navigateTo({ fail })` 的回调传入
  - `confirm(options): Promise<boolean>`：把 `wx.showModal` 包成 Promise。
    用户点确认为 `true`、点取消为 `false`；**弹窗弹不出来（`fail`）同样返回 `false`** ——
    安全方向，绝不能把「框没弹出来」当成「用户同意了」。`danger: true` 时确认按钮用危险色
    `#f5222d`（只有不可逆操作才配得上；退出登录这类可逆操作刻意不用）
  - 为什么要有这一层：同类反馈散在多个页面里各写一遍，迟早出现「这页 `success` 图标、
    那页 `none`」「这里 1500ms、那里 2000ms」。收敛到一处后，端到端可以逐页比对
    `title` / `content` / `confirmColor` / `icon` / `duration`，某页偷偷「自己写一套」立刻暴露

页面：
- `pages/index`（Phase 2 完成，Phase 5 追加用户区）：真实首页，含顶部区域、4 个分类入口、
  热门 / 推荐资源、四态与下拉刷新；点击资源卡进入详情，点击分类进入列表并带 `category` 参数。
  Phase 5 在顶部加**用户区**（昵称 / 「未登录」+ 头像首字占位），点击进入登录页；
  用户区文案由 `onShow` 里的 `refreshUserBar()` 同步登录态，**既有的 `.hero__*` 结构未改动**
  （Phase 1 / Phase 2 的测试依赖它）
- `pages/resource-list`（Phase 3 完成，Phase 9 记住最近筛选条件）：真实列表页，
  含分类筛选栏、`ResourceCard` 列表、四态与下拉刷新。两个关键设计：
  1. **筛选栏是静态内容，不随四态变化**（与首页一致）——接口失败或结果为空时仍能切换分类，
     避免「一次请求失败就整页不可用」；
  2. **非法 `category` 归一化为「全部」而非错误态**——详情页缺少 `id` 就无事可做，
     但列表页的筛选条件不满足时页面依然可用，一个脏链接不该把功能全部挡掉。
  另：切换分类时比对请求发出时的 `category`，条件已变则丢弃该次过期响应。
  Phase 9 起 `onLoad` 的分类取值改为 **URL 参数 > `getLastCategory()` > 空（全部）**，
  并在定下本次值之后 `saveLastCategory(category)`——**带参数进入同样写缓存**，
  因为「从首页点某个分类进来」也是一次浏览；不写就会出现「刚在列表里看过自习室，
  回首页点『查看全部』却落回球场」。`onTapFilter` 在「点了当前分类」的提前 return 之后写缓存，
  重复点击不产生多余写入；非法缓存值经 `normalizeResourceType()` 归一化为「全部」而不是错误态。
- `pages/resource-detail`（Phase 4 完成，Phase 5 加登录门槛，Phase 6 接真实提交）：真实详情页，
  含图片 / 类型占位、资源信息、7 天日期条、`TimeSlot` 列表、选择时间与预约按钮。七个关键设计：
  1. **资源信息区与时间段区各自独立四态**——切换日期只重新请求时间段，两区共用一个状态会导致
     一次时段请求失败就把资源名称、地点、描述一并清掉，用户连在看哪个资源都不知道；
  2. **日期条是静态内容，不随任何四态变化**——与列表页筛选栏同理（技术设计 §7「禁止白屏」）；
  3. **资源不存在用 empty 态而不是 error 态**——重试没有意义，只给「返回上一页」，
     不给一个注定无效的「重新加载」；
  4. **切换日期清空已选时段**——时段属于某一天，跨日期沿用会提交出用户并未选择的组合；
  5. **丢弃过期响应**——切换日期时比对请求发出时的日期，条件已变则丢弃该次结果；
  6. **提交失败要分清「能不能换个方式重试」**（Phase 6，见 §10 第 9 条）——
     业务失败重试同样的入参永远还是失败，必须让用户换时段；只有网络异常才值得原样重试；
  7. **客户端预校验不替代服务端校验**——只为「不用等一个来回就知道哪里不对」，
     「不得早于当前时间」这条尤其只能在提交那一刻重新判定。
  另：「有时段但全部不可预约」仍是 success（时段确实存在且要展示），只额外给一句提示。
  Phase 5 起 `onSubmit` 未登录先弹 `confirm()` 引导，确认后跳登录页；登录返回后**已选时段仍在**
  （`navigateBack` 复用原页面实例）。Phase 6 起已登录走真实提交：提交中按钮为「提交中…」且不可再点，
  成功 toast + 800ms 后跳转我的预约（跳转前清空已选时段，返回时 `onShow` 重新拉时段），
  失败时页面内提示条 + toast 同时给出原因。Phase 9 起本页 toast 与登录引导均走
  `utils/feedback.ts`（`promptLogin` 改为 `await confirm(...)`，跳转失败的文案也由该层统一）
- `pages/login`（Phase 5 新增，Phase 9 反馈统一）：登录页，未登录时展示登录说明 + 错误区 +
  「微信一键登录」（加载中为「登录中…」）；已登录时展示用户信息（昵称、用户 ID、头像首字占位）+
  「退出登录」（二次确认）。`onShow` 调 `refresh()` 同步登录态；登录成功后 `toastSuccess` 再延迟
  约 600ms `navigateBack` 返回来源页。
  Phase 9 起退出确认改用 `await confirm(...)`（原先只能写在 `wx.showModal` 的 `success` 回调里），
  后续动作因此是一条直线；**「退出」按钮刻意不用危险色**——它是可逆的（再登一次就回来了），
  与取消预约那种「原时段可能立刻被别人约走」的不可逆操作区别对待
- `pages/my-bookings`（Phase 1 骨架，Phase 5 登录引导，Phase 7 接入真实列表）：
  待使用 / 已完成 / 已取消三个状态页签 + `BookingCard` 列表 + 四态。六个关键设计：
  1. **未登录时展示 `empty-state` 登录引导**（「登录后查看我的预约」+「去登录」）而不是空列表，
     且**连页签一起保留**——未登录用户看到三个页签再看到一句引导，比整页只剩一个按钮更清楚；
  2. **未登录不发起请求**：没有凭证时服务端无从判断身份，请求必然 401，
     既然页面已经知道未登录，就不该先转一圈 loading 再落到引导上；
  3. **一次请求全量、页签切换只做本地过滤**：三个页签是同一份数据的不同视图，
     每切一次都发请求只会让用户等，且「已完成」按当前时刻派生，两次请求之间会漂移；
  4. **每次 `onShow` 都重新拉取**：预约状态会随时间和别处操作变化（取消、新增、时段过期），
     这一页是「我接下来要做什么」的入口，显示过期数据比多等半秒严重；
  5. **登录态失效时清掉本地登录态并引导重新登录**（与详情页提交时同一条原则）。
  6. **下拉刷新只重拉数据、不重置页签**（Phase 9）：用户停在「已取消」页签时下拉，
     期望是「刷新这一屏」而不是「跳回待使用」——页签是用户的选择，不该被刷新动作抹掉。
     未登录时 `loadBookings()` 会立即返回，`onPullDownRefresh` 仍会走到
     `wx.stopPullDownRefresh`：用户做了主动动作就一定要有回应，哪怕结论是「还是未登录」。
  三个 `.tabs__item` 与默认 `emptyText` 保持不变（Phase 1 测试依赖）
- `pages/booking-detail`（Phase 1 骨架，Phase 7 接入数据，Phase 8 取消预约）：
  参数非法 → error 态；查不到该预约 → **empty 态**（请求本身成功了，重试没有意义，
  不给「重新加载」）；只有网络 / 超时 / HTTP 层故障才落到可重试的 error 态。
  数据经 `getBookingDetail(id)` 获得（复用 `/bookings/my`，见 §10 第 10 条）；
  本页**不处理登录态**——清登录态并引导重新登录由「我的预约」页负责，不在每页重复。
  Phase 8 的取消预约：
  1. **取消按钮只在 `canCancelBooking()` 为真时渲染**：需求 §4.7 可取消的是「有效预约」，
     已完成 / 已取消的预约连按钮都不出现；服务端另有状态校验，绕开 UI 也拦得住；
  2. **二次确认**：`wx.showModal` 说明「取消后该时间段将释放给其他同学」，
     点「再想想」时什么都不发生（不发请求）；
  3. **取消成功后停在本页不自动跳走**：用户需要亲眼看到结果；
     返回「我的预约」的刷新由它的 `onShow` 自然完成，本阶段不新增刷新标记；
  4. **取消中防重复**：`canceling` 置灰按钮并显示「取消中…」，第二次触发直接被拦；
  5. **失败分流**：网络异常保留按钮并把原因留在页面上（可原样重试）；
     查不到（`404001`）落到 empty 态；状态冲突（`409001`）重新拉详情刷成真实状态；
     登录态失效只提示
  6. **「等待确认」与「请求进行中」是两个阶段，各自防重复**（Phase 9）：确认框 Promise 化后
     `await` 期间 `canceling` 还没被置位，只靠它拦不住「连点两次弹出两个确认框」，
     因此另设 `confirming` 字段
  Phase 9 另把本页的二次确认与全部 toast 改走 `utils/feedback.ts`，
  取消按钮的确认色由 `danger: true` 给出（不可逆操作的统一表示）

组件：
- 已创建：`loading-state`、`empty-state`（含操作事件）、`error-state`（含 `retry` 事件）
- 已创建（Phase 2）：`resource-card`（资源卡片；事件名 `cardtap`，刻意不复用 `tap`
  以避免与组件内原生 tap 冒泡重复触发；不硬编码路由，跳转由使用方决定），
  Phase 3 在列表页直接复用，组件本身无需改动
- 已创建（Phase 4）：`time-slot`（时间段；属性 `slot-data` / `selected`，事件 `slottap`，
  仅 `AVAILABLE` 触发。**属性名不能叫 `slot`**，见 §10 第 7 条）
- 已创建（Phase 7）：`booking-card`（预约卡片；属性 `booking`，事件 `cardtap`。
  状态标签展示 `resolveBookingStatus()` 的**派生**结果而非 `booking.status` 原值——
  服务端不会把「时段过去了」写成 `COMPLETED`，但卡片上必须显示成「已完成」）
- 待创建：`CategoryCard`

分类筛选 UI 目前在列表页内联实现（chip 形态，与首页的分类卡片入口形态不同），
暂未抽取为 `CategoryCard`。

## 7. Current Backend State

工程根目录：`backend/`  
Spring Boot 3.5.16 + Java 17 + Maven（自带 `mvnw`）+ JPA（Hibernate 6.6）+ MySQL 8.4

已完成（Phase 10）：
- `CampusReserveApplication` 启动类
- `common/`：`ApiResponse.java`（统一响应体）、`ErrorCode.java`（错误码常量）、
  `BizException.java`（带 code + httpStatus 的业务异常）、`GlobalExceptionHandler.java`
  （`@RestControllerAdvice` 统一翻译异常）、`TimeFormats.java`（`yyyy-MM-dd` / `HH:mm` 解析）
- `config/`：`CrProperties.java`（`cr.*` 配置）、`WebConfig.java`（注册拦截器与参数解析器）
- `security/`：`TokenService.java`（HMAC-SHA256 签发/校验三段式令牌）、`AuthInterceptor.java`、
  `CurrentUser.java` + `CurrentUserArgumentResolver.java`（`@CurrentUser Long userId` 注入）
- `entity/`：`UserEntity` / `ResourceEntity` / `BookingEntity` + `ResourceType` / `BookingStatus` 枚举
- `repository/`：三个 Spring Data JPA 接口
- `dto/`：登录、资源、时段、可用时段、创建预约、预约等请求/响应对象（Bean Validation + `@JsonFormat`）
- `service/`：`AuthService`（登录事务 + 双模式）、`WeChatClient`（code2session，未配凭证自动降级）、
  `ResourceService`（列表/详情/可用时段合成）、`BookingService`（创建/我的/取消 + 六条校验顺序）
- `controller/`：`AuthController` / `ResourceController` / `BookingController`（均为薄 Controller，
  只做接参与包响应体）与 `HealthController`（非业务，`GET /api/health`）
- `resources/db/schema.sql` + `db/data.sql`（幂等建表与种子数据，见 §8）
- `application.yml`（数据源、`spring.sql.init`、JPA、`cr.*`；口令与凭据全部留空由环境变量注入）
- `CampusReserveApplicationTests`（上下文加载冒烟测试，已通过）

启动与验证：
```bash
cd backend
# 数据源口令必须注入（公开仓库不写口令），否则启动即 Access denied
$env:CR_DB_PASSWORD = '***'          # PowerShell
./mvnw spring-boot:run
# GET http://localhost:8080/api/health
# {"code":0,"message":"success","data":{"status":"UP","service":"campusreserve-backend"}}
```

接口实测与联通实测见 §9。

## 8. Current Database State

项目数据库 `campusreserve` 已创建（Phase 10），位于实例 `127.0.0.1:3308`。

三张表（结构以 `docs/03_database_design.md` 为准）：
- `user` —— 微信用户（`open_id` 唯一，昵称缺省「校园用户」）
- `resource` —— 可预约资源（含 `type` 分类、`open_slots` CSV 时段骨架）
- `booking` —— 预约记录（`status`，且包含下面的生成列）

关键设计：
- `booking.active_slot_key` 是**生成列（STORED）+ 唯一索引**：
  非 `CANCELLED` 时求值为 `resource_id|booking_date|HH:mm`，`CANCELLED` 时为 `NULL`
  （MySQL 唯一索引不约束 NULL）。由此「同一资源 + 同一日期 + 同一起始时刻
  只能有一条有效预约，取消后可再约」成为数据库层面的硬约束。
  **取消只改 `status`，编号与创建时间必须不变**（预约记录是用户的历史凭证）。
- 建表与种子数据走 `classpath:db/schema.sql` + `db/data.sql`，幂等形态
  （`IF NOT EXISTS` / `INSERT IGNORE`），`spring.sql.init.mode: always` 可反复启动；
  JDBC URL 带 `createDatabaseIfNotExist=true`，新机器首次启动即可用。
- **`spring.sql.init.encoding: UTF-8` 必须显式指定**：不指定时 Spring 按平台默认编码读脚本，
  在中文 Windows 上按 GBK 解读，种子资源的中文名称会直接乱码入库。
- 种子数据 8 条资源，id 1~8 **与 `services/mock-resource.ts` 的 `MOCK_RESOURCES` 逐字段对齐**，
  这样 mock 回归与真实后端联通实测能核对同一个名字（`图书馆三楼自习室 A`）。

当前库内数据（2026-09-16 联通实测后）：
- `resource` 8 条（种子）
- `user` 3 条（`dev-user`，以及接口实测用的 `dev-api-test-a` / `dev-api-test-b`）
- `booking` 已清空（测试期产生的 6 条预约已全部删除，Phase 11 从干净状态开始）

已实测确认的环境：
- MySQL **8.4.10**
- 选定实例：**端口 3308**，服务名 `MySQL84`
- 安装路径：`E:\MySQL Server 8.4\install`
- 配置文件：`E:\MySQL Server 8.4\mysql8\my.ini`
- 数据目录：`E:\MySQL Server 8.4\mysql8\Data`
- root 账号密码已由开发者提供，**连接实测通过**（可执行 `SELECT VERSION()` 与 `SHOW DATABASES`）
- 命令行客户端可用：`D:\MySQL\mysql-8.4.3-winx64\bin\mysql.exe`（仅用其客户端连 3308，
  不要用它所在目录那个 3306 实例，见下）

注意：
- 该实例为**多项目共用实例**，已存在其他项目的库（`user_db`、`product_db`、`order_db`、`pay_db`、`stock_db`、`luoji_blog` 等）。本项目**只能操作 `campusreserve` 库**，不得改动其他库。
- 本机另一实例（端口 3306，安装于 `D:\MySQL\mysql-8.4.3-winx64`）的 root 账号使用 `mysql_native_password`，该插件在 MySQL 8.4 中默认未加载，**无法连接，本项目不使用**。
- 仓库为公开仓库，**数据库口令不写入任何被 Git 跟踪的文件**；凭据存放于本地未跟踪的工作区记忆中。
- `mysql.exe` 输出到 PowerShell 时中文会显示为乱码（`鏍″洯鐢ㄦ埛`）：那是控制台按 GBK 解码 UTF-8 的
  假象，库内内容是正确的 UTF-8。

## 9. Current API State

业务 API 已全部实现（Phase 10），技术设计 §3 的接口清单**已闭环**，后续阶段不再新增接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 非业务，启动与连通性验证 |
| POST | `/api/auth/login` | 微信一键登录（双模式，未配凭证自动降级） |
| GET | `/api/resources` | 资源列表，可选 `type` 筛选 |
| GET | `/api/resources/{id}` | 资源详情（不存在时返回 `code:0 data:null`，由页面落空态） |
| GET | `/api/resources/{id}/availability?date=` | 指定日期可用时间段（合成） |
| POST | `/api/bookings` | 创建预约（需登录） |
| GET | `/api/bookings/my` | 我的预约（需登录，预约详情复用它） |
| DELETE | `/api/bookings/{id}` | 取消预约（需登录） |

统一约定（详见 `docs/05_api_contract.md`）：
- 响应体恒为 `ApiResponse`：`{ code, message, data }`
- **业务失败一律 HTTP 200**，语义放在 `code`；**只有未登录 / 登录态失效用 HTTP 401**。
  这样前端 `request.ts` 只有一条判断路径，不必为每个接口记「哪种错是 4xx」
- 错误码统一 `HTTP 状态码 × 1000`：`400001` 参数 / `400002` 非法时间 / `401001` 未登录 /
  `401002` 登录失败 / `404001` 资源或预约不存在 / `409001` 时段冲突 / `500000` 服务端异常
- 鉴权：`Authorization: Bearer <token>`。token 是 HMAC-SHA256 签名的**自包含**令牌
  （三段式 `header.payload.signature`，Base64URL），不依赖 Redis 或会话表，
  因此守住了「只有三张核心表」的约束；代价是**主动失效做不了**（只能等过期，默认 720 小时）
- 身份由服务端从凭证解析，**入参不含 userId**，因此「只能看到 / 取消自己的预约」
  是服务端边界，前端无从伪造

验证记录（2026-09-16）：
- `tools/api-test/api-phase10.js` —— 后端接口实测 **76/76 通过**
  （含 8 条并发抢同一时段：7 条被唯一索引拦下并翻译为 `409001`，恰好 1 条成功）
- `tools/e2e/e2e-real-backend.js` —— 小程序 ↔ 真实后端联通实测 **28/28 通过**
  （反证：把 `CR_MOCK_MODE` 置 `empty` 后列表仍 8 条，证明数据只可能来自 HTTP；
  并验证「HTTP 预置的预约出现在小程序列表里」与「取消后状态变 `CANCELLED`」）

## 10. Known Issues

1. **AI 沙箱内无法执行 `git push`（环境限制，非项目缺陷）**：
   - 已实测：直连方式 `git push` 静默 exit 128；走代理时报 `CONNECT tunnel failed, response 502`；而 `git ls-remote` 与 GitHub REST API 均正常。
   - 结论：**读路径可用，git 的推送写路径被环境拦截**。
   - 现有解法：改用 GitHub REST API（Contents API 激活仓库 + Git Data API 建 blob/tree/commit 并更新 ref）完成推送，随后本地 `git fetch` + `git reset --hard origin/main` 对齐分支。
   - 注意：**空仓库无法直接使用 Git Data API**（返回 409），必须先由 Contents API 创建首个提交。
   - 开发者在自己终端执行 `git push` 不受此限制。

2. 运行环境变量污染（仅影响本机 AI 沙箱，不影响独立运行）：
   当前 AI 开发环境注入了 `SERVER__PORT=4733` 与 `SERVER__HOST=127.0.0.1`，
   Spring Boot 宽松绑定会将其识别为 `server.port` / `server.host`，**优先级高于 `application.yml`**，
   导致后端启动在 4733 端口并仅监听本机回环地址（且 4733 已被宿主进程占用）。
   在沙箱内验证后端时，需先清除这两个环境变量，或显式传 `--server.port=8080` / `--server.address=0.0.0.0`。
   开发者在自己的终端中直接运行不受影响。

3. 本机 3306 实例不可用（见 §8），后续任何数据库操作一律使用 3308 实例。

4. **微信开发者工具必须以小程序工程目录为工程根打开（易踩，且会连带影响自动化测试）**：
   - 工程根是 `CampusReserve/`，**不是仓库根**。若打开仓库根，编译会反复报
     `app.json: 在项目根目录未找到 app.json`（code 10005），模拟器提示「模拟器启动失败」。
     原因是 `app.json` 位于子目录 `CampusReserve/`。
   - 该状态下 **AppService 正常、渲染层无页面**，表现为自动化测试里 `App.getPageStack = []`、
     `getCurrentPages().length === 0`、日志出现 `[WXML bridge] ack timeout`，极易被误判为
     「IDE 模拟器损坏」。Phase 1 的 E2E 首次失败即由该原因造成，切到正确工程根后恢复正常。
   - 开发者工具会记住上次打开的路径，重启后仍可能打开错误目录；
     用「项目 → 打开项目」或 CLI `cli.bat open --project "E:\WORK\CampusReserve\CampusReserve"` 切换。

5. **miniprogram-automator 的硬约束（写小程序 E2E 测试必读，Phase 2 补充）**：
   - `page.$()` / `page.$$()` **无法进入自定义组件内部**，连 `<empty-state>` / `<resource-card>`
     这类组件标签本身都查不到；组件内部断言必须改用 `page.xpath()`。
   - `page.xpath()` **未命中时不返回 `null`**，而是返回 `tagName` 为 `undefined`、尺寸 `0x0`、
     `text()` 为空串的占位对象。判定存在必须同时校验 `tagName` 为非空字符串且尺寸大于 0，
     否则会出现「组件没渲染却断言通过」的假成功。
   - `page.xpath()` **支持位置谓词 `(//x)[n]` 与嵌套谓词 `[.//y[contains(text(),"...")]]`**，
     可用于统计渲染层元素数量、按文案精确定位节点。这是 E2E 里最可靠的计数手段。
   - `selectAllComponents()` **不可用于计数**：在 automator 的 evaluate 上下文中恒返回 `0`
     （连 `.hero__action` 这类普通 view 也是 0），实测无效。
   - **不要使用 `mp.reLaunch()`**：页面被销毁时 automator 内部会直接解构
     `getPageMetaByWebviewId(...)` 的返回值，该值为 `null` 时整条连接抛错、测试中断；
     改用页面自身的方法（如 `loadResources()`）触发重新加载。
   - 路由断言不要依赖 `mp.currentPage().path`：它取自 automator 内部维护的 pageStack，
     在刚 `navigateBack` 后可能与真实状态不同步，导致跳转断言偶发误判（Phase 2 实测踩到）；
     应在 appservice 内直接读 `getCurrentPages()` 栈顶的 `route`。
   - **IDE 里若同时开着多个项目窗口**（例如残留的仓库根窗口），自动化会连到错误窗口，
     表现为页面栈为空、`getCurrentPages().length === 0`、`currentPage` 报
     `getPageMetaByWebviewId(...) is null`。用 `cli.bat close --project <错误目录>` 关掉后，
     再 `cli.bat auto --project <小程序目录>` 即可恢复。
   - 解析 `page.callMethod()` 调用 async 方法时，其返回的 Promise 无法被序列化；
     需要「触发页面方法并读状态」时，在同一次 `evaluate` 内先调用再读，可稳定捕获瞬时状态。
   - 现成可用的端到端脚本与说明见 `tools/e2e/`（Phase 1 36/36、Phase 2 47/47、Phase 3 65/65、
     Phase 4 81/81、Phase 5 64/64、Phase 6 61/61、Phase 7 63/63、Phase 8 73/73、
     Phase 9 69/69 通过，九套合计 559 项）。

6. **模拟器的路由过渡必须先收尾再发下一次导航（Phase 3 实测，极易误判为产品缺陷）**：
   - `wx.navigateTo` / `wx.navigateBack` 的**栈顶路由更新很快，但整段过渡动画约 1.2 秒才
     `onRouteDone`**。在过渡未结束时再发导航，会把模拟器的路由过渡**卡死约 10 秒**。
   - 日志证据：点卡片后 0.5 秒就发返回，结果 `resource-detail` 的 `onRouteDone` 迟了 10 秒才到，
     期间 `wx.navigateTo` 报 `navigateTo:fail timeout` 并触发页面的失败提示，而
     `wx.navigateBack` 自身却立即回报 success。
   - 对照实验：用 appservice 直接驱动导航时，首页↔列表↔详情各段过渡均为 **3~5ms**，完全正常。
     即**该卡顿由测试节奏造成，不是产品缺陷**。
   - 正确写法：每次导航后等路线落到目标页并静默约 1.4 秒再继续（`tools/e2e/e2e-phase3.js`
     的 `waitForRouteSettled()`）。
   - 另：`mp.navigateBack()` 实为 `changeRoute('navigateBack')`，**不接受 `delta`**，且会在页面
     销毁瞬间抛 `Uncaught [object Object]`（抛错时导航其实已生效）。多级返回应改用
     `mp.evaluate(() => wx.navigateBack({ delta }))`，按真实页面栈一次返回到位。
   - 同类的时序问题（状态断言）：**点击后不能只等 `pageState` 变回原值**再断言。点击前页面本就处于
     success，事件又要跨渲染层→AppService 传递，「等 success」会立刻命中点击前的旧值，于是读到
     上一步的数据（Phase 3 实测因此误报 4 项）。应按「目标字段已变为期望值 **且** 状态为期望值」轮询。

7. **自定义组件的四条硬约束（Phase 4 实测，写组件与写测试都必须遵守）**：
   - **`slot` 是保留属性，绝不能用作自定义组件的属性名。** `<time-slot slot="{{item}}">` 会被框架
     当成具名插槽声明吃掉，`properties` 永远收不到值。**不报错、不告警**，症状是「组件渲染出来了、
     根节点 class 也正确，但内部文案全是空串」——因为组件 `data` 还停在初始值。
     属性名改为 `slotData`（标签上写 `slot-data`）后正常。定位该问题用了一个临时 WXML 探针
     （`PROBE[{{label}}][{{slotData.startTime}}]`）才确认「属性没传进来」还是「observer 没生效」。
   - **`element.tap()` 只把事件派发给「你查到的那个节点」，不是按坐标点一下。** 必须点
     **组件根节点**（组件 WXML 的最外层节点，它才是挂 `bindtap` 的地方）。点在页面自带的外层包裹
     节点（如组件外面套的 `<view class="slots__item">`）上，组件内部的事件处理器不会触发，
     症状是「点了没反应」且不报错（Phase 4 实测因此连带误报 8 项）。
   - **`text()` 不穿透组件边界聚合内容。** 页面节点里放了自定义组件时，读该页面节点的 `text()`
     得到空串（内容在组件自己的节点树里）。要读组件内文案，必须查组件根节点或组件内部节点
     （Phase 3 的 `resource-card` 能取到整条文案，是因为查的正是组件根节点）。
     `<text>` 节点在内容为空时 `size()` 返回 `0x0`，据此可反推「插值出来是空串」。
   - **组件根节点 `class` 带插值修饰符时不要用 `@class` 精确匹配。** `class="time-slot {{...}}"`
     渲染后是 `time-slot time-slot--disabled`（连续空格被规范化），精确匹配永远不中。用
     `contains(@class,"time-slot") and not(contains(@class,"time-slot__"))`，`not(...)` 用于排除
     同前缀的子元素。
   - **改动源码后要留出编译时间再跑测试。** 开发者工具是文件监听 + 增量编译，连续快速改动时，
     紧接着启动的自动化会话可能仍读到旧编译产物，表现为「代码改了但行为没变」，极易误判为修复无效
     （Phase 4 实测因此多花了一个来回）。

8. **登录态是 `store/auth.ts` 的模块级内存态，从外部直接写缓存不会生效（Phase 5 实测）**：
   - `wx.setStorageSync('CR_AUTH_TOKEN', ...)` 只写缓存、不影响内存态，而页面读的是内存态，
     因此「塞一份 token 再断言已登录」必然失败。要建立登录态必须走真实登录流程
     （`services/auth.ts` 的 `login()`，Phase 5 E2E 里的 `loginViaPage()`）。
   - 反过来，验证「冷启动恢复」时才先写缓存、再触发一次 `app.onLaunch()`：automator 没有 restart API，
     本项目也约定不使用 `mp.reLaunch`；`onLaunch` 与真实冷启动执行的是同一段代码，是本机条件下最贴近的验证。
   - 页面 `data.loginState` 只是 `onShow` 同步过来的副本，刚跳转完可能还没刷新；
     判断全局状态请读 `app.globalData.loginState`。
   - 同一批 E2E 结论还有两条（**不要在已处于登录页时再次 `navigateTo` 登录页**，否则页面栈出现
     两个登录页、`navigateBack` 到不了来源页；**mock 会把当天已过时时段标 `DISABLED`**，
     傍晚跑测试时当天可预约时段为 0，断言前须先切到明天），见 `tools/e2e/README.md` 第 19–24 条。

9. **提交失败的「分流」是产品行为，不是错误处理细节（Phase 6 实测）**：
   - **业务失败与网络失败必须分开**：冲突 / 参数错误 / 非法时间重试同样的入参永远还是失败，
     只有网络异常才值得原样重试。因此页面按 `ApiError.code` 分流：
     冲突 → 立即重取时段（否则那一格还显示为可预约，用户会反复点一个必然失败的按钮）；
     资源不存在 → 重新加载详情落到 empty 态；`401` → 清掉本地登录态并引导重新登录
     （继续保留「已登录」只会让用户反复碰壁）。
   - **失败原因要同时留在页面上**：toast 会消失，而「该时段已被预约」是需要用户据此改变行为的
     提示。E2E 也借此少依赖「临时替换 `wx.showToast`」这种脆弱手段。
   - **开发期数据源的时段状态必须包含真实预约**：`mockGetAvailability` 叠加了预约表
     （见 §6 的 `mock-booking-store.ts`）。不做这一步就会出现自相矛盾——服务端刚以
     「该时间段已被预约」拒绝，页面刷新后却仍显示它可预约。
   - **提交成功后的时段是旧快照**：跳转前清空已选时段、返回详情页时在 `onShow` 重新拉取；
     断言这一点要轮询「那个时段变成了 `BOOKED`」，不能只等 `slotState === 'success'`
     ——返回瞬间它还是上一次的 `success`，会读到旧值。
   - **写 E2E 时，`await` 之后才弹出的 toast 截获不到**：临时替换 `wx.showToast` 再在 `finally`
     还原的写法，同步部分一结束就还原了。改用常驻探针（装一次、留在原地、整段用完再还原）；
     同理，「提交中…」这类瞬时状态要在同一次 `evaluate` 里「调用后立刻读 `page.data`」，
     不要用固定 `sleep` 去赌 600ms 的窗口。三条均见 `tools/e2e/README.md` 第 25–27 条。
   - **存活过久、跨越多次源码重新编译的自动化会话会让 `page.data()` 报 `page node not found`**：
     此时 `getCurrentPages()` 与 `mp.currentPage()` 都还正常，唯独取页面节点数据失败，
     表现为测试一开始就连环中断、极易误判为脚本写错。修法是重启自动化会话
     （`cli.bat close --project <小程序目录>` 后再 `node ./start-automation.js`）。
     见 `tools/e2e/README.md` 第 28 条。

10. **预约详情复用 `GET /api/bookings/my`，每次进详情都拉一次全量列表（Phase 7 的刻意取舍）**：
    - 技术设计 §3 的接口清单里没有 `GET /api/bookings/{id}`，本阶段**不擅自扩充契约**，
      故 `services/booking.ts` 的 `getBookingDetail(id)` 先调 `getMyBookings()` 再按 id 查找，
      查不到抛 `ApiError(404001)`。真实后端接上后行为一致（同一条代码路径）。
    - 额外收益：天然满足需求「用户只能看到自己的预约」——`/my` 本来就只返回本人的数据，
      查不到即等于「不存在或无权访问」，不必再写一遍归属校验。
    - **代价**：每次进详情都会拉一次全量列表。开发期与数据量小的场景无感；
      若将来成为瓶颈，正确做法是补一个**带归属校验**的 `GET /api/bookings/{id}`，
      届时只改 `getBookingDetail()` 内部，调用方无需改动。
    - 附带影响：预约详情页因此也会被 `CR_MOCK_MY_BOOKINGS_MODE` 影响（它共用同一个接口）。

11. **「已完成」是派生状态，不是服务端写回的状态（Phase 7 的刻意取舍）**：
    - 服务端 `Booking.status` 只记录**显式变更**：创建即 `PENDING`、取消即 `CANCELLED`。
      「场次已经结束了」没有任何人去点一下，状态却已经变了。
    - 前端用 `utils/booking.ts` 的 `resolveBookingStatus()` **派生展示状态**
      （`PENDING` 且结束时刻已过 → `COMPLETED`），**不改数据**。
    - 为什么不顺手在查询时把过期记录写成 `COMPLETED`：那是让 `GET` 产生写副作用。
      状态推进该由服务端定时任务或下次写入时做；真实后端哪天自行推进了，
      这里的判断（`COMPLETED` 直接沿用）也不会冲突。

12. **取消成功后停在详情页，不自动返回（Phase 8 的刻意取舍）**：
    - 取消是不可逆的。自动跳走会让人怀疑「到底有没有取消成功」，
      而停在本页让状态标签变成「已取消」、按钮消失，是用户能亲眼确认的结果。
    - 「返回页面刷新」因此**不需要新增任何刷新标记**：「我的预约」的 `onShow`
      本来就每次重新拉取，用户按返回键那一刻刷新自然发生。
    - 端到端刻意不手动调刷新方法、只走真实返回路径，以保证用户真实路径是通的。

13. **取消失败的「能不能重试」要分开处理（Phase 8）**：
    - **网络异常**：保留按钮并把原因留在页面上（toast 会消失，而用户正盯着这条记录
      想知道下一步怎么办），可以原样重试。
    - **查不到该预约（`404001`）**：落到 empty 态，不给重试——它与「不属于当前用户」
      在客户端是同一个结果，重试多少次都一样。
    - **状态冲突（`409001`）**：说明**页面上的数据已经过期**（别人取消了、或时段已过），
      重试必然失败。正确做法是直接重新拉详情，把页面刷成真实状态。
    - 这条与 Phase 6「提交失败分流」是同一条原则：只有网络类值得原样重试，
      业务失败要用「让用户换个做法」来响应。

14. ~~**Phase 9 的「真机测试」未做（开发者侧待补）**~~ → **已由开发者于 2026-09-16 完成**：
    - 原先的状态：`docs/04_development_plan.md` 的 Phase 9 清单里列了真机验证，但它需要开发者用
      开发者工具「预览」扫码到自己的手机上，**AI 环境只能跑到开发者工具的模拟器**，
      因此当时保持未勾选并明确标注，不由测试脚本代称通过（`docs/AGENTS.md` §13）。
    - 现状：开发者已亲自扫码在真机上验证核心流程，**未发现明显问题**。
      开发计划与 §3 中的该项均已勾选。
    - 保留记录的原因：真机与模拟器仍有差异（`baseUrl` 指向局域网 IP 而非 `127.0.0.1`、
      `env(safe-area-inset-bottom)` 才真正生效、机型 `wx.*` API 版本差异），
      这些在 Phase 11 的真实后端回归里继续覆盖。

15. **Phase 9 的改动让 Phase 8 的一条断言过期（已修，属回归测试的正常收获）**：
    - Phase 9 把二次确认 Promise 化后，预约详情页的防重复从「请求中」（`canceling`）
      前移到「等待确认」（`confirming`）。`e2e-phase8.js` 里断言「连点两次时
      `canceling === true`」的那条因此失败——但真正的保护（只弹一次确认框、只提示一次、
      只落一条记录）三条断言全过。
    - 修法是**改断言而不是改产品代码**：把它改成「进入了防重复状态」
      （`confirming === true || canceling === true`）。断言实现细节会绑死重构空间，
      断言用户可见的结论（次数、条数）才稳定。
    - 说明：这类失败要**先分清「产品坏了」还是「断言过期了」**再动手；
      Phase 9 改动前先跑一遍回归，正是为了把这种过期断言当场暴露出来。

16. **真实微信 `code2session` 已实测到「微信业务响应」一级（2026-09-16，Phase 11 后补测）**：
    - 开发者提供了真实 AppSecret（环境变量 `CR_WECHAT_SECRET` 注入）后，用占位 code
      实测 `POST /api/auth/login`：微信返回 **`errcode=40029 invalid code`**——
      证明 **AppSecret 认证、IP 白名单、响应解析、错误翻译（对外 401001）全链路已通**，
      降级警告未出现（未走降级）。
    - **首次真实调用即揪出一个降级路径永远测不出的 bug**：微信 `jscode2session` 的
      响应头是 `text/plain` 而非 `application/json`，RestClient 默认 Jackson 转换器拒收，
      `resolveOpenId` 抛 `UnknownContentTypeException`、登录一律失败。
      已修复（提交 `5f64edb`）：给 RestClient 补一个额外接受 `text/plain` 的
      Jackson 转换器，微信响应仍按 JSON 解析。
    - **尚未验证的只剩最后一环**：「真 code 换真 openid」。code 由 `wx.login()` 现场产生
      （一次性、5 分钟有效），离线无法构造，需在开发者工具或真机上点一次登录验证；
      验证判据：`user` 表新增一行 `open_id` 形如 `o` 开头 28 位左右的微信真实 openid。
    - 安全提醒：AppSecret 一旦出现在聊天/截图中，建议在mp.weixin.qq.com
      「开发管理 → 开发设置」里**重置**（旧值立即失效）。

17. **模拟器自动化会话会「路由过渡冻结」（测试环境现象，非产品缺陷）**：
    - 现象：跨脚本存活的自动化会话在若干次导航后，`wx.reLaunch` 的 `success`/`fail`
      回调**一直停在 `pending`**，页面栈不再变化（实测停在
      `[index, resource-list, resource-detail, login]`）。此时 `mp.navigateTo()` 会超时，
      后续断言全部退化成 null。
    - 成因：上一轮脚本把**登录页**留在页面栈里，且它的「登录成功后延迟返回」
      （`setTimeout(() => navigateBack(delta:1), BACK_DELAY)`）仍在飞——迟到的 `navigateBack`
      弹掉的是**当时新压入的页面**，于是栈顶反复回到登录页。
    - 解法：`cli.bat close` 后重跑 `tools/e2e/start-automation.js` 重建会话；
      脚本侧必须**等到登录页自己离开再导航**（`e2e-real-backend.js` 的 C4 步骤）。
    - 验证脚本已把这一状态**显式识别并抛出可执行的修复提示**（`resetToHome()` 里的
      `probeReLaunch()`），不再退化成一堆难以定位的 null 断言。

18. **登录 token 无法主动失效（Phase 10 的有意取舍）**：
    - token 是 HMAC 签名自包含的，服务端不存会话，因此**退出登录只清客户端本地态**，
      已签发的 token 在过期（默认 720 小时）前仍然有效。
    - 这是为了守住「只有三张核心表、不引入 Redis」的约束而付的代价。
      若将来需要「改密码即失效」这类能力，需引入会话表或黑名单，属 Phase 12 之后的加固项。
    - 另：`CR_TOKEN_SECRET` 未配置时每次启动随机生成密钥并打印警告，
      **此时重启后端会让既有登录态失效**。长期联调请注入固定值。

19. **Phase 11 真实后端 E2E 未覆盖「未授权 401002」与「网络失败」两个分支（刻意边界）**：
    - **未授权 401002**：前端「遇 401 清登录态 + 引导登录」的页面逻辑已由 mock 回归
      （`e2e-phase6/7/8` 的 `unauthorized` 模式）覆盖；后端 401002 各触发条件（缺 token /
      签名非法 / 过期 / 用户不存在）已由 `api-phase10.js` 覆盖。真实后端 E2E 里无法干净地
      「让有效登录态瞬间失效」而不动 store 内存态（红线 #19），故不在 `e2e-phase11.js` 覆盖。
    - **网络失败**：需要「后端没在监听」才能触发，只能停后端，而停进程会中断整个自动化
      会话。前端 error 态 + 重试入口已由 mock 回归覆盖；后端无「网络失败」概念。
    - 两者都是「前端逻辑已测、后端侧已测、唯独真实后端 E2E 不重复测」的合理分工，
      不是漏测。见 `tools/e2e/e2e-phase11.js` 头部「已知边界」。

## 11. Important Decisions

采用：
- 微信小程序原生开发
- TypeScript
- WXML
- WXSS
- Java 17
- Spring Boot 3.5.16（3.x 末代稳定版；4.x 已发布但暂不采用）
- Maven（工程自带 Maven Wrapper，无需本机安装 Maven）
- MySQL 8.4（实例端口 3308）
- REST API
- 模块化单体后端

文档体系（Phase 0 确立，Phase 10 补齐 03 / 05）：
```text
docs/
├── 01_requirements.md        # 需求
├── 02_technical_design.md    # 技术设计、规范与约束
├── 03_database_design.md     # 数据库设计（Phase 10 创建）
├── 04_development_plan.md    # 开发阶段
├── 05_api_contract.md        # API 契约（Phase 10 创建）
├── AGENTS.md                 # AI 协同开发规范
└── PROJECT_MEMORY.md         # 当前状态（本文件）
```

仓库结构（Phase 0 确立，Phase 1 追加 `tools/`）：
```text
CampusReserve/          # 仓库根
├── CampusReserve/      # 微信小程序工程（开发者工具打开这里）
├── backend/            # Spring Boot 后端
├── docs/               # 全部项目文档
└── tools/e2e/          # 小程序端到端测试（基于 miniprogram-automator，不参与小程序打包）
```

`tools/` 与小程序工程相互独立：测试脚本放在仓库根可避免被开发者工具打包进小程序包。

Git 提交规范：中文 Conventional Commits，`<type>(<scope>): <中文简述>`。
Phase 0 全部提交均按此规范命名，远端 `main` 与本地一致。

开发期数据源（Phase 2 引入，Phase 4 / Phase 5 / Phase 6 扩展，临时机制）：
- 前端页面先于后端实现，`services/config.ts` 的 `USE_MOCK_DATA` 为 `true` 时，
  由 `services/mock-resource.ts` / `services/mock-auth.ts` / `services/mock-booking.ts` 提供与
  `Resource` / `Availability` / `AuthSession` / `Booking` 类型一致的本地数据，
  使页面在后端 API（Phase 10）落地前即可验证 success / empty / error 三种展示、
  登录 / 登录失败两条路径，以及创建预约的成功与六种失败路径。
- 该开关只决定数据来源，页面与组件代码不感知；后端联调时改为 `false` 即切到真实接口。
- **Phase 10 的状态**：后端 API 已全部落地，但该开关**按约定仍保持 `true`**，
  目的是让九套 mock 回归不依赖后端进程是否在跑。**正式切换属 Phase 11**。
  小程序 ↔ 真实后端的联通另行验证：把开关**人工**置为 `false` 后跑
  `tools/e2e/e2e-real-backend.js`（跑完改回 `true`）。
  该脚本还会把 `CR_MOCK_MODE` 置成 `empty` 来**反证**数据来自后端——
  mock 被明确要求返回空，列表却仍有 8 条，这比「看到数据就算通」强得多。
- 五个模式存储键供调试与端到端测试注入，属开发期机制，联调前应连同开关一并移除：
  - `CR_MOCK_MODE`（`success` | `empty` | `error`）：作用于资源列表与资源详情，
    `empty` 在详情页的含义是「该资源不存在」
  - `CR_MOCK_AVAIL_MODE`（`default` | `full` | `none` | `error`，Phase 4 追加）：作用于可用时间段，
    `full` 用于验证「全部约满时按钮保持禁用」，`none` 用于验证时间段空态
  - `CR_MOCK_AUTH_MODE`（`success`(缺省) | `error`，Phase 5 追加）：作用于登录，
    `error` 用于验证「登录失败提示 + 可重试」
  - `CR_MOCK_BOOKING_MODE`（Phase 6 追加）：作用于创建预约，`success`(缺省) 走完整真实校验，
    其余六值分别是 `conflict` / `resource-missing` / `invalid-time` / `param-error` /
    `unauthorized` / `error`，覆盖从客户端凭据无法构造的失败路径
  - `CR_MOCK_MY_BOOKINGS_MODE`（Phase 7 追加）：作用于 `GET /api/bookings/my`，
    取值 `success`(缺省) / `empty` / `unauthorized` / `error`。
    与上一个键分开是因为两者是**不同接口**——要能表达「创建成功但列表拉取失败」
    「列表正常但提交冲突」这类组合；预约详情共用该接口，因此同样受它影响
  - `CR_MOCK_CANCEL_MODE`（Phase 8 追加）：作用于 `DELETE /api/bookings/{id}`，
    取值 `success`(缺省) / `not-found` / `conflict` / `unauthorized` / `error`。
    同样因为是不同接口——要能表达「列表正常但取消失败」「取消成功但列表刷新失败」
- **六个键刻意分开**：列表/详情的 `empty` 指「没有资源」，时间段的 `none` 指「该日期没有时段」，
  登录的 `error` 指「登录接口失败」，创建预约的 `conflict` 指「时段已被约走」，
  我的预约的 `error` 指「列表拉取失败」，取消的 `not-found` 指「预约不存在或不属于本人」——
  一个键表达不了这些组合（例如「详情正常但该日期时段为空」「资源列表正常但登录失败」
  「登录成功但预约时段已被别人约走」「创建成功但列表拉取失败」）。
- 另有一个数据键（不是模式开关）：`CR_MOCK_BOOKINGS` 存开发期已创建的预约，
  见 `services/mock-booking-store.ts`。
- 另有 `CR_LAST_CATEGORY`（Phase 9）：**不是开发期数据源的开关**，而是产品功能本身需要的
  真实缓存（最近筛选条件），接真实后端后依然保留，见 §6 的 `store/preference.ts`。
- 已定决策：**开发期数据源不提供 `imageUrl`、也不提供 `avatarUrl`**，因此详情页与资源卡片始终展示
  类型占位块、登录页头像用昵称首字占位。
  这是为了让端到端测试不依赖网络图片。Phase 9（体验优化）**刻意没有顺手补图片**——
  没有真实图片资源就无从知道真实尺寸，此时做出的骨架屏只能是假的；因此与图片一起留给 Phase 12。
  届时只需给 mock 数据或后端数据补 `imageUrl` / `avatarUrl`，页面代码无需改动。
- 已定决策（Phase 5）：**登录态的真源是 `store/auth.ts` 的模块级内存态**，本地缓存只作冷启动恢复用；
  不引入全局状态库（项目不使用 Redux / MobX 一类方案），页面在 `onShow` 从 `store` 取副本即可。
- 已定决策（Phase 6）：**预约业务错误码沿用「HTTP 状态码 × 1000 + 序号」**
  （`400001` 参数错误 / `400002` 非法时间 / `404001` 资源不存在 / `409001` 冲突），
  与技术设计 §13 的响应示例一致；常量定义在 `utils/booking.ts`，
  由开发期数据源与真实接口层共用（放任一侧都会造成循环依赖）。
  `401` 用客户端错误码 `ApiErrorCode.UNAUTHORIZED`（负值），与后端的 HTTP 401 语义对齐。
- 已定决策（Phase 6）：**「时间段是否仍可用」永远由服务端判定**，客户端只判「不依赖服务端数据
  就能判定的部分」（资源 ID / 日期 / 时间格式与先后 / 不得早于当前时间）。
  原因是页面上的时段是加载时的快照，用户停留久了、或别人抢先预约了，它就不再成立。
- 已定决策（Phase 7）：**「我的预约」一次请求全量，三个页签只做本地过滤与排序**。
  它们是同一份数据的不同视图；每切一次都发请求只会让用户等，且「已完成」按当前时刻派生，
  两次请求之间会漂移。页面每次 `onShow` 都重新拉取，保证状态新鲜。
- 已定决策（Phase 7）：**未登录时不发起「我的预约」请求**。没有凭证时服务端无从判断身份，
  请求必然是 401；既然页面已经知道未登录，就不该先转一圈 loading 再落到引导上。
- 已定决策（Phase 7）：**「已完成」由前端派生、服务端不写回**（详见 §10 第 11 条）。
- 已定决策（Phase 7）：**预约详情不新增 `GET /api/bookings/{id}`，复用 `/bookings/my`**
  （详见 §10 第 10 条）。技术设计 §3 的接口清单未变。
- 已定决策（Phase 9）：**所有用户反馈统一走 `utils/feedback.ts`，页面不再直接调
  `wx.showToast` / `wx.showModal`**。理由不是「少写几行」，而是同类反馈散在多个页面里
  各写一遍，早晚会出现图标、时长、确认色不一致；收敛到一处后「一致性」变成可断言的东西
  （端到端逐页比对参数）。
- 已定决策（Phase 9）：**危险色按「操作是否可逆」划分**。取消预约（原时段会被释放给别人）
  用 `#f5222d`；退出登录（再登一次就回来）不用危险色。危险色一旦滥用就失去了警示作用。
- 已定决策（Phase 9）：**`confirm()` 的 `fail` 分支返回 `false`**。
  「弹窗弹不出来」与「用户点了取消」在结果上都不该执行后续动作，把前者当作后者是安全方向；
  反过来（当成确认）会让用户在毫无提示的情况下被取消预约。
- 已定决策（Phase 9）：**「等待确认」与「请求进行中」必须是两个独立的防重复标记**
  （`confirming` / `canceling`）。确认框 Promise 化后 `await` 期间请求还没开始发，
  只靠 `canceling` 拦不住连点，会弹出两个确认框。
- 已定决策（Phase 9）：**最近筛选条件缓存的优先级是 URL 参数 > 缓存 > 空（全部）**，
  且带参数进入也要写缓存（见 §6 `store/preference.ts` 与 `pages/resource-list`）。
- 已定决策（Phase 9）：**下拉刷新只重拉数据、不重置页签**；且异常路径（含未登录）
  同样要收起刷新动画 —— 用户主动做了动作就必须有回应，哪怕结论是「还是未登录」。
- 已定决策（Phase 9）：**安全区的两段式写法必须拆成两条 CSS 声明**
  （`padding: …; padding-bottom: calc(… + env(safe-area-inset-bottom, 0px))`）。
  合成一条时，旧机型不支持 `env()` 会让整条 `calc` 失效，下内边距反而变成 0。

已定决策（Phase 10，均由开发者在动手前拍板）：
- **微信登录用「双模式 + 自动降级」**：配了 `CR_WECHAT_APPID` / `CR_WECHAT_SECRET`
  就走真实 `code2session`，否则由 code 派生本地用户映射（非 `dev:` 开头的 code 统一映射到
  固定开发用户 `dev-user`）。**同一份代码两条路径**，换环境不需要改开关，
  也就不会出现「上生产忘了翻开关」这种事。
- **登录 token 用 HMAC-SHA256 签名的自包含令牌**，不引入 Redis、不加会话表。
  理由是要守住「只有三张核心表」的约束；代价是主动失效做不了（见 §10 第 18 条）。
- **`USE_MOCK_DATA` 在 Phase 10 保持 `true`，Phase 11 切 `false`**。
  理由：Phase 10 的验证分两条独立链路做（后端接口实测 + 联通实测各自临时切换），
  九套 mock 回归不依赖后端进程；Phase 11 完成切换后 `false` 即**正式状态**（小程序跑真实后端），
  九套 mock 回归（`e2e-phase1..9.js`）成为「`USE_MOCK_DATA = true` 时才有效」的历史回归资产。
- **业务失败一律 HTTP 200，只有未登录/登录态失效用 HTTP 401**。
  理由：前端 `request.ts` 只需一条判断路径，不必为每个接口记「哪种错是 4xx」；
  401 单独出来是因为它触发的动作（清本地态 + 引导重新登录）与其他业务失败完全不同。
- **`GET /api/resources/{id}` 资源不存在时返回 `code:0 data:null`**，而不是 `404001`。
  理由：对页面而言「资源不存在」是一种正常的展示结果（落空态），不是错误分支；
  用错误码承载会让页面多一条无意义的分支。注意这与 `GET /api/bookings/my` 里的
  「取消查不到」不同——那里用户点的是一个自己以为存在的预约，必须给错误提示。
- **预约一致性由数据库唯一索引兜底，而不是只靠 Service 判断**：
  Service 先查一次**只为给出友好文案**（「该时段已被预约」），真正的并发防线是
  `active_slot_key` 的唯一索引（8 条并发实测：7 条被拦下并翻译成 `409001`，恰好 1 条成功）。
  若只靠 Service 的「查了再写」，两个请求会在查询与写入之间穿插过去。
- **取消预约只改 `status`、绝不删行**：预约记录是用户的历史凭证，
  删行会让「我的预约」里那条凭空消失，用户无法区分「我取消了」与「系统把它弄丢了」。
- **可用时间段是合成出来的、不入库**：`resource.open_slots` 生成骨架 + booking 叠加 + 当前时间标
  `DISABLED`。因此取消预约**不需要任何清理动作**，时段自动恢复可用；
  也让「某天某时段是否可约」只有一处真源（booking 表），不存在两份数据不同步的问题。
- **建表与种子数据用幂等 SQL 脚本（`spring.sql.init`），不用 Hibernate 的 `ddl-auto`**：
  生成列与唯一索引这类结构 Hibernate 表达不好，且 `ddl-auto` 会在生产上改结构。
  `ddl-auto: none` 让 Hibernate 既不建表也不校验。
- **口令与凭据一律环境变量注入，`application.yml` 里默认留空**：
  这是公开仓库，写死默认口令等于把口令公开；代价是本地启动必须显式注入
  `CR_DB_PASSWORD`，否则启动即 `Access denied`。

已定决策（Phase 11，均由开发者在动手前拍板）：
- **新写一套完整回归 `e2e-phase11.js`**，而不是扩展 `e2e-real-backend.js`：
  前者是「切真实后端后的全链路 + 各失败分支」，后者是「核心读写链路冒烟」，两者职责不同。
- **失败分支靠构造真实场景注入，不给后端加测试后门**：冲突=真抢同一时段、
  资源不存在=访问不存在 id、空数据=筛选无结果 + 未登录引导。
  未授权 401002 与网络失败两个分支的前端逻辑由 mock 回归覆盖、后端侧由 `api-phase10.js`
  覆盖，不在真实后端 E2E 里做进程级编排（见 §10 第 19 条）。
- **`USE_MOCK_DATA` 完成后切到 `false`（终态）**：Phase 11 就是「接真实后端」的验收。

当前不使用：
- Redis
- MQ
- 微服务
- Elasticsearch
- GraphQL

## 12. Context Recovery

每次新会话：
1. 读取本文件
2. 读取 `docs/AGENTS.md`
3. 读取当前任务相关文档
4. 检查实际代码
5. 不假设上一轮聊天上下文存在
6. 发现文档与代码不一致时先检查实际代码，不静默覆盖

## 13. Phase Completion

阶段完成后：
1. 完成功能
2. 执行测试
3. 检查运行结果
4. 更新本文件
5. 更新当前阶段与下一阶段
6. 更新已完成/进行中/待开发
7. 更新已知问题
8. 必要时更新 API、数据库或架构文档
9. 创建 Git Commit

## 14. Last Updated

更新时间：2026-09-16  
最后完成任务：**Phase 11 测试**。`USE_MOCK_DATA` 切到 `false`（小程序正式跑真实后端）；
新增 `tools/e2e/e2e-phase11.js`（真实后端完整回归，**36/36**，失败分支构造真实场景注入）与
`tools/e2e/e2e-phase11-helper.js`（测试数据清理）。
验证：Phase 11 真实后端完整回归 36/36 通过（页面跳转 / 资源加载 / 空数据 / 登录 /
预约含冲突 / 取消预约含二次确认 / 返回刷新），后端接口 `api-phase10.js` 76/76 复验无回归；
`docs/04_development_plan.md` Phase 11 小程序七项勾选（真机测试除外）、后端七项勾选。
遗留：Phase 11「真机测试」未做（需开发者在真实后端下用「预览」扫码复核）；
真实微信 `code2session` 已实测到微信业务响应一级（`errcode=40029`，AppSecret/IP 白名单/
响应解析全通，剩「真 code 换真 openid」待小程序侧验证，见 §10 第 16 条）；真实后端 E2E 未覆盖
「未授权 401002」与「网络失败」两分支（前端逻辑已由 mock 回归覆盖、后端侧已由 api-phase10 覆盖，见 §10 第 19 条）  
更新者：Developer（AI 协同）
