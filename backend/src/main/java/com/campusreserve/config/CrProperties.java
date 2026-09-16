package com.campusreserve.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 项目自身配置（前缀 `cr`，见 application.yml）。
 *
 * 用 record 承载：配置在启动时绑定一次、之后不再变化，天然不可变。
 * 所有值都允许为空缺省，由使用方决定缺省时如何降级——
 * 这正是「公开仓库不写死密钥」的实现方式：本文件里没有任何密钥字面量。
 *
 * @param token  登录令牌相关配置
 * @param wechat 微信登录相关配置
 */
@ConfigurationProperties(prefix = "cr")
public record CrProperties(Token token, Wechat wechat) {

    /**
     * @param secret   HMAC 签名密钥；为空时由 TokenService 在启动时随机生成
     * @param ttlHours 令牌有效期（小时）
     */
    public record Token(String secret, Long ttlHours) {
    }

    /**
     * @param appId     小程序 AppID；与 appSecret 任一为空即视为「未配置」
     * @param appSecret 小程序 AppSecret，绝不写入被 Git 跟踪的文件
     */
    public record Wechat(String appId, String appSecret) {
    }
}
