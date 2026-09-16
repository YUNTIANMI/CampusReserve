package com.campusreserve.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 登录入参：`POST /api/auth/login`，body `{ "code": "..." }`。
 *
 * `code` 是 `wx.login()` 返回的一次性凭证，由小程序端 services/auth.ts 取到后原样传来。
 * 后端不校验它的格式——微信的 code 形态由微信决定，这里越俎代庖只会误伤。
 * 形状（非空）校验由 Bean Validation 完成，语义校验在 AuthService。
 */
public record LoginRequest(

        @NotBlank(message = "缺少微信登录凭证")
        String code
) {
}
