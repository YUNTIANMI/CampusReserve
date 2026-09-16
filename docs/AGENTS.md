# AGENTS.md

# CampusReserve AI Development Guide

## 1. Project Mission

CampusReserve 是一个校园场地预约微信小程序。

核心目标：
> 展示完整的微信小程序开发流程。

开发重点：
- 微信小程序
- TypeScript
- WXML
- WXSS
- 页面与组件
- 生命周期
- 用户交互
- 网络请求
- 登录
- 预约业务
- 真机测试

后端只提供核心 API。

---

## 2. Mandatory Context Recovery

任何开发任务开始前：

1. 阅读 `docs/PROJECT_MEMORY.md`
2. 阅读 `docs/AGENTS.md`（本文件）
3. 阅读当前任务对应的 `docs/`
4. 检查实际代码
5. 检查已有测试
6. 确认当前 Phase 与 Task

不得假设上一轮聊天上下文仍然存在。

---

## 3. Source of Truth

全部项目文档统一存放在 `docs/`，编号与用途如下：

```text
docs/
├── 01_requirements.md        # 需求
├── 02_technical_design.md    # 技术设计、规范与约束
├── 03_database_design.md     # 数据库设计（Phase 10 创建）
├── 04_development_plan.md    # 开发阶段
├── 05_api_contract.md        # API 契约（Phase 10 创建）
├── AGENTS.md                 # AI 协同开发规范（本文件）
└── PROJECT_MEMORY.md         # 当前状态
```

编号为固定约定：

1. 01 需求
2. 02 技术设计
3. 03 数据库设计
4. 04 开发阶段
5. 05 API 契约

`AGENTS.md` 与 `PROJECT_MEMORY.md` 属于规范与状态文件，不参与编号。

实际状态：
当前代码仓库

如果文档与代码冲突：
1. 先检查实际代码
2. 不静默覆盖
3. 向开发者报告
4. 确认后更新文档

---

## 4. Before Coding

修改代码前必须：
1. 说明当前任务
2. 说明相关已完成内容
3. 列出计划修改的文件
4. 描述实现方案
5. 说明潜在风险

需求有歧义时：
`STOP → 提出问题 → 等待确认`

禁止自行猜测核心业务规则。

---

## 5. Scope Control

只完成当前 Task。

禁止未经批准：
- 添加额外功能
- 重构整个项目
- 修改无关模块
- 更换技术栈
- 引入新的基础设施
- 删除已有功能
- 修改数据库设计
- 修改 API Contract

---

## 6. Technology Constraints

默认技术栈：
```text
Frontend:
微信小程序
TypeScript
WXML
WXSS

Backend:
Java
Spring Boot
Maven

Database:
MySQL
```

未经批准不得增加：
- Redis
- MQ
- Elasticsearch
- Kubernetes
- 微服务
- GraphQL

---

## 7. Frontend Rules

工程根目录：`CampusReserve/`（微信开发者工具必须打开该目录，**不是仓库根**）。

目录职责：
```text
pages/
components/
services/
utils/
types/
store/
```

页面：
负责交互、状态、调用 Service 和展示。

Service：
负责 API 请求。

Component：
负责可复用 UI。

Types：
负责类型。

---

## 8. State Rules

主要页面至少考虑：
- loading
- success
- empty
- error

禁止：
- 无限 loading
- 白屏
- 点击无反馈
- 请求失败无提示

---

## 9. TypeScript Rules

优先使用明确类型。
避免无必要的 `any`。
API 数据尽量有明确 Interface / Type。

---

## 10. Backend Rules

保持：
```text
Controller
    ↓
Service
    ↓
Repository
    ↓
MySQL
```

Controller：
只处理 HTTP 和参数。

Service：
处理业务逻辑。

Repository：
处理数据库访问。

禁止 Controller 直接访问数据库。

分层内的既定约束（Phase 10 落地，详见 `docs/05_api_contract.md`）：
- Controller 只做接参与包响应体，**不写业务判断**；响应体恒为 `ApiResponse`（code / message / data）
- **业务失败一律 HTTP 200**，语义放在 `code`；**只有未登录 / 登录态失效用 HTTP 401**
- 错误码统一 `HTTP 状态码 × 1000`（`400001` 参数 / `400002` 非法时间 / `401001` 未登录 /
  `401002` 登录失败 / `404001` 不存在 / `409001` 时段冲突 / `500000` 服务端异常）
