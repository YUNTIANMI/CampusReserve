# CampusReserve
## 技术选型、工程规范与开发约束

版本：v1.0

## 1. 选型原则

- 简单
- 稳定
- 易维护
- 适合 AI 协同开发
- 能体现真实开发能力
- 控制开发量

## 2. 技术栈

### 小程序
- 微信小程序原生框架
- TypeScript
- WXML
- WXSS

重点展示：
页面、组件、生命周期、网络请求、缓存、路由、表单、状态处理。

### 后端
- Java
- Spring Boot
- Maven

仅实现：
用户、资源、可用时间、预约、我的预约、取消预约。

### 数据库
- MySQL

核心数据：
- User
- Resource
- Booking

## 3. API

建议：
- `GET /api/resources`
- `GET /api/resources/{id}`
- `GET /api/resources/{id}/availability`
- `POST /api/bookings`
- `GET /api/bookings/my`
- `DELETE /api/bookings/{id}`

统一 JSON 响应。

## 4. 小程序目录规范

> 仓库为前后端同仓：小程序工程位于仓库的 `CampusReserve/` 子目录，后端位于 `backend/`。
> 下列路径均相对于小程序工程根目录（即 `CampusReserve/`）。

```text
pages/
components/
services/
utils/
types/
store/
```

- `pages`：页面
- `components`：可复用 UI
- `services`：API 请求
- `utils`：工具
- `types`：类型
- `store`：必要的全局状态

## 5. 前端规范

Page 负责页面状态和交互，不堆积业务逻辑。

推荐：
`Page → Service → API`

统一封装请求：
- `getResources()`
- `getResourceDetail(id)`
- `getAvailability(id, date)`
- `createBooking(data)`
- `getMyBookings()`
- `cancelBooking(id)`

TypeScript 尽量使用明确类型，避免无必要的 `any`。

## 6. 组件规范

优先组件化：
- `ResourceCard`
- `CategoryCard`
- `TimeSlot`
- `BookingCard`
- `EmptyState`
- `LoadingState`
- `ErrorState`

组件保持单一职责。

## 7. 页面状态

统一考虑：
- `loading`
- `success`
- `empty`
- `error`

## 8. 生命周期

按实际需求使用：
- `onLoad`
- `onShow`
- `onHide`
- `onUnload`

不要无意义堆生命周期逻辑。

## 9. 缓存

只缓存必要数据：
- `userInfo`
- `loginState`
- 最近筛选条件

不能用缓存代替数据库。

## 10. 后端分层

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
MySQL
```

Controller：HTTP 与参数。  
Service：业务规则。  
Repository：数据库访问。

禁止 Controller 直接访问数据库。

## 11. 预约规则

1. 用户已登录
2. Resource 存在
3. 时间合法
4. 时间不得早于当前时间
5. 同一资源同一时间段不能重复预约
6. 用户只能取消自己的预约

## 12. 并发

第一版不实现复杂分布式锁。
使用数据库约束 + Service 层检查保证基本一致性。

禁止 AI 擅自引入 Redis 分布式锁。

## 13. API 响应

成功：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

失败：

```json
{
  "code": 409001,
  "message": "该时间段已被预约",
  "data": null
}
```

## 14. Git

Commit Message 一律使用中文 Conventional Commits：

```text
<type>(<scope>): <中文简述>
```

Commit 类型：
- `feat` 新功能
- `fix` 缺陷修复
- `docs` 文档
- `refactor` 重构
- `perf` 性能优化
- `test` 测试
- `build` 构建与依赖
- `chore` 杂项

scope（可选）：`miniprogram` / `backend` / `docs` / `db` / `api`

要求：
- 简述使用中文动宾结构，不加句号，不超过 50 字
- 禁止 `update`、`修改`、`提交`、`fix bug` 等无信息量描述
- 提交信息中不得出现真实密码、密钥、令牌

示例：

```text
feat(miniprogram): 新增资源列表页与分类筛选
fix(backend): 修复同一时段重复预约未被拦截
docs: 统一文档目录并修正编号
```

## 15. AI 开发约束

AI 必须：
1. 先读 `docs/PROJECT_MEMORY.md`
2. 再读当前任务相关文档
3. 修改前说明计划
4. 只改当前任务相关文件
5. 不擅改架构
6. 不擅加依赖
7. 不擅加功能
8. 不删现有功能
9. 修改后运行测试
10. 阶段完成后更新 `docs/PROJECT_MEMORY.md`

## 16. 禁止事项

未经批准不得：
- 重构整个项目
- 换技术栈
- 改数据库设计
- 改 API 契约
- 删除功能
- 增加无关功能
- 修改无关文件

发现明显设计问题时先报告，不直接重构。

## 17. 完成标准

功能实现、编译通过、测试通过、页面正常、联调成功、文档同步后才算完成。

## 18. 决策原则

AI 是执行与分析工具，不是最终决策者。
需求、架构和技术决策由开发者确认。
需求有歧义时停止实现并提问。
