package com.campusreserve.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.campusreserve.common.ApiResponse;
import com.campusreserve.dto.LoginRequest;
import com.campusreserve.dto.LoginResponse;
import com.campusreserve.service.AuthService;

import jakarta.validation.Valid;

/**
 * 登录接口（需求 §4.8）。
 *
 * Controller 只做三件事：接 HTTP、校验入参形状、把结果包成统一响应体。
 * 事务、建用户、签发令牌都在 AuthService；本类没有一行业务判断。
 */
@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** `POST /api/auth/login`，body `{ "code": "..." }`；失败返回业务码 401001 */
    @PostMapping("/auth/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request.code()));
    }
}
