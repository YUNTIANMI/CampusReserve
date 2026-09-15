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
```

也可以用 npm 脚本：`npm run auto` / `npm run phase1` / `npm run phase2`。

`start-automation.js` 会自动定位开发者工具 CLI（可用命令行参数或 `WX_DEVTOOLS_CLI` 环境变量覆盖），
并把工程根指向 `../../CampusReserve`。

退出码 `0` 表示全部通过，输出末行为 `E2E_TEST = PASS`。
当前通过情况：Phase 1 `36/36`，Phase 2 `47/47`。

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
