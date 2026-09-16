package com.campusreserve.service;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.campusreserve.common.BizException;
import com.campusreserve.dto.LoginResponse;
import com.campusreserve.dto.UserInfoDto;
import com.campusreserve.entity.UserEntity;
import com.campusreserve.repository.UserRepository;
import com.campusreserve.security.TokenService;

/**
 * 登录（需求 §4.8）。
 *
 * 流程：一次性 code → 识别用户（微信 openid）→ 没有就建一个 → 签发令牌 → 返回用户信息。
 *
 * 两条识别路径（见 docs/05_api_contract.md §7）：
 * - **真实模式**：配置了 `CR_WECHAT_APPID` / `CR_WECHAT_SECRET` 时调用微信 code2session；
 * - **降级模式**：未配置时由 code 派生 openid，不访问微信服务器。
 *   接口形状、返回字段、错误码与真实模式完全一致，因此没有凭据也能完整联调与自动化测试。
 *
 * 昵称沿用开发期数据源的固定值「校园用户」：第一版不做用户资料编辑（需求 §4.8
 * 「不做复杂账号体系」），而微信 `code2session` 本来也只返回 openid、不返回昵称——
 * 想拿昵称得再走 `getUserProfile` 那套授权流程，属于需求之外的额外功能。
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** 新建用户的昵称，与开发期数据源 services/mock-auth.ts 保持一致 */
    private static final String DEFAULT_NICKNAME = "校园用户";

    /** 降级模式下「指定用户」的 code 前缀，例如 `dev:alice` */
    private static final String DEV_CODE_PREFIX = "dev:";

    /** 降级模式下未指定用户名时的固定 openid：同一台设备多次登录得到同一个用户 */
    private static final String DEV_FIXED_OPEN_ID = "dev-user";

    /** openid 允许的字符，避免把任意 code 内容原样写进数据库 */
    private static final Pattern DEV_NAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{1,32}$");

    private final UserRepository userRepository;
    private final WeChatClient weChatClient;
    private final TokenService tokenService;

    /** 降级提示只打印一次，避免每次登录都刷屏 */
    private final AtomicBoolean degradedNoticeLogged = new AtomicBoolean(false);

    public AuthService(UserRepository userRepository, WeChatClient weChatClient, TokenService tokenService) {
        this.userRepository = userRepository;
        this.weChatClient = weChatClient;
        this.tokenService = tokenService;
    }

    /**
     * 登录并签发令牌。
     *
     * 整体一个事务：建用户与分配自增 ID 必须一起成功，
     * 否则会出现「签出了令牌但库里没有这个人」的悬空登录态。
     */
    @Transactional
    public LoginResponse login(String code) {
        if (code == null || code.isBlank()) {
            throw BizException.loginFailed("微信登录失败，请稍后重试");
        }

        String openId = resolveOpenId(code);

        UserEntity user = userRepository.findByOpenId(openId)
                // 首次登录自动建用户；已有用户不覆盖昵称等字段，避免把用户资料冲回默认值
                .orElseGet(() -> userRepository.save(new UserEntity(openId, DEFAULT_NICKNAME)));

        return new LoginResponse(tokenService.issue(user.getId()), UserInfoDto.from(user));
    }

    private String resolveOpenId(String code) {
        if (weChatClient.isConfigured()) {
            return weChatClient.resolveOpenId(code);
        }
        if (degradedNoticeLogged.compareAndSet(false, true)) {
            log.warn("未配置 CR_WECHAT_APPID / CR_WECHAT_SECRET，微信登录降级为开发期本地用户映射"
                    + "（不访问微信服务器）。正式联调请注入凭据。");
        }
        return devOpenId(code);
    }

    /**
     * 降级模式下由 code 派生 openid。
     *
     * `dev:<name>` 映射为固定用户 `dev-<name>`，用于构造第二个用户来验证归属校验
     * （需求 §4.7「不得取消其他用户预约」）；其他任意 code 一律映射到同一个开发用户。
     *
     * 为什么这个约定不会在真实模式下误触发：微信的 code 是字母数字串，不可能出现 `dev:`；
     * 且真实模式下代码根本不会走到本方法。
     */
    private String devOpenId(String code) {
        if (!code.startsWith(DEV_CODE_PREFIX)) {
            return DEV_FIXED_OPEN_ID;
        }
        String name = code.substring(DEV_CODE_PREFIX.length()).trim();
        return DEV_NAME_PATTERN.matcher(name).matches() ? "dev-" + name : DEV_FIXED_OPEN_ID;
    }
}
