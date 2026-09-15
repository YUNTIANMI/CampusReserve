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

当前阶段：Phase 4 - 资源详情与时间选择（已完成，E2E 实测 81/81 通过）

当前任务：无

下一阶段：Phase 5 - 用户登录

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

## 4. In Progress

暂无。

## 5. Next Tasks

1. Phase 5：登录入口
2. Phase 5：微信登录流程（`wx.login` → 后端换取登录态）
3. Phase 5：登录状态保存（本地缓存 `userInfo` / `loginState`，技术设计 §9）

## 6. Current Frontend State

工程根目录：`CampusReserve/`（小程序工程，非仓库根目录）  
AppID：`wxb97024eb0305368d`

已就绪：
- `app.ts` / `app.json` / `app.wxss` / `sitemap.json` / `tsconfig.json`
- `project.config.json`（已启用 `useCompilerPlugins: ["typescript"]`）
- `typings/`（微信小程序 API 类型定义，来自 `miniprogram-api-typings@5.2.3`）
- 目录骨架：`pages/` `components/` `services/` `utils/` `types/` `store/`

类型（`types/`）：
- `api.ts`：统一响应体 `ApiResponse<T>`、`ApiError`
- `page.ts`：页面四态 `PageState`（loading / success / empty / error）
- `user.ts` / `resource.ts` / `booking.ts`：用户、资源、预约领域类型
  （`resource.ts` 另含 Phase 2 新增的查询参数 `ResourceQuery`）
- `global.d.ts`：仅保留 `IAppOption`（全局 ambient 类型已迁至 `types/` 内具名模块）
- `index.ts`：统一出口

服务（`services/`）：
- `config.ts`：API 根地址、超时常量，以及开发期数据源开关 `USE_MOCK_DATA` 与模式存储键
  （Phase 4 追加 `MOCK_AVAIL_MODE_STORAGE_KEY`，与列表/详情的模式键分开，理由见 §11）
- `request.ts`：封装 `wx.request`，统一归一化为 `ApiError`（区分网络失败 / 超时 / HTTP 非 2xx / 业务 code ≠ 0）
- `resource.ts`（Phase 2 / Phase 4）：资源业务接口
  - `getResources(query)`（Phase 2）
  - `getResourceDetail(id)`（Phase 4）：**资源不存在时 resolve(null) 而不是抛错**，
    使「查无此资源」落到 empty 态、「请求失败」落到 error 态。该约定待 `docs/05_api_contract.md` 确认
  - `getAvailability(resourceId, date)`（Phase 4）→ `GET /api/resources/{id}/availability`
- `mock-resource.ts`（Phase 2 / Phase 4）：开发期本地数据源
  - `mockGetResources` / `mockGetResourceDetail` / `mockGetAvailability`
  - `MOCK_SLOT_TEMPLATE`：6 个时段（取自需求 §4.4），`default` 模式下按确定性规则分布
    `BOOKED` / `DISABLED` / `AVAILABLE`，保证任意资源任意日期都能同时看到三种状态

工具（`utils/`）：
- `resource.ts`（Phase 2）：资源分类常量 `RESOURCE_TYPE_OPTIONS` 与 `getResourceTypeLabel()`
- `resource.ts`（Phase 3 追加）：列表页筛选项 `RESOURCE_FILTER_OPTIONS`（首项「全部」，值为空串）、
  类型守卫 `isResourceType()`、参数归一化 `normalizeResourceType()`
- `date.ts`（Phase 4）：`YYYY-MM-DD` 格式化与校验解析、星期中文名、`HH:mm` 转分钟、
  日期条选项 `buildDateOptions(days)`
- `time-slot.ts`（Phase 4）：时段状态中文标签 `getTimeSlotStatusLabel()`、
  是否可选 `isTimeSlotSelectable()`（只认 `AVAILABLE`）、时段文案 `getTimeSlotLabel()`、
  同一时段判定 `isSameTimeSlot()`

页面：
- `pages/index`（Phase 2 完成）：真实首页，含顶部区域、4 个分类入口、热门 / 推荐资源、
  四态与下拉刷新；点击资源卡进入详情，点击分类进入列表并带 `category` 参数
