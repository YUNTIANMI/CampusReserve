package com.campusreserve.common;

/**
 * 统一 API 响应体。
 *
 * 对应 docs/02_technical_design.md §13：
 * 成功 { "code": 0, "message": "success", "data": {...} }
 * 失败 { "code": 409001, "message": "该时间段已被预约", "data": null }
 *
 * @param <T> 业务数据类型
 */
public record ApiResponse<T>(int code, String message, T data) {

    /** 成功状态码 */
    public static final int CODE_SUCCESS = 0;

    /** 成功提示语 */
    public static final String MESSAGE_SUCCESS = "success";

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(CODE_SUCCESS, MESSAGE_SUCCESS, data);
    }

    public static <T> ApiResponse<T> failure(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
