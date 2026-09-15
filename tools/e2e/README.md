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
```

也可以用 npm 脚本：`npm run auto` / `npm run phase1` / `npm run phase2` / `npm run phase3` / `npm run phase4`。

`start-automation.js` 会自动定位开发者工具 CLI（可用命令行参数或 `WX_DEVTOOLS_CLI` 环境变量覆盖），
并把工程根指向 `../../CampusReserve`。

退出码 `0` 表示全部通过，输出末行为 `E2E_TEST = PASS`。
当前通过情况：Phase 1 `36/36`，Phase 2 `47/47`，Phase 3 `65/65`，Phase 4 `81/81`。

> Phase 1 的脚本自 Phase 3 起会先清除 `CR_MOCK_MODE`：`resource-list` 已接入真实数据源，
> 不固定数据源模式就无法确定性断言。Phase 1 脚本对该页只覆盖「Phase 1 交付物」
> （参数处理 + 三个状态组件的渲染与事件链路），筛选与列表渲染由 Phase 3 脚本覆盖。
> 自 Phase 4 起脚本还会一并清除 `CR_MOCK_AVAIL_MODE`（详情页的可用时间段数据源模式）。

## 开发期数据源开关

小程序端 `services/config.ts` 的 `USE_MOCK_DATA` 为 `true` 时，页面数据来自本地数据源，
测试通过两个存储键注入不同响应（缺省均为正常态，脚本结束时都会清掉）：

| 存储键 | 作用对象 | 取值 |
| --- | --- | --- |
| `CR_MOCK_MODE` | 资源列表、资源详情 | `success`（缺省）/ `empty` / `error` |
| `CR_MOCK_AVAIL_MODE` | 可用时间段 | `default`（缺省）/ `full` / `none` / `error` |

两个键刻意分开：列表/详情的 `empty` 指「没有资源」，时间段的 `none` 指「该日期没有时段」，
一个键表达不了「详情正常但该日期时段为空」这种组合。

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
