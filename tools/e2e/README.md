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

# 2) 执行 Phase 1 测试
node ./e2e-phase1.js ws://127.0.0.1:9420
```

退出码 `0` 表示全部通过，输出末行为 `E2E_TEST = PASS`。

## 实测踩坑（改动测试脚本前务必先读）

1. **`page.$()` / `page.$$()` 无法进入自定义组件。**
   页面级选择器只能查页面自身节点，连 `<empty-state>` 这类组件标签本身都查不到，
   所以 `.empty-state`、`.loading-state`、`.error-state` 一律查不到。
   组件内部断言必须用 **`page.xpath()`**，例如
   `page.xpath('//view[@class="empty-state"]')`。

2. **`page.xpath()` 未命中时不返回 `null`。**
   它返回一个占位对象：`tagName` 为 `undefined`、尺寸 `0x0`、`text()` 为空串。
   直接写 `if (await page.xpath(...))` 会永远为真，造成误判。
   判定存在必须同时校验 `tagName` 是非空字符串且尺寸大于 0，见 `xpathEl()`。

3. **点击后不要只 `sleep` 固定时长。**
   模拟器渲染层有延迟，固定等待会偶发「点击无效」的假失败。
   应轮询 `mp.currentPage().path` 直到路由变化（见 `waitForPath()`），并保留一次重试。

4. **断言前先确保应用状态干净。** 上一次会话残留的页面会让「启动页断言」误判，
   脚本启动时先回退到页面栈栈底（见 `bottomRoute()`）。

5. **`automator.launch()` 在本机可能报 `Failed to launch wechat web devTools`。**
   改用「先 `cli auto` 起自动化，再 `automator.connect({ wsEndpoint })`」的方式更稳。
