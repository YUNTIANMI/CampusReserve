package com.campusreserve.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.validation.ConstraintViolationException;

/**
 * 全局异常处理：把各类异常统一翻译成 docs/05_api_contract.md 约定的响应体。
 *
 * 设计要点：
 * 1. **不向客户端泄漏堆栈或框架原文**。框架的报错信息对用户毫无意义，
 *    还会暴露内部结构；对外只给契约里定义好的文案，细节写进服务端日志。
 * 2. **数据库唯一约束冲突要翻译成业务码**。并发下 Service 层的检查可能同时通过，
 *    真正兜底的是 booking 表的唯一索引（见 docs/03_database_design.md §5）；
 *    若不翻译，用户会看到一个 500，而实际原因是「这个时段刚被人抢走了」。
 * 3. HTTP 200 + 业务码是默认形态，只有登录态失效用 401、接口不存在用 404。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 契约中所有入参形状问题的统一对外文案 */
    private static final String PARAM_MESSAGE = "预约参数有误，请重新选择";

    /** 抢占同一时段时数据库唯一索引的名字，见 db/schema.sql */
    private static final String ACTIVE_SLOT_KEY = "uk_booking_active_slot";

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> handleBiz(BizException ex) {
        // 业务失败是预期内的，用 debug/warn 记录即可，不打堆栈
        log.debug("业务失败: code={} message={}", ex.getCode(), ex.getMessage());
        return ResponseEntity.status(ex.getHttpStatus())
                .body(ApiResponse.failure(ex.getCode(), ex.getMessage()));
    }

    /**
     * 数据库约束冲突。
     *
     * 只有「同一资源同一时段」那条唯一索引才翻译成 409001——
     * 其余约束冲突（例如外键指向不存在的行）属于真正的服务端缺陷，按 500 处理，
     * 否则会把实现问题伪装成「用户手速慢了」。
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleIntegrity(DataIntegrityViolationException ex) {
        String detail = String.valueOf(ex.getMostSpecificCause().getMessage());
        if (detail.contains(ACTIVE_SLOT_KEY)) {
            log.debug("并发抢占同一时段，由数据库唯一索引拦下: {}", detail);
            return ResponseEntity.status(200)
                    .body(ApiResponse.failure(ErrorCode.CONFLICT, "该时间段已被预约，请选择其他时段"));
        }
        log.error("数据库约束冲突", ex);
        return internalError();
    }

    /**
     * 入参形状问题：字段缺失、类型不合法、JSON 解析失败等。
     *
     * 对外统一用契约里那一句文案，具体是哪个字段、期望什么，全部记进日志——
     * 对用户「哪个字段错了」没有帮助，对排查却必不可少。
     */
    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            ConstraintViolationException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,
    })
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(Exception ex) {
        if (ex instanceof MethodArgumentNotValidException manv) {
            for (FieldError fieldError : manv.getBindingResult().getFieldErrors()) {
                log.debug("入参校验失败: {} - {}", fieldError.getField(), fieldError.getDefaultMessage());
            }
        } else {
            log.debug("请求参数无法解析: {}", ex.getMessage());
        }
        return ResponseEntity.status(200)
                .body(ApiResponse.failure(ErrorCode.PARAM, PARAM_MESSAGE));
    }

    /** 请求了一个不存在的接口（例如路径拼错），返回 404 而不是 500 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException ex) {
        log.debug("接口不存在: {}", ex.getResourcePath());
        return ResponseEntity.status(404)
                .body(ApiResponse.failure(ErrorCode.ENDPOINT_NOT_FOUND, "请求的接口不存在"));
    }

    /** 兜底：未预期异常一律 500，对外只说「服务器开小差了」 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        log.error("未预期异常", ex);
        return internalError();
    }

    private ResponseEntity<ApiResponse<Void>> internalError() {
        return ResponseEntity.status(500)
                .body(ApiResponse.failure(ErrorCode.INTERNAL, "服务器开小差了，请稍后重试"));
    }
}
