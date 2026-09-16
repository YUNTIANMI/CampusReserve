# CampusReserve
## 数据库设计

版本：v1.0  
建立时间：2026-09-16（Phase 10「后端与数据层整理」）  
状态：**已实现并实测**（MySQL 8.4.10，实例 `127.0.0.1:3308`，库名 `campusreserve`）

建表脚本即本文档的执行形态：`backend/src/main/resources/db/schema.sql`（结构）、
`db/data.sql`（种子资源）。**两者以本文档为准**，改动前先改本文档。

## 1. 基本信息

| 项 | 取值 |
|---|---|
| DBMS | MySQL 8.4（实测 8.4.10） |
| 实例 | `127.0.0.1:3308`（服务名 `MySQL84`，多项目共用实例） |
| 库名 | `campusreserve` |
| 字符集 / 排序规则 | `utf8mb4` / `utf8mb4_0900_ai_ci` |
| 存储引擎 | InnoDB（需要事务与外键） |
| 表数量 | 3 张：`user` / `resource` / `booking` |

多项目共用实例说明：该实例上还有 `user_db`、`product_db`、`order_db` 等其他项目的库，
本项目**只操作 `campusreserve`**，不读不写其他库（`AGENTS.md` §18）。

安全说明：本仓库是**公开仓库**，数据库口令**不写入任何被 Git 跟踪的文件**。
连接信息通过环境变量注入（`CR_DB_URL` / `CR_DB_USERNAME` / `CR_DB_PASSWORD`，
见 `backend/src/main/resources/application.yml`），开发默认值只含地址与库名，不含口令。

## 2. 命名约定

