package com.campusreserve.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import com.campusreserve.entity.BookingEntity;
import com.campusreserve.entity.BookingStatus;
import com.campusreserve.entity.ResourceEntity;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 预约记录，对应小程序 `types/booking.ts` 的 `Booking`。
 *
 * 时间字段全部显式声明格式，理由是这不是「怎么好看」的问题而是契约问题：
 * 小程序 utils/date.ts 按定长字符串解析（`YYYY-MM-DD` / `HH:mm`），
 * 若序列化成 ISO 8601（`2026-09-17T09:00:00`），列表与详情的时间展示会直接错位。
 *
 * `resourceName` 与 `location` 来自连接 resource 表（预约表不冗余存储它们，
 * 见 docs/03_database_design.md §3.3）：页面列表要直接展示资源名与地点，
 * 每次都让前端再查一次资源既慢又可能失败。
 */
public record BookingDto(

        Long id,

        Long resourceId,

        String resourceName,

        String location,

        @JsonFormat(pattern = "yyyy-MM-dd")
        LocalDate date,

        @JsonFormat(pattern = "HH:mm")
        LocalTime startTime,

        @JsonFormat(pattern = "HH:mm")
        LocalTime endTime,

        BookingStatus status,

        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        LocalDateTime createdAt
) {

    /**
     * 由预约记录 + 其所属资源合成。
     *
     * 资源取自连接结果；若资源已被删除（外键约束下正常不会发生），
     * 名称与地点退化为空串而不是抛错——一条看不清资源名的历史预约，
     * 也胜过让整个「我的预约」列表打不开。
     */
    public static BookingDto from(BookingEntity booking, ResourceEntity resource) {
        return new BookingDto(
                booking.getId(),
                booking.getResourceId(),
                resource == null ? "" : resource.getName(),
                resource == null ? "" : resource.getLocation(),
                booking.getBookingDate(),
                booking.getStartTime(),
                booking.getEndTime(),
                booking.getStatus(),
                booking.getCreatedAt());
    }
}
