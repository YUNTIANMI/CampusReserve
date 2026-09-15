# CampusReserve 端到端测试（小程序）

基于 `miniprogram-automator`，在**真实微信开发者工具**中驱动小程序运行，验证页面路由、
页面状态与组件渲染。

本目录位于仓库根（不在小程序工程目录 `CampusReserve/` 内），避免测试脚本被打包进小程序。

## 环境要求

- 微信开发者工具已安装，且已开启「设置 → 安全设置 → 服务端口」
- 小程序工程目录以 `CampusReserve/` 为**工程根**打开（**不是仓库根**，否则报
  `app.json: 在项目根目录未找到 app.json`）
- Node.js 18+

## 安装

```bash
cd tools/e2e
npm install
```

## 执行

```bash
# 1) 启动开发者工具的自动化模式（端口 9420）
node ./start-automation.js

# 2) 执行测试
node ./e2e-phase1.js ws://127.0.0.1:9420   # Phase 1：路由、页面参数、四态组件、页签
node ./e2e-phase2.js ws://127.0.0.1:9420   # Phase 2：首页、分类入口、ResourceCard、下拉刷新
node ./e2e-phase3.js ws://127.0.0.1:9420   # Phase 3：列表页、分类筛选、卡片列表、四态、下拉刷新
node ./e2e-phase4.js ws://127.0.0.1:9420   # Phase 4：资源详情、日期条、时间段三态、选择与按钮状态
node ./e2e-phase5.js ws://127.0.0.1:9420   # Phase 5：登录入口、一键登录流程、登录态保存、未登录引导
node ./e2e-phase6.js ws://127.0.0.1:9420   # Phase 6：创建预约、成功提示与跳转、冲突与各类失败
```

也可以用 npm 脚本：`npm run auto` / `npm run phase1` … `npm run phase6`。

`start-automation.js` 会自动定位开发者工具 CLI（可用命令行参数或 `WX_DEVTOOLS_CLI` 环境变量覆盖），
并把工程根指向 `../../CampusReserve`。

退出码 `0` 表示全部通过，输出末行为 `E2E_TEST = PASS`。
当前通过情况：Phase 1 `36/36`，Phase 2 `47/47`，Phase 3 `65/65`，Phase 4 `81/81`，
Phase 5 `64/64`，Phase 6 `61/61`，合计 `354` 项断言。

> Phase 1 的脚本自 Phase 3 起会先清除 `CR_MOCK_MODE`：`resource-list` 已接入真实数据源，
> 不固定数据源模式就无法确定性断言。Phase 1 脚本对该页只覆盖「Phase 1 交付物」
> （参数处理 + 三个状态组件的渲染与事件链路），筛选与列表渲染由 Phase 3 脚本覆盖。
> 自 Phase 4 起脚本还会一并清除 `CR_MOCK_AVAIL_MODE`（详情页的可用时间段数据源模式）。

## 开发期数据源开关

小程序端 `services/config.ts` 的 `USE_MOCK_DATA` 为 `true` 时，页面数据来自本地数据源，
测试通过存储键注入不同响应（缺省均为正常态，脚本结束时都会清掉）：

| 存储键 | 作用对象 | 取值 |
| --- | --- | --- |
| `CR_MOCK_MODE` | 资源列表、资源详情 | `success`（缺省）/ `empty` / `error` |
| `CR_MOCK_AVAIL_MODE` | 可用时间段 | `default`（缺省）/ `full` / `none` / `error` |
| `CR_MOCK_AUTH_MODE` | 登录（Phase 5） | `success`（缺省）/ `error` |
| `CR_MOCK_BOOKING_MODE` | 创建预约（Phase 6） | `success`（缺省）/ `conflict` / `resource-missing` / `invalid-time` / `param-error` / `unauthorized` / `error` |

这些键刻意分开：列表/详情的 `empty` 指「没有资源」，时间段的 `none` 指「该日期没有时段」，
登录的 `error` 指「登录失败」——用同一个键表达不了「详情正常但该日期时段为空」或
「资源正常但登录失败」这类组合，而端到端测试需要分别控制它们。

另有一个**数据键**（不是模式开关）：`CR_MOCK_BOOKINGS` 存放开发期已创建的预约
（见 `services/mock-booking-store.ts`）。测试直接读它来核对「预约记录是否真的写进去了」，
也在每次运行开始时清空它，避免多次运行累积把未来几天的时段占满。