- 表名、列名：全小写 + 下划线（`resource_id`、`created_at`）
- 表名用**单数**（`booking` 而不是 `bookings`）：一张表一行代表一个实体
- 主键统一 `id`，`BIGINT UNSIGNED AUTO_INCREMENT`
- 时间列 `created_at`，`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- 唯一约束前缀 `uk_`，普通索引前缀 `idx_`，外键前缀 `fk_`
- **保留字规避**：`user` 在 MySQL 8 已不是保留字，但仍统一加反引号书写；
  日期列刻意命名为 `booking_date` 而不是 `date`（后者是 MySQL 关键字，写起来到处要转义）

## 3. 表结构

### 3.1 `user`

需求 §4.8「后端识别用户」的落点。第一版不做复杂账号体系，一个微信 `openid` 对应一行。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, AUTO_INCREMENT | 用户 ID，即 `UserInfo.id` |
| `open_id` | `VARCHAR(64)` | NOT NULL, `uk_user_open_id` | 微信 openid；开发期降级模式下为派生值（见 `05_api_contract.md` §7） |
| `nickname` | `VARCHAR(64)` | NOT NULL | 昵称，即 `UserInfo.nickname` |
| `avatar_url` | `VARCHAR(512)` | NULL | 头像地址；**当前恒为 NULL**（开发期不提供图片资源），字段先留出以免将来改表 |
| `created_at` | `DATETIME` | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 首次登录时间 |

不使用微信 `unionid`：本项目只有小程序一个入口，`openid` 已足够且唯一。

### 3.2 `resource`

需求 §4.3 要求展示图片、名称、类型、地点、容量、描述、当前状态。
其中「当前状态」的第一版含义由**可用时间段**表达（见 §4），不在此表存状态。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, AUTO_INCREMENT | 资源 ID，即 `Resource.id` |
| `name` | `VARCHAR(128)` | NOT NULL | 名称 |
| `type` | `VARCHAR(32)` | NOT NULL, `idx_resource_type` | `STUDY_ROOM` / `SEMINAR_ROOM` / `STUDIO` / `COURT` |
| `location` | `VARCHAR(128)` | NOT NULL | 地点 |
| `capacity` | `INT` | NOT NULL | 容量（人） |
| `description` | `VARCHAR(512)` | NOT NULL DEFAULT `''` | 描述 |
| `image_url` | `VARCHAR(512)` | NULL | 展示图；**当前恒为 NULL**（同上） |
| `open_slots` | `VARCHAR(255)` | NOT NULL | 开放时段，逗号分隔的 `HH:mm-HH:mm` 列表 |

**为什么没有状态列**：需求 §4.3 的「当前状态」在小程序里由选中日期的可用时间段体现；
`types/resource.ts` 也刻意未定义 `status` 字段（其注释写明「待契约确定后补充」）。
凭空加一个没有消费方的列，只会让「上架/下架」这类未来需求被一个语义不清的字段糊住。
真需要下架能力时，应新增语义明确的列并同步契约。

**为什么时段配置放在 `open_slots` 而不是第四张表**：
技术设计 §2 明确核心数据只有 User / Resource / Booking 三张。
时段配置是**资源自身的静态属性**（该场地几点开放），不是独立实体，也不被其他表引用，
一行字符串就够——建 `resource_slot` 表会引入本不需要的连接与维护成本。
若将来需要「每类资源不同的时段模板」「临时关闭某天」，再升级为独立表，
届时 `open_slots` 的解析入口只有 `ResourceService` 一处，改动面可控。

### 3.3 `booking`

预约记录。这是三张表里唯一会被并发写入的表，一致性设计集中在它身上。

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, AUTO_INCREMENT | 预约编号，即 `Booking.id` |
| `user_id` | `BIGINT UNSIGNED` | NOT NULL, `fk_booking_user`, `idx_booking_user` | 归属用户 |
| `resource_id` | `BIGINT UNSIGNED` | NOT NULL, `fk_booking_resource` | 资源 |
| `booking_date` | `DATE` | NOT NULL | 预约日期 |
| `start_time` | `TIME` | NOT NULL | 开始时刻 |
| `end_time` | `TIME` | NOT NULL | 结束时刻 |
| `status` | `VARCHAR(16)` | NOT NULL DEFAULT `'PENDING'` | `PENDING` / `COMPLETED` / `CANCELLED` |
| `created_at` | `DATETIME` | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间，即 `Booking.createdAt` |
| `active_slot_key` | `VARCHAR(64)` | **生成列** STORED, `uk_booking_active_slot` | 见 §5 |

复合索引 `idx_booking_resource_date (resource_id, booking_date)`：可用时间段的查询按
「某资源某天」取该天全部占用记录，这个索引正好覆盖。

`resource_name` / `location` **不冗余存储**在预约表里：它们在查询时由 `resource` 连接得到。
冗余会带来「资源改名后历史预约仍显示旧名字」的不一致，而代价只是一次索引连接。

## 4. 时段模型：为什么可用时间不是「存出来的」

`GET /api/resources/{id}/availability` 的返回**不来自某张表**，而是三步合成：

```text
resource.open_slots  →  生成当天的时段骨架（列表顺序即前端展示顺序）
        ↓
booking 表当天该资源的非 CANCELLED 记录  →  把命中的时段标为 BOOKED
        ↓
