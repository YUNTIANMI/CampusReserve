# CampusReserve

校园场地预约微信小程序 —— 模拟自习室、研讨室、摄影棚、球场等校园资源的预约场景。

项目重点展示完整的微信小程序开发流程：页面与导航、组件化、生命周期、网络请求、微信登录、本地缓存、预约业务、真机调试与 Git 版本管理。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 小程序 | 微信小程序原生框架 + TypeScript + WXML + WXSS |
| 后端 | Java 17 + Spring Boot 3.5.16 + Maven |
| 数据库 | MySQL 8.4 |
| 接口 | REST API，统一 JSON 响应 |

## 目录结构

```text
CampusReserve/                # 仓库根
├── CampusReserve/            # 微信小程序工程（用开发者工具打开的是本目录）
│   ├── pages/                # 页面
│   ├── components/           # 可复用 UI 组件
│   ├── services/             # API 请求封装
│   ├── utils/                # 工具函数
│   ├── types/                # TypeScript 类型
│   ├── store/                # 必要的全局状态
│   ├── typings/              # 微信小程序 API 类型定义
│   ├── app.ts / app.json / app.wxss
│   └── project.config.json
├── backend/                  # Spring Boot 后端
│   ├── src/main/java/com/campusreserve/
│   │   ├── controller/       # 只处理 HTTP 与参数
│   │   ├── service/          # 业务规则
│   │   ├── repository/       # 数据库访问
│   │   └── common/           # 统一响应等公共组件
│   └── src/main/resources/application.yml
└── docs/                     # 全部项目文档
```

## 环境要求

- 微信开发者工具（稳定版）
- Node.js 18+（仅用于依赖与工具链，小程序业务代码不依赖 Node）
- JDK 17
- Maven 3.9+（工程自带 `mvnw`，无需单独安装）
- MySQL 8.x

## 运行小程序

1. 打开微信开发者工具 → 导入项目
2. 目录选择本仓库的 `CampusReserve/` 子目录（不是仓库根目录）
3. AppID 使用 `project.config.json` 中已配置的 AppID
4. 编译即可启动

本地联调后端时，在「详情 → 本地设置」勾选 **不校验合法域名**；
真机预览时需把 `app.ts` 中的 `baseUrl` 改为电脑的局域网 IP。

## 运行后端

```bash
cd backend
./mvnw spring-boot:run
```

启动后验证：

```bash
curl http://localhost:8080/api/health
# {"code":0,"message":"success","data":{"status":"UP","service":"campusreserve-backend"}}
```

## 数据库

- 本机使用 MySQL 8.4 实例：`127.0.0.1:3308`，服务名 `MySQL84`
- 项目库：`campusreserve`（Phase 10 创建）
- **数据库口令不写入仓库**：本仓库为公开仓库，连接串中的密码一律通过环境变量或本地未跟踪文件注入。

## 开发阶段

当前进度见 [`docs/PROJECT_MEMORY.md`](./docs/PROJECT_MEMORY.md)，完整阶段计划见 [`docs/04_development_plan.md`](./docs/04_development_plan.md)。

## 文档

全部项目文档统一放在 `docs/` 下：

| 文档 | 说明 |
| --- | --- |
| [`docs/01_requirements.md`](./docs/01_requirements.md) | 需求规格说明书 |
| [`docs/02_technical_design.md`](./docs/02_technical_design.md) | 技术选型、工程规范与开发约束 |
| `docs/03_database_design.md` | 数据库设计（Phase 10 创建） |
| [`docs/04_development_plan.md`](./docs/04_development_plan.md) | 开发阶段计划 |
| `docs/05_api_contract.md` | API 契约（首次实现 API 前创建） |
| [`docs/AGENTS.md`](./docs/AGENTS.md) | AI 协同开发规范 |
| [`docs/PROJECT_MEMORY.md`](./docs/PROJECT_MEMORY.md) | 项目当前状态 |

## 提交规范

Commit Message 使用**中文 Conventional Commits**：

```text
<type>(<scope>): <中文简述>
```

- type：`feat` `fix` `docs` `refactor` `perf` `test` `build` `chore` `revert`
- scope（可选）：`miniprogram` `backend` `docs` `db` `api`
- 简述：中文动宾结构，不加句号，不超过 50 字

```text
feat(miniprogram): 新增资源列表页与分类筛选
fix(backend): 修复同一时段重复预约未被拦截
docs: 统一文档目录并修正编号
```

提交信息与仓库文件中不得出现真实密码、密钥、令牌。
