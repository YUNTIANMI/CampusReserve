# CampusReserve
## API 契约

版本：v1.0  
建立时间：2026-09-16（Phase 10「后端与数据层整理」，即首次实现 API 之前）  
状态：**已实现并实测**（对应后端 `backend/`，实测记录见 §8）

本文档是前后端之间唯一的接口约定。技术设计 `02_technical_design.md` §3 给出的 6 个接口清单
在此逐条展开为可实现的契约；**未列入本文档的接口不得由任一端擅自新增**
（技术设计 §16、`AGENTS.md` §5）。

小程序侧的调用方与本文档的对应关系：

| 本文档接口 | 小程序调用方 | 页面 |
|---|---|---|
| `POST /api/auth/login` | `services/auth.ts` `login()` | `pages/login` |
| `GET /api/resources` | `services/resource.ts` `getResources()` | `pages/index`、`pages/resource-list` |
| `GET /api/resources/{id}` | `services/resource.ts` `getResourceDetail()` | `pages/resource-detail` |
| `GET /api/resources/{id}/availability` | `services/resource.ts` `getAvailability()` | `pages/resource-detail` |
| `POST /api/bookings` | `services/booking.ts` `createBooking()` | `pages/resource-detail` |
| `GET /api/bookings/my` | `services/booking.ts` `getMyBookings()` / `getBookingDetail()` | `pages/my-bookings`、`pages/booking-detail` |
| `DELETE /api/bookings/{id}` | `services/booking.ts` `cancelBooking()` | `pages/booking-detail` |

## 1. 通用约定

- 根地址：`http://<host>:8088/api`（小程序端唯一来源是 `CampusReserve/services/config.ts` 的 `API_BASE_URL`）
  —— 端口是 **8088 而非 8080**：8080 已被本机 Docker 里其他项目的容器占用，见 `backend/src/main/resources/application.yml`
- 编码：UTF-8；请求与响应均为 `application/json`
- 字段命名：小驼峰（`resourceId` / `startTime`）
- 时间格式：日期 `YYYY-MM-DD`、时刻 `HH:mm`、时间戳 `YYYY-MM-DD HH:mm:ss`
  （后端不返回带 `T` 的 ISO 8601，也不返回时区偏移——小程序端 `utils/date.ts` 按上述格式直接解析）

## 2. 统一响应体

对应技术设计 §13，与 `backend/common/ApiResponse.java`、小程序 `types/api.ts` 一致。

成功：

```json
{ "code": 0, "message": "success", "data": {} }
```

失败：

```json
{ "code": 409001, "message": "该时间段已被预约", "data": null }
```

规则：

1. `code === 0` 表示业务成功，其余为失败；失败时 `data` 恒为 `null`
2. 失败时 `message` **可直接展示给用户**，小程序端不做二次翻译
3. **业务失败一律使用 HTTP 200 承载**（HTTP 状态只表示「这次请求有没有走完」，
   不表示业务结果）——唯一例外是未登录/登录态失效，见下一条
4. **未登录或登录态失效必须返回 HTTP 401**（body 仍为统一响应体）。
   原因：小程序 `services/request.ts` 以 HTTP 状态码区分「凭证问题」与「业务失败」，
   页面据此执行「清掉本地登录态 + 引导重新登录」（`pages/my-bookings`、`pages/resource-detail`）。
   若改用 HTTP 200 + 业务码承载，页面会把它当成普通失败，用户会反复用失效凭证重试

## 3. 错误码

编号沿用「HTTP 语义 × 1000 + 序号」，与小程序 `utils/booking.ts` 的 `BOOKING_ERROR_CODE` 逐项一致。

