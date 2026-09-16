package com.campusreserve.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.HandlerInterceptor;

import com.campusreserve.common.BizException;

/**
 * 登录态校验拦截器。
 *
 * 在 WebConfig 中按路径注册（`/api/bookings` 与 `/api/bookings/**`），
 * 即 docs/05_api_contract.md §4 列出的「需要身份的接口」。
 *
 * 为什么用拦截器而不是每个方法里取一次凭证：
 * 需要身份的接口会越来越多，把「必须已登录」写成一处声明，
 * 就避免了「新加了一个接口却忘了校验身份」这类最容易出的漏洞；
 * 校验规则（Bearer 前缀、签名、过期）也只有一处实现。
 *
 * 拦截失败时抛 BizException（HTTP 401），由 GlobalExceptionHandler 统一出响应体——
 * 不用 `response.sendError`，否则响应体会变成 Spring 默认的错误页，破坏统一响应契约。
 */
public class AuthInterceptor implements HandlerInterceptor {

    /** 校验通过后把用户 ID 放进请求属性，供 Controller 通过 @CurrentUser 取用 */
    public static final String USER_ID_ATTRIBUTE = "cr.userId";

    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenService tokenService;

    public AuthInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Long userId = tokenService.verify(extractToken(request)).orElse(null);
        if (userId == null) {
            // 缺失、格式错、签名不合法、已过期，对客户端都是同一件事：需要重新登录
            throw BizException.unauthorized();
        }
        request.setAttribute(USER_ID_ATTRIBUTE, userId);
        return true;
    }

    /** 从 `Authorization: Bearer <token>` 中取出令牌；格式不符时返回 null */
    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            return null;
        }
        String token = header.substring(BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }
}
