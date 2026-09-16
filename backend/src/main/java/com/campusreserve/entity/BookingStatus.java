package com.campusreserve.entity;

/**
 * 预约状态，取值与小程序 CampusReserve/types/booking.ts 的 `BookingStatus` 一致。
 *
 * 只有 `CANCELLED` 是由接口显式写入的变更；`COMPLETED` 不落库——
 * 「时段已过」由客户端按时间派生展示（见 docs/05_api_contract.md §5.7），
 * 避免 GET 请求产生写副作用。
 *
 * 该枚举还被 booking 表的生成列用于判定占用：
 * `status = 'CANCELLED'` 时 `active_slot_key` 变为 NULL（见 docs/03_database_design.md §5），
 * 因此这里的字面量必须与 schema.sql 中的字符串完全一致。
 */
public enum BookingStatus {

    /** 待使用 */
    PENDING,

    /** 已完成（保留取值：将来若由服务端定时任务推进状态会用到） */
    COMPLETED,

    /** 已取消 */
    CANCELLED,
}