| code | HTTP | message（示例） | 触发条件 |
|---|---|---|---|
| `0` | 200 | `success` | 成功 |
| `400001` | 200 | 预约参数有误，请重新选择 | 字段缺失/格式非法；请求的时段不在该资源的开放时段内 |
| `400002` | 200 | 该时间段不符合预约规则，请重新选择 | 结束时间不晚于开始时间，或开始时间已早于当前时间 |
| `401001` | 200 | 微信登录失败，请稍后重试 | `code` 无效或微信 `code2session` 调用失败 |
| `401002` | **401** | 登录状态已失效，请重新登录 | 缺少 `Authorization`、签名不合法、令牌已过期、用户不存在 |
| `404001` | 200 | 该资源不存在或已下架 | 资源 ID 不存在 |
| `404001` | 200 | 未找到该预约，或它不属于当前用户 | 预约 ID 不存在，**或存在但归属他人**（刻意不区分，避免探测他人数据） |
| `409001` | 200 | 该时间段已被预约，请选择其他时段 | 同一资源、同一日期、同一起始时刻已被占用 |
| `409001` | 200 | 该预约已取消，无需重复操作 | 对已取消/已结束的预约再次取消 |
| `500000` | 500 | 服务器开小差了，请稍后重试 | 未预期异常（不向客户端泄漏堆栈） |

> `404001` 同时用于「查询资源」与「预约归属」，取值与小程序 `BOOKING_ERROR_CODE.NOT_FOUND`
> / `RESOURCE_NOT_FOUND` 相同（两者在 `utils/booking.ts` 里本就是同一个值）。

## 4. 鉴权

- 登录成功后由服务端签发 `token`，小程序保存在本地登录态（`store/auth.ts`）并镜像到缓存
- 需要身份的接口在请求头携带：`Authorization: Bearer <token>`
- 需要身份的接口：`POST /api/bookings`、`GET /api/bookings/my`、`DELETE /api/bookings/{id}`
- 无需身份的接口：`GET /api/health`、`POST /api/auth/login`、资源与可用时间的三个查询接口

**token 形态：HMAC-SHA256 签名的自包含令牌**（`header.payload.signature`，Base64URL 编码）：

```json
// payload
{ "uid": 1, "exp": 1790000000 }
```

- 服务端无状态校验：重算签名 + 比对过期时间，**不需要 Redis，也不需要会话表**
  （技术设计 §12 禁止擅自引入 Redis；§2 的核心数据只有 User / Resource / Booking 三张表）
- 签名密钥来自环境变量 `CR_TOKEN_SECRET`；**未配置时服务端在启动时随机生成一把并打印警告**，
  此时重启会使既有 token 失效（开发期可接受，且比在公开仓库里写死一个默认密钥安全）
- 有效期 720 小时（30 天），由 `cr.token.ttl-hours` 配置
- 已知取舍：令牌自包含 ⇒ 无法在服务端单点吊销某个令牌（退出登录只清客户端）。
  若将来需要服务端吊销，正确做法是补一张会话/黑名单表或引入 Redis——
  属于架构变更，需开发者批准，本阶段刻意不做

## 5. 接口明细

### 5.1 `GET /api/health`

连通性自检，非业务接口。无需鉴权。

```json
{ "code": 0, "message": "success", "data": { "status": "UP", "service": "campusreserve-backend" } }
```

### 5.2 `POST /api/auth/login`

需求 §4.8：小程序取一次性 `code`，后端识别用户并返回登录态。

请求：

```json
{ "code": "081Abc..." }
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJ1aWQiOjEsImV4cCI6MTc5MDAwMDAwMH0.xxxxx.yyyy",
    "userInfo": { "id": 1, "nickname": "校园用户" }
  }
}
```

- 首次登录自动建用户（`open_id` 唯一）；已存在则复用同一条记录，昵称等字段不被覆盖
- 失败：`401001`（HTTP 200）
- `avatarUrl` 当前**不返回**（与「开发期不提供图片资源」同一决策，见 `PROJECT_MEMORY.md` §11）；
  真实头像待 Phase 12 补齐，届时只需新增该字段，契约向后兼容

### 5.3 `GET /api/resources`

请求参数（query，均可选）：