- 抛 `BizException` 表达业务失败，**不要在 Service 里手写 `ApiResponse`**；
  异常到响应码的翻译只在 `GlobalExceptionHandler` 一处发生，且**不向客户端泄漏堆栈**
- 需要登录的接口用 `@CurrentUser Long userId` 取身份，**入参不含 userId**
- 涉及并发的唯一性（例如同一时段只能有一条有效预约）必须有**数据库层约束兜底**，
  Service 里的预检查只负责给出友好文案
- 口令与凭据一律环境变量注入，`application.yml` 里默认留空（公开仓库）

---

## 11. Booking Rules

预约必须满足：
1. 用户已登录
2. Resource 存在
3. 时间合法
4. 时间不早于当前时间
5. 同一资源同一时间段不能重复预约
6. 用户只能取消自己的预约

---

## 12. AI Behavior

每次开发：
```text
理解
→ 计划
→ 实现
→ 测试
→ 报告
```

禁止：
直接生成大量代码 → 不检查 → 不测试 → 宣布完成

---

## 13. Testing

每项完成后测试，至少覆盖：
- 正常情况
- 异常情况
- 边界情况

无法测试时必须明确说明，不得声称测试通过。

小程序端到端测试（在真实微信开发者工具中运行）：
```bash
cd tools/e2e
npm install
node ./start-automation.js          # 启动开发者工具自动化模式（端口 9420）
node ./e2e-phase1.js                # Phase 1：路由、页面参数、四态组件、页签
node ./e2e-phase2.js                # Phase 2：首页、分类入口、ResourceCard、下拉刷新
node ./e2e-phase3.js                # Phase 3：列表页、分类筛选、卡片列表、四态、下拉刷新
node ./e2e-phase4.js                # Phase 4：资源详情、日期条、时间段三态、选择与按钮状态
node ./e2e-phase5.js                # Phase 5：登录入口、一键登录流程、登录态保存、未登录引导
node ./e2e-phase6.js                # Phase 6：创建预约、成功提示与跳转、冲突与各类失败
node ./e2e-phase7.js                # Phase 7：我的预约、状态派生与分组、BookingCard、预约详情
node ./e2e-phase8.js                # Phase 8：取消预约、二次确认、状态更新、时间段恢复、失败分流
node ./e2e-phase9.js                # Phase 9：统一反馈层、筛选条件缓存、下拉刷新与安全区适配
```

后端接口实测（不依赖小程序，直接打 HTTP）：
```bash
node ./tools/api-test/api-phase10.js            # Phase 10：76 项，含 8 条并发抢同一时段
```

小程序 ↔ 真实后端联通实测（Phase 10 起）：
```bash
# 前置：后端已连 MySQL 启动；本文件所在工程为 tools/e2e
#       services/config.ts 的 USE_MOCK_DATA 置为 false（Phase 11 起为正式状态，无需改回）
#       并已 node ./start-automation.js
node ./e2e-real-backend.js ws://127.0.0.1:9420 <预置预约id>   # Phase 10：核心读写链路
node ./e2e-phase11.js ws://127.0.0.1:9420                      # Phase 11：完整回归（36 项）
node ./e2e-phase11-helper.js clean                             # 清理 phase11 写入的预约
```
它们证明的是「**小程序真的在通过 HTTP 读写这个后端**」——与「后端接口本身是对的」是两件事，
不能互相替代。核心手法是**反证**：把 `CR_MOCK_MODE` 置成 `empty`（mock 被要求返回空）后
列表仍渲染出 8 条后端种子资源，才能排除 mock 忘关造成的假阳性。
`e2e-phase11.js` 的失败分支不靠测试后门，全部构造真实场景注入（冲突=真抢同一时段、
资源不存在=访问不存在的 id、空数据=筛选无结果 + 未登录引导）；未授权 401002 与网络失败
的页面处理逻辑由 mock 回归覆盖、后端侧由 `api-phase10.js` 覆盖，不做进程级编排。

