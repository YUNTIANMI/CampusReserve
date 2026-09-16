package com.campusreserve.dto;

import java.time.LocalDate;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 指定资源在指定日期的可用时间段，对应小程序 `types/resource.ts` 的 `Availability`。
 *
 * `date` 显式指定格式：LocalDate 的默认序列化虽然也是 `YYYY-MM-DD`，
 * 但把它写出来，将来即使有人给 LocalDate 换了全局序列化配置，本接口也不会跟着变。
 */
public record AvailabilityDto(

        Long resourceId,

        @JsonFormat(pattern = "yyyy-MM-dd")
        LocalDate date,

        List<TimeSlotDto> slots
) {
}
