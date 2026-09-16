package com.campusreserve.common;

/**
 * 业务错误码。
 *
 * 编号规则：HTTP 语义 × 1000 + 序号，与小程序端 CampusReserve/utils/booking.ts 的
 * BOOKING_ERROR_CODE 逐项对齐（两处必须同时改，见 docs/05_api_contract.md §3）。
 *
 * 注意「错误码」与「HTTP 状态码」是两件事：业务失败一律用 HTTP 200 承载，
 * 只有未登录/登录态失效才用 HTTP 401，理由见 docs/05_api_contract.md §2。
 */
public final class ErrorCode {

    /** 成功 */
    public static final int SUCCESS = 0;

    /** 参数错误：字段缺失、格式非法，或请求的时段不在资源开放时段内 */
    public static final int PARAM = 400001;

    /** 非法时间：结束不晚于开始，或开始时刻已早于当前时间 */
    public static final int INVALID_TIME = 400002;

    /** 微信登录失败（code 无效或 code2session 调用失败） */
    public static final int LOGIN_FAILED = 401001;

    /** 未登录或登录态失效（HTTP 401） */
    public static final int UNAUTHORIZED = 401002;

    /** 资源不存在 / 预约不存在或不属于当前用户 */
    public static final int NOT_FOUND = 404001;

    /** 请求的接口不存在（HTTP 404） */
    public static final int ENDPOINT_NOT_FOUND = 404002;

    /** 冲突：时段已被预约，或预约状态已不允许取消 */
    public static final int CONFLICT = 409001;

    /** 服务器内部错误（不向客户端泄漏堆栈） */
    public static final int INTERNAL = 500000;

    private ErrorCode() {
    }
}
