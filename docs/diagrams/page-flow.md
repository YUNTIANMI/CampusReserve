# 页面流程图

> 核心业务闭环：登录 → 首页 → 列表 → 详情 → 选日期 → 选时段 → 预约 → 我的预约 → 详情 → 取消。
> 未登录访问预约流程时会被引导到登录页，登录成功后返回来源页（已选时段保留）。

```mermaid
flowchart TD
    HOME["首页<br/>分类入口 · 热门/推荐资源"]
    LOGIN["登录页<br/>wx.login → POST /api/auth/login"]
    LIST["资源列表<br/>分类筛选 · 四态 · 下拉刷新"]
    DETAIL["资源详情<br/>日期条 · 时间段三态"]
    BOOKING["我的预约<br/>待使用 / 已完成 / 已取消"]
    BDETAIL["预约详情<br/>取消（二次确认）"]

    HOME -->|"点分类 / 查看全部"| LIST
    HOME -->|"点资源卡片"| DETAIL
    LIST -->|"点资源卡片"| DETAIL
    DETAIL -->|"选时段 → 预约"| BOOKING
    BOOKING -->|"点记录"| BDETAIL

    HOME -.->|"顶部用户区"| LOGIN
    DETAIL -.->|"未登录点预约 → 去登录"| LOGIN
    BOOKING -.->|"未登录引导"| LOGIN
    LOGIN -.->|"成功后返回来源页"| DETAIL
    LOGIN -.->|"成功后返回来源页"| BOOKING
```

三处登录入口：首页顶部用户区、资源详情点预约时的未登录引导、我的预约页的未登录引导。
登录成功后自动返回来源页，详情页已选时段保留（`navigateBack` 复用原页面实例）。