| 参数 | 类型 | 说明 |
|---|---|---|
| `type` | string | 资源类型，见 §6；缺省或空串表示不筛选 |
| `limit` | int | 返回条数上限；缺省不限制 |

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": 1,
      "name": "图书馆三楼自习室 A",
      "type": "STUDY_ROOM",
      "location": "图书馆 3 楼东侧",
      "capacity": 60,
      "description": "独立隔间，配备插座与台灯，适合长时间自习。"
    }
  ]
}
```

- 无匹配结果时 `data` 为 `[]`（不是 `null`）——页面据此落到 empty 态
- `imageUrl` 当前不返回（同上）；返回时字段为 `imageUrl`，页面**已有**占位逻辑，无需改动

### 5.4 `GET /api/resources/{id}`

响应：`data` 为单个 `Resource`（结构同 §5.3 的元素）。

**资源不存在时返回 `code: 0` 且 `data: null`**（HTTP 200），而不是 `404001`。理由：

- 小程序 `getResourceDetail()` 明确按「接口正常返回但没有这条数据」→ 页面 empty 态
  （提示「资源不存在」）、「请求失败」→ error 态（提示网络异常 + 重试入口）两条路径实现；
- 「资源不存在」是查到了结果（结果就是没有），不是请求出错；
- 该约定在小程序侧写在 `services/resource.ts` 的注释里，等待本契约确认，现确认如此。

失败：`400001`（id 非正整数）。

### 5.5 `GET /api/resources/{id}/availability`

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| `id` | path | 是 | 资源 ID |
| `date` | query | 是 | `YYYY-MM-DD` |

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "resourceId": 1,
    "date": "2026-09-17",
    "slots": [
      { "startTime": "09:00", "endTime": "10:00", "status": "AVAILABLE" },
      { "startTime": "10:00", "endTime": "11:00", "status": "BOOKED" },
      { "startTime": "11:00", "endTime": "12:00", "status": "DISABLED" }
    ]
  }
}
```

`status` 取值与判定优先级（**服务端是唯一权威，前端不做任何时间推算**）：

1. `DISABLED`：日期为今天且该时段开始时刻**不晚于**当前时间（技术设计 §11 第 4 条）。
   优先级最高——一个已经过去的时段，对用户就是不可预约，不必再区分它当初是否被约满
2. `BOOKED`：该资源、该日期、该起始时刻存在一条**非 `CANCELLED`** 的预约
   （需求 §4.7：取消后时间段恢复可用）
3. `AVAILABLE`：其余情况

失败：`400001`（`date` 缺失或不是合法日期）、`404001`（资源不存在）。

### 5.6 `POST /api/bookings`

鉴权：**需要**。请求体即需求 §4.5 的四项输入：

```json
{ "resourceId": 1, "date": "2026-09-17", "startTime": "09:00", "endTime": "10:00" }
```

响应：`data` 为新建的预约（结构同 §5.7 的元素），`status` 恒为 `PENDING`。

**入参里没有 `userId`**：身份来自凭证，服务端据此写入。前端能替谁下单完全取决于带了谁的 token。

服务端校验顺序（技术设计 §11 六条规则）：

| 序 | 校验 | 失败码 |
|---|---|---|
| 1 | 已登录 | `401002`（HTTP 401） |
| 2 | 参数完整、格式合法、日期真实（拒绝 `2026-02-31`） | `400001` |
| 3 | 结束时刻晚于开始时刻，且开始时刻不早于当前时间 | `400002` |
| 4 | 资源存在 | `404001` |
| 5 | 请求的时段在该资源开放时段内 | `400001` |
| 6 | 同一资源同一日期同一起始时刻未被占用 | `409001` |

第 6 条由**数据库唯一约束 + Service 层检查**双保险（技术设计 §12）：
Service 先查一次以给出友好文案，即便并发下同时通过检查，
数据库那层也必然只放行一条，后到者由全局异常处理翻译成同一个 `409001`。

### 5.7 `GET /api/bookings/my`

