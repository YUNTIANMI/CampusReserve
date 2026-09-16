# 数据库 ER 图

> 三张表：`user`（一个微信 openid 对应一行）、`resource`（静态资源与时段配置）、
> `booking`（预约记录，唯一被并发写入的表）。核心约束在 `booking.active_slot_key`。

```mermaid
erDiagram
    user ||--o{ booking : "发起"
    resource ||--o{ booking : "被预约"

    user {
        bigint id PK "用户 ID"
        varchar open_id UK "微信 openid"
        varchar nickname "昵称"
        varchar avatar_url "头像（当前 NULL）"
        datetime created_at "首次登录"
    }

    resource {
        bigint id PK "资源 ID"
        varchar name "名称"
        varchar type "STUDY_ROOM 等"
        varchar location "地点"
        int capacity "容量"
        varchar description "描述"
        varchar image_url "展示图（当前 NULL）"
        varchar open_slots "开放时段 CSV"
    }

    booking {
        bigint id PK "预约编号"
        bigint user_id FK "归属用户"
        bigint resource_id FK "资源"
        date booking_date "预约日期"
        time start_time "开始时刻"
        time end_time "结束时刻"
        varchar status "PENDING/COMPLETED/CANCELLED"
        datetime created_at "创建时间"
        varchar active_slot_key UK "生成列：并发防重"
    }
```

`active_slot_key` 是 **STORED 生成列 + 唯一索引**：有效预约得到
`"resourceId|date|HH:mm"` 的键（物理不可重复）；取消时求值为 `NULL`
（MySQL 唯一索引允许多个 NULL），因此「取消后可再约同一时段」无需任何清理动作。