- `pages/resource-list`（Phase 3 完成）：真实列表页，含分类筛选栏、`ResourceCard` 列表、
  四态与下拉刷新。两个关键设计：
  1. **筛选栏是静态内容，不随四态变化**（与首页一致）——接口失败或结果为空时仍能切换分类，
     避免「一次请求失败就整页不可用」；
  2. **非法 `category` 归一化为「全部」而非错误态**——详情页缺少 `id` 就无事可做，
     但列表页的筛选条件不满足时页面依然可用，一个脏链接不该把功能全部挡掉。
  另：切换分类时比对请求发出时的 `category`，条件已变则丢弃该次过期响应。
- `pages/resource-detail`（Phase 4 完成）：真实详情页，含图片 / 类型占位、资源信息、7 天日期条、
  `TimeSlot` 列表、选择时间与预约按钮。四个关键设计：
  1. **资源信息区与时间段区各自独立四态**——切换日期只重新请求时间段，两区共用一个状态会导致
     一次时段请求失败就把资源名称、地点、描述一并清掉，用户连在看哪个资源都不知道；
  2. **日期条是静态内容，不随任何四态变化**——与列表页筛选栏同理（技术设计 §7「禁止白屏」）；
  3. **资源不存在用 empty 态而不是 error 态**——重试没有意义，只给「返回上一页」，
     不给一个注定无效的「重新加载」；
  4. **切换日期清空已选时段**——时段属于某一天，跨日期沿用会提交出用户并未选择的组合。
  另：切换日期时比对请求发出时的日期，条件已变则丢弃该次过期响应；
  「有时段但全部不可预约」仍是 success（时段确实存在且要展示），只额外给一句提示。
- `pages/my-bookings`：待使用 / 已完成 / 已取消三个状态页签
- `pages/booking-detail`：接收 `id` 参数，参数缺失时展示错误态

组件：
- 已创建：`loading-state`、`empty-state`（含操作事件）、`error-state`（含 `retry` 事件）
- 已创建（Phase 2）：`resource-card`（资源卡片；事件名 `cardtap`，刻意不复用 `tap`
  以避免与组件内原生 tap 冒泡重复触发；不硬编码路由，跳转由使用方决定），
  Phase 3 在列表页直接复用，组件本身无需改动
- 已创建（Phase 4）：`time-slot`（时间段；属性 `slot-data` / `selected`，事件 `slottap`，
  仅 `AVAILABLE` 触发。**属性名不能叫 `slot`**，见 §10 第 7 条）
- 待创建：`CategoryCard`、`BookingCard`

分类筛选 UI 目前在列表页内联实现（chip 形态，与首页的分类卡片入口形态不同），
暂未抽取为 `CategoryCard`；`BookingCard` 留待 Phase 7。

## 7. Current Backend State

工程根目录：`backend/`  
Spring Boot 3.5.16 + Java 17 + Maven（自带 `mvnw`）

已完成：
- `CampusReserveApplication` 启动类
- `common/ApiResponse.java`（统一响应体，对应技术设计 §13）
- `controller/HealthController.java`（`GET /api/health`，仅用于启动与连通性验证，非业务接口）
- `application.yml`
- `CampusReserveApplicationTests`（上下文加载冒烟测试，已通过）

尚未建立（Phase 10）：
- `service/` `repository/` `entity/` `dto/` 包
- 数据源配置与 `mysql-connector-j` 依赖
- 业务 API

启动与验证：
```bash
cd backend
./mvnw spring-boot:run
# GET http://localhost:8080/api/health
# {"code":0,"message":"success","data":{"status":"UP","service":"campusreserve-backend"}}
```

## 8. Current Database State

项目数据库 `campusreserve` 尚未创建（Phase 10 创建）。

已实测确认的环境：
- MySQL **8.4.10**
- 选定实例：**端口 3308**，服务名 `MySQL84`
- 安装路径：`E:\MySQL Server 8.4\install`
- 配置文件：`E:\MySQL Server 8.4\mysql8\my.ini`
- 数据目录：`E:\MySQL Server 8.4\mysql8\Data`
- root 账号密码已由开发者提供，**连接实测通过**（可执行 `SELECT VERSION()` 与 `SHOW DATABASES`）