鉴权：**需要**。无请求参数（同样没有 `userId`）。

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": 1,
      "resourceId": 1,
      "resourceName": "图书馆三楼自习室 A",
      "location": "图书馆 3 楼东侧",
      "date": "2026-09-17",
      "startTime": "09:00",
      "endTime": "10:00",
      "status": "PENDING",
      "createdAt": "2026-09-16 13:20:41"
    }
  ]
}
```

- **只返回当前用户的预约**（需求 §4.6）。过滤发生在服务端，前端无从伪造
- 返回**全部状态**的原始列表，不排序、不分组：三个页签属于同一份数据的不同视图，
  一次请求全量返回后由页面本地切换（`utils/booking.ts` 的 `selectBookingsByStatus`）
- **`status` 只反映已发生的显式变更**（创建 `PENDING`、取消 `CANCELLED`）。
  「时段已过」不由服务端改写，而由小程序按同一规则派生展示
  （`resolveBookingStatus`）——避免 `GET` 请求产生写副作用
- 未登录/失效：`401002`（HTTP 401）

### 5.8 `DELETE /api/bookings/{id}`

鉴权：**需要**。响应：`data` 为取消后的预约（`status: "CANCELLED"`），
其余字段与取消前**完全一致**（预约编号、创建时间不变）。

- 归属校验：在**本人名下的记录**里按 id 查找。查不到即 `404001`，
  「不存在」与「不属于你」返回同一个错误——避免用错误码差异探测他人预约是否存在
  （需求 §4.7「不得取消其他用户预约」）
- 状态校验：仅允许取消**有效**预约——`CANCELLED` 重复取消、时段已结束的取消，
  均返回 `409001`。客户端 `canCancelBooking()` 只是让按钮不出错，
  绕开 UI 直接调接口同样拦得住（服务端才是权威）
- 取消后该时段对后续提交即为 `AVAILABLE`（需求 §4.7），无需任何清理动作：
  占用判定本身就排除了 `CANCELLED`
- 失败：`400001`（id 非正整数）、`404001`、`409001`、`401002`

## 6. 资源类型取值

与小程序 `types/resource.ts` 的 `ResourceType` 一致，服务端原样返回字符串：

| 取值 | 含义 |
|---|---|
| `STUDY_ROOM` | 自习室 |
| `SEMINAR_ROOM` | 研讨室 |
| `STUDIO` | 摄影棚 |
| `COURT` | 球场 |

## 7. 开发期降级说明（Phase 10 引入的临时机制，不改变契约形状）

1. **微信登录降级**：未配置 `CR_WECHAT_APPID` / `CR_WECHAT_SECRET` 时，服务端不调用微信
   `code2session`，而是由 `code` 派生 `open_id` 直接建/取用户（昵称「校园用户」），
   接口形状、返回字段、错误码与真实模式**完全一致**。配置好密钥后自动切换为真实调用，
   两端代码都不用改。
2. **降级模式下的多用户**：`code` 形如 `dev:<name>` 时，`open_id` 取 `dev-<name>`，
   用于构造「第二个用户」以验证归属校验（他人预约不可取消）。
   其他任意 `code` 一律映射到固定的开发用户 `dev-user`。
   真实微信 `code` 是字母数字串，不会出现 `dev:`，因此该约定在真实模式下不可能被误触发。
3. **数据源开关**：小程序侧 `services/config.ts` 的 `USE_MOCK_DATA` 决定走本地数据源还是本契约。
   Phase 10 结束时**仍为 `true`**（保证九套端到端回归不依赖后端进程），
   切换与联调属 Phase 11。详见 `PROJECT_MEMORY.md` §10。

## 8. 实测记录

见 `tools/api-test/`（Node + 原生 `fetch`，直接打真实后端的 HTTP 接口），
覆盖 §3 的每一个错误码与 §5.6 的六条校验顺序。运行方式：

```bash
cd tools/api-test
node ./api-phase10.js                # 默认 http://127.0.0.1:8088/api
node ./api-phase10.js http://127.0.0.1:8088/api
```
