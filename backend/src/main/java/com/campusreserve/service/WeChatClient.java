package com.campusreserve.service;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.campusreserve.common.BizException;
import com.campusreserve.config.CrProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 微信 `code2session` 调用（需求 §4.8「小程序获取登录凭证 → 后端识别用户」）。
 *
 * 关于凭据：AppID / AppSecret 通过环境变量注入（`CR_WECHAT_APPID` / `CR_WECHAT_SECRET`），
 * **绝不写入被 Git 跟踪的文件**——本仓库是公开仓库，AppSecret 泄漏等于任何人都能
 * 冒充本项目的小程序去调用微信接口。
 *
 * 未配置凭据时 {@link #isConfigured()} 返回 false，由 AuthService 走开发期降级路径
 * （见 docs/05_api_contract.md §7）。降级不是「绕过登录」：接口形状、返回字段、
 * 错误码完全一致，只是「识别用户」这一步不经过微信服务器，因此没有凭据也能完整联调与测试。
 *
 * 实测记录（2026-09-16）：首次注入真实 AppSecret 实测即暴露一个降级路径测不出的坑——
 * 微信响应 Content-Type 为 text/plain，RestClient 默认的 Jackson 转换器拒收，
 * 已在构造函数中补齐（见下）。修复后可正常解析微信的 JSON 响应体
 * （errcode / openid），完整链路以真实 wx.login 的 code 为准。
 */
@Component
public class WeChatClient {

    private static final Logger log = LoggerFactory.getLogger(WeChatClient.class);

    private static final String CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";

    private final CrProperties properties;
    private final RestClient restClient;

    public WeChatClient(CrProperties properties) {
        this.properties = properties;
        // 微信的 jscode2session 响应头是 text/plain（实测），而 Spring 的 Jackson 转换器
        // 默认只认 application/json，直接 retrieve().body(...) 会抛
        // UnknownContentTypeException（2026-09-16 真实调用首次实测暴露）。
        // 解法：给 RestClient 补一个「额外接受 text/plain 的 Jackson 转换器」，
        // 让微信的 text/plain 响应仍按 JSON 解析。
        MappingJackson2HttpMessageConverter textPlainJson = new MappingJackson2HttpMessageConverter();
        List<MediaType> supported = new ArrayList<>(textPlainJson.getSupportedMediaTypes());
        supported.add(MediaType.TEXT_PLAIN);
        textPlainJson.setSupportedMediaTypes(supported);
        this.restClient = RestClient.builder()
                .messageConverters(converters -> converters.add(0, textPlainJson))
                .build();
    }

    /** AppID 与 AppSecret 都已配置才算配置完整 */
    public boolean isConfigured() {
        CrProperties.Wechat wechat = properties.wechat();
        return wechat != null && notBlank(wechat.appId()) && notBlank(wechat.appSecret());
    }

    /**
     * 用一次性 code 换取 openid。
     *
     * @param code 小程序 `wx.login()` 返回的凭证
     * @throws BizException 微信返回错误码、未拿到 openid、或网络失败（统一 `401001`）
     */
    public String resolveOpenId(String code) {
        CrProperties.Wechat wechat = properties.wechat();
        try {
            Code2SessionResponse response = restClient.get()
                    .uri(CODE2SESSION_URL
                                    + "?appid={appid}&secret={secret}&js_code={code}&grant_type=authorization_code",
                            wechat.appId(), wechat.appSecret(), code)
                    .retrieve()
                    .body(Code2SessionResponse.class);

            if (response == null || response.errCode() != null) {
                // 微信的业务错误（code 已被使用、已过期、IP 未加白名单等）都以 errcode 返回。
                // 具体原因写日志，对外只说「登录失败」——用户看不懂那些码。
                log.warn("微信 code2session 返回错误: errcode={}, errmsg={}",
                        response == null ? "null" : response.errCode(),
                        response == null ? "null" : response.errMsg());
                throw BizException.loginFailed("微信登录失败，请稍后重试");
            }
            if (!notBlank(response.openId())) {
                log.warn("微信 code2session 未返回 openid");
                throw BizException.loginFailed("微信登录失败，请稍后重试");
            }
            return response.openId();
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            // 网络不通、超时、微信返回了非 JSON——对用户都是「登录失败，稍后重试」
            log.error("调用微信 code2session 失败", ex);
            throw BizException.loginFailed("微信登录失败，请稍后重试");
        }
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * code2session 的响应体。
     *
     * `session_key` 刻意不映射成字段也不记日志：它是可以解密用户数据的敏感凭证，
     * 本项目用不到，收到即丢，避免它出现在任何日志或响应里。
     *
     * `errcode` 用 Integer 而不是 int：微信成功时不返回该字段，用基本类型会反序列化成 0，
     * 0 恰好又是「无错误」的意思——这种巧合一旦被后续代码当成判据就会出错，
     * 用包装类型让「没返回」和「返回 0」在类型上就是两件事。
     */
    private record Code2SessionResponse(
            @JsonProperty("openid") String openId,
            @JsonProperty("errcode") Integer errCode,
            @JsonProperty("errmsg") String errMsg
    ) {
    }
}