登录态本身（`CR_AUTH_TOKEN` / `CR_USER_INFO`）不走这套注入机制：它在 `store/auth.ts` 里
既有缓存也有内存态，只写缓存不会生效，测试必须走真实登录流程，见第 19 条。

## 实测踩坑（改动测试脚本前务必先读）

1. **`page.$()` / `page.$$()` 无法进入自定义组件。**
   页面级选择器只能查页面自身节点，连 `<empty-state>`、`<resource-card>` 这类组件标签本身
   都查不到，所以 `.empty-state`、`.loading-state`、`.error-state` 一律查不到。
   组件内部断言必须用 **`page.xpath()`**，例如 `page.xpath('//view[@class="empty-state"]')`。

2. **`page.xpath()` 未命中时不返回 `null`。**
   它返回一个占位对象：`tagName` 为 `undefined`、尺寸 `0x0`、`text()` 为空串。
   直接写 `if (await page.xpath(...))` 会永远为真，造成误判。
   判定存在必须同时校验 `tagName` 是非空字符串且尺寸大于 0，见 `xpathEl()`。

3. **`page.xpath()` 支持位置谓词与嵌套谓词，这是最可靠的计数与定位手段。**
   - 计数：用 `(//view[@class="resource-card"])[n]` 逐个探测，第一个未命中即为总数，
     见 `countCardsByXPath()`。
   - 定位：`//view[@class="resource-card"][.//view[contains(text(),"西区羽毛球场")]]`
     可按文案精确命中目标节点。
   - **`selectAllComponents()` 不可用于计数**：在 automator 的 evaluate 上下文中它恒返回 `0`，
     连 `.hero__action` 这类普通 `view` 也是 0，实测无效。

4. **不要使用 `mp.reLaunch()`。**
   页面被销毁时 automator 内部会直接解构 `getPageMetaByWebviewId(...)` 的返回值，
   该值为 `null` 时整条连接抛错、测试中断。需要重新加载页面时，改为调用页面自身的方法
   （如首页的 `loadResources()`）。

5. **路由断言读 appservice 的真实页面栈，不要依赖 `mp.currentPage().path`。**
   后者取自 automator 内部维护的 pageStack，在刚 `navigateBack` 后可能与真实状态不同步，
   造成跳转断言偶发误判（Phase 2 实测踩到）。见 `currentPath()`。

6. **「触发页面 async 方法并读状态」要放在同一次 `evaluate` 内。**
   `page.callMethod()` 无法序列化 async 方法返回的 Promise；分两次往返又会错过瞬时状态
   （如 loading，仅 600ms 窗口）。同一次 `evaluate` 内先调用再读最稳，见 `loadHomeAndReadState()`。

7. **断言前先确保应用状态干净。** 上一次会话残留的页面会让「启动页断言」误判，
   脚本启动时先回退到页面栈栈底（见 `bottomRoute()`）。

8. **IDE 里同时开着多个项目窗口会导致自动化连到错误窗口。**
   表现为页面栈为空、`getCurrentPages().length === 0`，`currentPage` 报
   `getPageMetaByWebviewId(...) is null`。用
   `cli.bat close --project <错误目录>` 关掉，再 `cli.bat auto --project <小程序目录>`。

9. **`automator.launch()` 在本机可能报 `Failed to launch wechat web devTools`。**
   改用「先 `cli auto` 起自动化，再 `automator.connect({ wsEndpoint })`」的方式更稳。

10. **刚执行 `cli auto` 时窗口可能仍在编译。** 连接需要重试，连接后首次断言前留一段等待，
    否则会读到空页面栈。

11. **导航之间必须等过渡收尾，否则模拟器会把路由过渡卡死约 10 秒。**（Phase 3 实测，最容易误判）
    `wx.navigateTo` / `wx.navigateBack` 的**栈顶路由更新很快，但整段过渡动画约 1.2 秒才 `onRouteDone`**。
    在过渡未结束时再发导航，会把过渡卡死到约 10 秒超时——日志证据：点卡片后 0.5 秒就发返回，
    结果详情页的 `onRouteDone` 迟了 10 秒，期间 `wx.navigateTo` 报 `fail timeout` 并触发页面的失败提示，
    而 `wx.navigateBack` 自身却立即回报 success。
    对照实验：用 appservice 直接驱动导航时，首页↔列表↔详情各段过渡均为 **3~5ms**，
    即**卡顿由测试节奏造成，不是产品缺陷**。
    正确写法：每次导航后等路由落到目标页并静默约 1.4 秒再继续，见 `waitForRouteSettled()`。

