package com.campusreserve.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 创建预约入参，对应小程序 `types/booking.ts` 的 `CreateBookingPayload`
 * 与需求 §4.5 的四项输入。
 *
 * **没有 userId**：身份来自登录凭证，服务端据此写入。
 * 前端能替谁下单，完全取决于带了谁的 token——这正是需求 §4.5 第 1 项
 * 「用户已登录」的落点，而不是靠客户端自觉传对 userId。
 *
 * 这里只做形状校验（有没有传、是不是空串）；「日期真不真实」「时刻合不合法」
 * 「时段是否仍可用」全部属于业务判定，在 BookingService 里按固定顺序执行
 * （见 docs/05_api_contract.md §5.6），以保证错误码与开发期数据源一致。
 */
public record CreateBookingRequest(

        @NotNull(message = "缺少资源信息")
        Long resourceId,

        @NotBlank(message = "缺少预约日期")
        String date,

        @NotBlank(message = "缺少开始时间")
        String startTime,

        @NotBlank(message = "缺少结束时间")
        String endTime
) {
}