注意：
- 该实例为**多项目共用实例**，已存在其他项目的库（`user_db`、`product_db`、`order_db`、`pay_db`、`stock_db`、`luoji_blog` 等）。本项目**只能操作 `campusreserve` 库**，不得改动其他库。
- 本机另一实例（端口 3306，安装于 `D:\MySQL\mysql-8.4.3-winx64`）的 root 账号使用 `mysql_native_password`，该插件在 MySQL 8.4 中默认未加载，**无法连接，本项目不使用**。
- 仓库为公开仓库，**数据库口令不写入任何被 Git 跟踪的文件**；凭据存放于本地未跟踪的工作区记忆中。

数据库设计以：
`docs/03_database_design.md`
为准；该文档尚未建立，在首次数据库实现前创建。

## 9. Current API State

仅有一个非业务的健康检查接口：`GET /api/health`。

业务 API 尚未实现；文档中规划的 `GET /api/resources` 等接口属于 Phase 3 / Phase 6 / Phase 7 / Phase 8。

API 设计以：
`docs/05_api_contract.md`
为准；该文档尚未建立，在首次 API 实现前创建。

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
   - 现成可用的端到端脚本与说明见 `tools/e2e/`（Phase 1 36/36、Phase 2 47/47、Phase 3 65/65 通过）。

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

文档体系（Phase 0 确立）：
```text
docs/
├── 01_requirements.md        # 需求
├── 02_technical_design.md    # 技术设计、规范与约束
├── 03_database_design.md     # 数据库设计（Phase 10 创建）
├── 04_development_plan.md    # 开发阶段
├── 05_api_contract.md        # API 契约（首次实现 API 前创建）
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

开发期数据源（Phase 2 引入，Phase 4 扩展，临时机制）：
- 前端页面先于后端实现，`services/config.ts` 的 `USE_MOCK_DATA` 为 `true` 时，
  由 `services/mock-resource.ts` 提供与 `Resource` / `Availability` 类型一致的本地数据，
  使页面在后端 API（Phase 10）落地前即可验证 success / empty / error 三种展示。
- 该开关只决定数据来源，页面与组件代码不感知；后端联调时改为 `false` 即切到真实接口。
- 两个模式存储键供调试与端到端测试注入，属开发期机制，联调前应连同开关一并移除：
  - `CR_MOCK_MODE`（`success` | `empty` | `error`）：作用于资源列表与资源详情，
    `empty` 在详情页的含义是「该资源不存在」
  - `CR_MOCK_AVAIL_MODE`（`default` | `full` | `none` | `error`，Phase 4 追加）：作用于可用时间段，
    `full` 用于验证「全部约满时按钮保持禁用」，`none` 用于验证时间段空态
- **两个键刻意分开**：列表/详情的 `empty` 指「没有资源」，时间段的 `none` 指「该日期没有时段」，
  一个键表达不了「详情正常但该日期时段为空」这种组合。
- 已定决策：**开发期数据源不提供 `imageUrl`**，因此详情页与资源卡片始终展示类型占位块。
  这是为了让端到端测试不依赖网络图片。真实图片资源待 Phase 9（体验优化）/ Phase 12（作品集整理）
  统一补齐，届时只需给 mock 数据或后端数据补 `imageUrl`，页面代码无需改动。

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

更新时间：2026-09-15  
最后完成任务：Phase 4 资源详情与时间选择完成并通过端到端测试（真实开发者工具中 81/81 通过，
Phase 1 / Phase 2 / Phase 3 回归 36/36、47/47、65/65）；实现图片与类型占位、资源信息、7 天日期条、
`TimeSlot` 组件与三态、选择 / 取消选择时间、预约按钮状态，资源信息区与时间段区各自独立四态；
并摸清自定义组件的四条硬约束（新增已知问题 7）  
更新者：Developer（AI 协同）
