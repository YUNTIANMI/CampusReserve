package com.campusreserve.dto;

/**
 * 时间段，对应小程序 `types/resource.ts` 的 `TimeSlot`。
 *
 * `startTime` / `endTime` 已经是 `HH:mm` 字符串，`status` 是
 * `AVAILABLE` / `BOOKED` / `DISABLED` 三个字面量之一——
 * 状态判定完全在服务端完成（见 docs/05_api_contract.md §5.5），
 * 客户端只负责按状态渲染，不做任何时间推算。
 *
 * 因此本 record 直接用 String 而不是 LocalTime：
 * 服务端生成时就已经格式化成契约要求的形态，不需要依赖序列化器再转一次。
 */
public record TimeSlotDto(String startTime, String endTime, String status) {

    public static final String STATUS_AVAILABLE = "AVAILABLE";
    public static final String STATUS_BOOKED = "BOOKED";
    public static final String STATUS_DISABLED = "DISABLED";
}
