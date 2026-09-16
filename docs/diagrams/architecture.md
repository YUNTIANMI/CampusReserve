# 系统架构图

> 小程序经 HTTP 访问后端；后端严格三层（Controller → Service → Repository）；
> 一致性约束落在数据库。登录 token 为 HMAC 自包含令牌，不引 Redis / 会话表。

```mermaid
flowchart TB
    subgraph client["小程序（原生 + TypeScript）"]
        direction TB
        P1["pages 页面<br/>Page → Service → API"]
        P2["components 组件<br/>ResourceCard / BookingCard / TimeSlot"]
        P3["store / utils<br/>登录态 · 筛选缓存 · 反馈层"]
    end

    subgraph server["后端（Spring Boot 3.5 + Java 17）"]
        direction TB
        C["controller<br/>薄层：接参 + 包响应体"]
        S["service<br/>业务规则 · 时段合成 · 校验"]
        R["repository<br/>JPA 数据访问"]
        A["security<br/>AuthInterceptor + @CurrentUser<br/>HMAC 自包含令牌"]
    end

    subgraph ext["外部"]
        WX["微信 jscode2session<br/>code 换 openid"]
    end

    DB[("MySQL 8.4<br/>campusreserve 库<br/>user / resource / booking")]

    P1 -->|"HTTP · JSON · Bearer token"| C
    C --> S --> R --> DB
    A --> S
    S -.->|"登录（未配置密钥时降级）"| WX
```

三层职责一句话：Controller 只处理 HTTP 与参数，Service 承载业务规则（含可用时段的三步合成、
六条预约校验顺序），Repository 管数据库访问；「同一资源同一日期同一起始时刻只能一条有效预约」
由 `booking.active_slot_key` 生成列 + 唯一索引在数据库层兜底。