12. **多级返回不要用 `mp.navigateBack()`。**
    它是 `changeRoute('navigateBack')`，**不接受 `delta`**，且会在页面销毁瞬间抛
    `Uncaught [object Object]`（抛错时导航其实已经生效，属工具层问题）。
    应改为 `mp.evaluate(() => wx.navigateBack({ delta }))`，按真实页面栈一次返回到位。
    另外**不要「读栈 → 判断 → 再退」循环**：过渡窗口里读到的是旧栈，会连发多次返回冲过目标页
    （Phase 3 实测把「回列表」冲成了「回首页」）。见 `goBackTo()`。

13. **点击交互后不能只等状态字段变回原值再断言。**
    点击前页面本就处于 success，事件又要跨渲染层→AppService 传递，所以「等 success」会立刻命中
    点击前的旧值，于是读到上一步的数据（Phase 3 实测因此误报 4 项）。
    应按「**目标字段已变为期望值** 且 状态为期望值」轮询，见 `tapFilterAndWait()`。

14. **`element.tap()` 只把事件派发给「你查到的那个节点」，不是按坐标点一下。**
    对自定义组件而言，必须点**组件根节点**（即组件 WXML 的最外层节点，它才是挂 `bindtap` 的地方）。
    点在页面自带的外层包裹节点（例如组件外面套的 `<view class="slots__item">`）上，
    组件内部的事件处理器根本不会触发，症状是「点了没反应」，且不会报任何错
    （Phase 4 实测因此连带误报 8 项：选中状态、按钮状态、摘要文案全挂）。

15. **`text()` 不会穿透组件边界去聚合子内容。**
    若某个页面节点内部放的是自定义组件，读这个页面节点的 `text()` 会得到空串——
    内容在组件自己的节点树里。要读组件内的文案，必须查组件根节点或组件内部的节点。
    （Phase 3 里 `resource-card` 能取到整条文案，是因为查的正是组件根节点。）
    另外 `<text>` 节点在内容为空时 `size()` 会返回 `0x0`，`xpathEl()` 会判为「不存在」；
    这也是个有用的信号：**尺寸为 0 往往意味着插值出来是空串**。

16. **组件根节点的 `class` 带插值修饰符时，不要用 `@class` 精确匹配。**
    例如 `class="time-slot {{selectable ? '' : 'time-slot--disabled'}}"` 渲染后是
    `time-slot time-slot--disabled`（连续空格被规范化），精确匹配永远不中。
    用 `contains(@class,"time-slot") and not(contains(@class,"time-slot__"))`：
    `not(...)` 排除同前缀的子元素（`time-slot__label` / `time-slot__status`）。

17. **绝对不要用 `slot` 作为自定义组件的属性名。**
    `slot` 是小程序的保留属性（用于具名插槽），`<my-comp slot="{{item}}">` 会被框架当成插槽声明
    吃掉，`properties` 永远收不到值。**不报错、不告警**，症状是「组件渲染出来了、根节点 class
    也正确，但内部文案全是空串」——因为 data 还停在初始值。Phase 4 实测踩到，
    排查花了两个来回。属性名改为 `slotData`（标签上写 `slot-data`）后正常。

18. **改动小程序源码后要留出编译时间再跑测试。**
    开发者工具是文件监听 + 增量编译，连续快速改动时，紧接着启动的自动化会话可能仍读到
    旧编译产物，表现为「代码改了但行为没变」，极易误判为修复无效。
    排查这类问题时可临时在 WXML 里插一个 `PROBE[...]` 之类的标记，确认当前跑的是新包。

19. **登录态的真源是 store 的内存态，直接写 storage 不会生效。**（Phase 5 实测）
    `store/auth.ts` 用模块级变量持有登录态，`wx.setStorageSync` 只写缓存、不影响内存态，
    所以「往 storage 里塞一份 token 再断言页面已登录」必然失败——页面读的是内存态。
    要建立登录态就得走真实的登录页流程，见 `e2e-phase5.js` 的 `loginViaPage()`。
    反过来，验证「冷启动恢复登录态」时才先写 storage、再触发一次 App 的 `onLaunch`
    （automator 没有 restart API，本项目也约定不使用 `mp.reLaunch`；`onLaunch` 与真实冷启动
    执行的是同一段代码，是本机条件下最贴近的验证方式）。