**`USE_MOCK_DATA` 的终态**：Phase 11 起为 `false`（小程序正式跑真实后端），不再是临时切换。
前九套 mock 回归（`e2e-phase1..9.js`）依赖 `USE_MOCK_DATA = true`，因此只在切回 mock 时才可跑，
属历史回归资产；日常联调回归以 `e2e-phase11.js` + `api-phase10.js` 为准。

**后端联通测试的已知环境陷阱**：自动化会话跨脚本存活，若上一轮把**登录页**留在页面栈里，
登录页那个「成功后延迟返回」的定时器会弹掉随后压入的新页面；连续几轮后模拟器的
**路由过渡会冻结**（`wx.reLaunch` 回调一直停在 `pending`）。解法是 `cli.bat close` 后重跑
`start-automation.js`；脚本侧必须**等登录页自己离开再导航**。
两种现象都会在日志里明说，不要靠猜——详见 `tools/e2e/README.md`。

测试脚本编写的硬约束（选择器无法穿透自定义组件、`page.xpath()` 的占位返回与谓词能力、
不可使用 `reLaunch`、路由断言须读 appservice 页面栈、**导航之间必须等过渡收尾**、
**点击后不能只等状态字段变回原值**、**点击必须落在组件根节点上且 `text()` 不穿透组件边界**）
见 `tools/e2e/README.md`，改动测试前必读。

---

## 14. Documentation

需求变化 → 更新 `docs/01_requirements.md`  
技术变化 → 更新 `docs/02_technical_design.md`  
数据库变化 → 更新 `docs/03_database_design.md`  
阶段变化 → 更新 `docs/04_development_plan.md`  
API 变化 → 更新 `docs/05_api_contract.md`  
状态变化 → 更新 `docs/PROJECT_MEMORY.md`

---

## 15. Project Memory

完成 Task 后更新 `docs/PROJECT_MEMORY.md`：
- 当前 Phase
- 已完成
- 进行中
- 下一任务
- 已知问题
- 数据库状态
- API 状态
- 重要决策变化

保持简洁，不写成长篇开发日志。

---

## 16. Phase Completion

```text
功能完成
→ 测试
→ 验收
→ 更新 docs/PROJECT_MEMORY.md
→ 更新相关文档
→ Git Commit
```

Commit Message 规范：中文 Conventional Commits

```text
<type>(<scope>): <中文简述>
```

type：
```text
feat      新功能
fix       缺陷修复
docs      文档
refactor  重构
perf      性能优化
test      测试
build     构建与依赖
chore     杂项
```

scope（可选）：`miniprogram` / `backend` / `docs` / `db` / `api`

要求：
- 简述使用中文动宾结构，不加句号，不超过 50 字
- 禁止 `update`、`修改`、`提交`、`fix bug` 等无信息量描述
- 一个 Commit 只做一件事，不混合无关改动

示例：
```text
feat(miniprogram): 新增资源列表页与分类筛选
fix(backend): 修复同一时段重复预约未被拦截
docs: 统一文档目录并修正编号
chore: 忽略工作区临时文件
```

---

## 17. Final Task Report

使用：

```text
## Implemented
...

## Files Changed
...

## Tests Executed
...

## Test Result
PASS / FAIL / NOT RUN

## Known Issues
...

## Documentation Updated
...

## PROJECT_MEMORY Updated
YES / NO

## Recommended Next Task
...
```

---

## 18. Safety

未经明确授权不得：
- 删除大量文件
- 删除数据库
- Git force push
- 大规模重构
- 修改生产环境

凭据安全：
- 本仓库为公开仓库
- 禁止将真实密码、密钥、令牌写入任何被 Git 跟踪的文件
- 连接信息通过环境变量或本地未跟踪文件注入

发现风险：
`STOP → 报告 → 等待确认`

---

## 19. Core Principle

> Chat context is temporary.
>
> Repository state is persistent.

任何影响未来开发的重要信息必须写入：
- `docs/PROJECT_MEMORY.md`
- `docs/`
- 代码
- Git Commit

不能只存在于聊天记录中。