日期是今天且时段开始时刻 ≤ 当前时间  →  改写为 DISABLED（优先级最高）
```

理由：

1. **时段是配置与事实的合成结果，不是事实本身**。把 6 个格子预先写进数据库，
   等价于把「09:00-10:00」这个配置复制成每天的生长记录——配置一改，历史数据全部自相矛盾；
2. 这正是开发期数据源的既有语义（`services/mock-resource.ts` 的 `buildDefaultSlots` +
   `overlayBookedSlots`），服务端沿用同一套判定，切换数据源时页面行为不变；
3. `DISABLED` 优先级高于 `BOOKED`：已经过去的时段对用户一律不可预约，
   不必再区分它当初是否被约满。这条与开发期数据源完全一致，属**刻意保持一致**。

## 5. 预约一致性：`active_slot_key` 生成列

技术设计 §12：第一版不实现复杂分布式锁，**使用数据库约束 + Service 层检查**保证基本一致性。

「同一资源、同一日期、同一起始时刻只能有一条有效预约」这条规则有一个麻烦：
**被取消的记录不算占用**（需求 §4.7），因此不能简单地对
`(resource_id, booking_date, start_time)` 建唯一索引——那会让用户取消后无法再约同一时段。

MySQL 不支持部分索引（partial index），因此用**生成列 + 唯一索引**表达这个条件：

```sql
`active_slot_key` VARCHAR(64) GENERATED ALWAYS AS (
  CASE WHEN `status` = 'CANCELLED' THEN NULL
       ELSE CONCAT(`resource_id`, '|', `booking_date`, '|', TIME_FORMAT(`start_time`, '%H:%i'))
  END
) STORED,
UNIQUE KEY `uk_booking_active_slot` (`active_slot_key`)
```

- 有效预约得到 `"1|2026-09-17|09:00"` 这样的键，**物理上不可能重复**
- 取消后该列变成 `NULL`，而 MySQL 唯一索引**允许多个 NULL**，
  于是「取消后可再约同一时段」自然成立，不需要任何额外清理
- 应用层不写这一列（JPA 未映射它），由数据库计算，避免两边算得不一样

双保险的分工：

| 层 | 职责 |
|---|---|
| Service | 先查一次是否已占用，命中则返回**可读文案**的 `409001`（用户看到「该时间段已被预约，请选择其他时段」） |
| 数据库 | 并发下同时通过 Service 检查时，唯一索引必然只放行一条；后到者抛 `DataIntegrityViolationException`，由全局异常处理翻译成同一个 `409001` |

结果：无论并发与否，用户看到的都是同一个错误码与同一句提示，
数据库中也不会出现两条占用同一时段的记录。

`status` 的推进说明：`PENDING → COMPLETED` 由**查询时派生**（小程序端
`resolveBookingStatus`）、不落库，理由见 `05_api_contract.md` §5.7。
`CANCELLED` 是显式写入的唯一状态变更。

## 6. 与小程序类型的字段对应

| 小程序类型（`CampusReserve/types/`） | 数据库来源 |
|---|---|
| `Resource.id / name / type / location / capacity / description` | `resource` 同名列 |
| `Resource.imageUrl?` | `resource.image_url`（当前为 NULL，字段省略） |
| `Availability.resourceId / date / slots[]` | 合成结果（§4），无对应表 |
| `Booking.id / date / startTime / endTime / status / createdAt` | `booking` 对应列（`TIME` / `DATE` 在 DTO 层格式化为 `HH:mm` / `YYYY-MM-DD`） |
| `Booking.resourceId / resourceName / location` | `booking.resource_id` + 连接 `resource` 取名称与地点 |
| `UserInfo.id / nickname` | `user` 同名列 |
| `UserInfo.avatarUrl?` | `user.avatar_url`（当前为 NULL，字段省略） |
| `AuthSession.token` | 不入库（HMAC 自包含令牌，见 `05_api_contract.md` §4） |

## 7. 初始化与种子数据

- 开发期由 Spring 的 `spring.sql.init` 在启动时执行 `schema.sql` + `data.sql`，
  两者都写成**幂等**形态（`CREATE TABLE IF NOT EXISTS`、`INSERT IGNORE` 且带显式主键），
  因此可以反复启动、不会重复插入、也不会覆盖已有数据
- JDBC URL 带 `createDatabaseIfNotExist=true`，库不存在时自动创建，无需手工建库
- 种子资源 8 条，取值与开发期数据源 `services/mock-resource.ts` 的 `MOCK_RESOURCES`
  **逐字段对齐**（含 `id` 1~8）。这样切换数据源时小程序看到的列表完全一致，
  页面与测试都不必为「换了数据源」而改动
- 种子资源的 `open_slots` 统一为开发期时段模板的 6 段：
  `09:00-10:00,10:00-11:00,11:00-12:00,14:00-15:00,15:00-16:00,16:00-17:00`
  （需求 §4.4 的示例时段）
- 种子数据只有 `resource`，**没有** `user` 与 `booking`：
  前者由登录时自动创建，后者由真实预约产生。制造假预约只会让「我的预约」出现
  用户没下过的单
- 清空业务数据用于重新验证：
  ```sql
  DELETE FROM booking;
  ALTER TABLE booking AUTO_INCREMENT = 1;
  ```
  （只动 `campusreserve` 库的三张表，不触碰实例上其他项目的库）
