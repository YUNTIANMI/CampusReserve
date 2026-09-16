package com.campusreserve.dto;

/**
 * 登录响应，对应小程序 `types/user.ts` 的 `AuthSession`。
 *
 * 形状刻意与开发期数据源（services/mock-auth.ts 的 mockLogin）完全一致，
 * 这样把 `USE_MOCK_DATA` 切到 false 时，services/auth.ts 与页面代码都不用改。
 *
 * @param token    登录令牌，客户端保存在本地登录态，后续请求放在 Authorization 头
 * @param userInfo 用户基础信息
 */
public record LoginResponse(String token, UserInfoDto userInfo) {
}
