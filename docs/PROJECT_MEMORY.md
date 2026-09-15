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

## 2. Current Phase

当前阶段：Phase 0 - 项目准备（已完成）

当前任务：无

下一阶段：Phase 1 - 微信小程序基础框架

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

## 4. In Progress

暂无。

## 5. Next Tasks

1. Phase 1：配置页面路由
2. Phase 1：创建首页、资源列表、资源详情、我的预约、预约详情
3. Phase 1：建立基础组件与基础样式
4. Phase 1：建立统一请求服务与 TypeScript 类型
5. 推送 Phase 0 提交到 GitHub（见 §10 已知问题 1）

## 6. Current Frontend State

工程根目录：`CampusReserve/`（小程序工程，非仓库根目录）  
AppID：`wxb97024eb0305368d`

已就绪：
- `app.ts` / `app.json` / `app.wxss` / `sitemap.json` / `tsconfig.json`
- `project.config.json`（已启用 `useCompilerPlugins: ["typescript"]`）
- `typings/`（微信小程序 API 类型定义，来自 `miniprogram-api-typings@5.2.3`）
- `types/global.d.ts`（全局 ambient 类型：`LoginState`、`ResourceType`、`TimeSlotStatus`、`BookingStatus`、`UserInfo`）
- 目录骨架：`pages/` `components/` `services/` `utils/` `types/` `store/`

页面：
- `pages/index`：已建立最小可运行页面（Phase 1 将替换为真实首页）
- `resource-list`：未创建
- `resource-detail`：未创建
- `my-bookings`：未创建
- `booking-detail`：未创建
- `login`：未创建

组件（全部未创建）：
- `ResourceCard`、`CategoryCard`、`TimeSlot`、`BookingCard`、`EmptyState`、`LoadingState`、`ErrorState`

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
- 仓库为公开仓库，**数据库口令不写入任何被 Git 跟踪的文件**；凭据存放于本地未跟踪的工作区记忆与实际配置中。

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

1. **Phase 0 提交尚未推送到 GitHub**：
   AI 开发沙箱阻断了 `git push`（静默 exit 128，无任何输出），而 `git ls-remote` 与 GitHub API 均正常、令牌有效并具备 `push` 权限。
   本地提交已就绪，需开发者在自己的终端执行：
   ```bash
   cd E:\WORK\CampusReserve
   git push -u origin main
   ```

2. 运行环境变量污染（仅影响本机 AI 沙箱，不影响独立运行）：
   当前 AI 开发环境注入了 `SERVER__PORT=4733` 与 `SERVER__HOST=127.0.0.1`，
   Spring Boot 宽松绑定会将其识别为 `server.port` / `server.host`，**优先级高于 `application.yml`**，
   导致后端启动在 4733 端口并仅监听本机回环地址（且 4733 已被宿主进程占用）。
   在沙箱内验证后端时，需先清除这两个环境变量，或显式传 `--server.port=8080` / `--server.address=0.0.0.0`。
   开发者在自己的终端中直接运行不受影响。

3. 本机 3306 实例不可用（见 §8），后续任何数据库操作一律使用 3308 实例。

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

仓库结构（Phase 0 确立）：
```text
CampusReserve/          # 仓库根
├── CampusReserve/      # 微信小程序工程
├── backend/            # Spring Boot 后端
└── docs/               # 全部项目文档
```

Git 提交规范：中文 Conventional Commits，`<type>(<scope>): <中文简述>`。

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
最后完成任务：文档目录与编号统一（五个文档归入 `docs/`），MySQL 连接实测确认  
更新者：Developer（AI 协同）
