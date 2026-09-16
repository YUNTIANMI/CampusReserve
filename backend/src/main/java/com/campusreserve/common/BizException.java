package com.campusreserve.common;

/**
 * 业务异常：Service 层判定不通过时抛出，由 {@link GlobalExceptionHandler} 统一翻译成
 * 统一响应体（技术设计 §13）。
 *
 * 为什么带上 httpStatus 而不是一律 200：
 * 小程序 services/request.ts 用 HTTP 状态码区分「凭证问题」与「业务失败」——
 * HTTP 401 触发「清掉本地登录态 + 引导重新登录」，其余业务失败走提示分支。
 * 把这件事交给异常本身表达，Controller 里就不需要任何 try/catch。
 */
public class BizException extends RuntimeException {

    /** 业务错误码，见 {@link ErrorCode} */
    private final int code;

    /** 响应的 HTTP 状态码 */
    private final int httpStatus;

    public BizException(int code, String message, int httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public int getCode() {
        return code;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    // ---------------------------------------------------------------------
    // 按语义命名的工厂方法，避免各处手写码值导致不一致
    // ---------------------------------------------------------------------

    public static BizException param(String message) {
        return new BizException(ErrorCode.PARAM, message, 200);
    }

    public static BizException invalidTime(String message) {
        return new BizException(ErrorCode.INVALID_TIME, message, 200);
    }

    public static BizException loginFailed(String message) {
        return new BizException(ErrorCode.LOGIN_FAILED, message, 200);
    }

    public static BizException unauthorized() {
        return new BizException(ErrorCode.UNAUTHORIZED, "登录状态已失效，请重新登录", 401);
    }

    public static BizException notFound(String message) {
        return new BizException(ErrorCode.NOT_FOUND, message, 200);
    }

    public static BizException conflict(String message) {
        return new BizException(ErrorCode.CONFLICT, message, 200);
    }
}
