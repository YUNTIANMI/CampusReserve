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
├── 05_api_contract.md        # API 契约（首次实现 API 前创建）
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
```

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