20. **toast 与 modal 都由客户端渲染，自动化层读不到。**
    要断言「点击有没有反馈、反馈内容是什么」，只能在 appservice 内临时替换
    `wx.showToast` / `wx.showModal` 记录参数，测完立即还原，见 `callSubmitAndReadFeedback()`。
    需要模拟「用户点了确认」时，就在替换实现里直接调用 `options.success({ confirm: true })`。

21. **登录成功后会延迟约 600ms 才返回上一页，等待返回必须轮询。**
    固定 sleep 要么太短（读不到返回结果）要么太长（拖慢整套测试）；用
    `waitForRouteSettled()` 轮询路由即可。另外点击登录后要**同时对「按钮文案从 `登录中…`
    变回初始值」提前收敛**，否则失败分支会白等满超时，见 `tapLoginAndWatchLoading()`。

22. **`store/auth.ts` 的内存态与 `app.globalData` 是同一份状态的两个读取点。**
    自动化侧读登录态首选 `getApp().globalData.loginState`（最权威）；页面 `data` 里的
    `loginState` 是各页面在 `onShow` 里同步过来的副本，刚跳转完可能还没刷新，
    断言渲染结果时用页面 data，断言全局状态时用 `globalData`。

23. **已经站在登录页时不要再 `navigateTo` 一次登录页。**（Phase 5 实测，会连带误报 1 项）
    重复 push 会让页面栈变成 `[来源页, 登录页, 登录页]`，登录成功后页面里的
    `navigateBack` 只退到第一个登录页，「返回来源页」这类断言就永远等不到目标。
    进登录页统一走 `ensureOnLoginPage()`（当前已在登录页则直接复用），
    不要在辅助函数里无条件 `navigateTo`。

24. **mock 数据源会把「当天已过时」的时段标成 `DISABLED`，傍晚之后当天可预约时段可能为 0。**
    这是技术设计 §11 的既定行为（不是缺陷）。因此凡是要断言「存在可预约时段」的用例，
    都必须先切到明天再取时段，见 `e2e-phase5.js` 的 `switchToTomorrow()`；
    不改日期直接取 `AVAILABLE` 会返回 0，连带一串断言失败。
    注意 Phase 4 的用例不受影响——它本身就先切了明天。

25. **`await` 之后才弹出的 toast，临时替换法截获不到。**（Phase 6 实测）
    预约成功的提示发生在 `await createBooking(...)` 之后（约 600ms），而 Phase 4/5 那种
    「调用 `onSubmit()` → `finally` 里立刻还原 `wx.showToast`」的写法，同步部分一结束就还原了，
    截获到的永远是 `null`。改用**常驻探针**：把 `wx.showToast` / `wx.showModal` 换成记录器
    **并留在原地**，整段用例跑完再统一还原，见 `e2e-phase6.js` 的 `installFeedbackSpy()` /
    `readFeedbackSpy()`。探针顺带用 `autoConfirm` 控制弹窗是否自动点确认——预约流程的
    「需要登录」引导正是靠 `showModal` 的 `success` 回调跳转登录页，需要时把它置为 `true`。

26. **「提交中…」这类瞬时状态要「调用后立刻读」，不要用固定 sleep 去赌。**
    `onSubmit` 是 `async` 方法，其同步部分（含 `setData({ submitting: true })`）在首个 `await`
    之前就执行完了，因此「在同一次 `evaluate` 里调用方法并紧接着读 `page.data`」可以稳定命中，
    见 `callSubmitAndReadState()`。接口延迟只有 600ms，用 `sleep` 去卡这个窗口既慢又不可靠。

27. **断言「异步刷新造成的变化」要轮询到收尾，不能读一次就下结论。**（Phase 6 首跑误报 1 项）
    冲突后页面会重新拉取时段，而 `loadAvailability()` 会先把 `slotState` 置为 `loading`。
    读到提交失败提示的那一刻刷新还没走完，直接断言 `slotState === 'success'` 必然读到 `loading`。
    与第 5 条同理：要轮询到「目标字段已变为期望值」。

28. **存活过久、且跨越多次源码重新编译的自动化会话会让 `page.data()` 报 `page node not found`。**
    （Phase 6 实测）此时 `getCurrentPages()` 与 `mp.currentPage()` 都还正常（它们走路由信息），
    唯独取页面节点数据失败——表现为测试一开始就连环中断，极易误判为脚本写错。
    修法是重启自动化会话：`cli.bat close --project <小程序目录>` 后再
    `node ./start-automation.js`。**改动较多源码、或会话已跨多轮改动时，跑测试前先重启一次**
    最省时间。
