package com.campusreserve.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.campusreserve.config.CrProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 登录令牌的签发与校验（`header.payload.signature`，Base64URL，HMAC-SHA256）。
 *
 * 为什么是自包含令牌而不是会话表 / Redis（决策见 docs/05_api_contract.md §4）：
 * - 技术设计 §12 明确禁止擅自引入 Redis；
 * - 技术设计 §2 的核心数据只有 User / Resource / Booking 三张表，
 *   为「谁登录了」单独加一张表会超出既定数据库设计；
 * - 无状态校验不需要任何存储，重启、多实例都不受影响。
 *
 * 代价是**无法在服务端吊销单个令牌**（退出登录只清客户端）。这是刻意接受的取舍：
 * 本项目没有「强制下线」「异地登录提醒」这类需求。将来若要，正确做法是补会话表或引入 Redis，
 * 属架构变更，需先报告开发者，而不是在此偷偷加一个黑名单。
 *
 * 密钥来源：`cr.token.secret`（环境变量 CR_TOKEN_SECRET）。
 * **未配置时启动随机生成一把并打警告** —— 绝不使用写死的默认密钥：
 * 本仓库是公开仓库，写死的密钥等同于把「伪造任意用户登录态」的能力公开出去。
 * 随机密钥的代价是重启后旧令牌失效，开发期可接受。
 */
@Service
public class TokenService {

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);

    /** 固定头部：声明算法与用途，便于与其它体系的令牌区分 */
    private static final String HEADER_JSON = "{\"alg\":\"HS256\",\"typ\":\"CR-TOKEN\"}";

    /** 令牌段数 */
    private static final int SEGMENT_COUNT = 3;

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /** 未配置密钥时的兜底有效期（小时） */
    private static final long DEFAULT_TTL_HOURS = 720L;

    private final ObjectMapper objectMapper;
    private final SecretKeySpec secretKey;
    private final long ttlHours;

    public TokenService(CrProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;

        CrProperties.Token token = properties.token();
        String configured = token == null ? null : token.secret();
        Long configuredTtl = token == null ? null : token.ttlHours();
        this.ttlHours = configuredTtl == null || configuredTtl <= 0 ? DEFAULT_TTL_HOURS : configuredTtl;

        if (configured == null || configured.isBlank()) {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            this.secretKey = new SecretKeySpec(random, HMAC_ALGORITHM);
            log.warn("未配置 cr.token.secret（环境变量 CR_TOKEN_SECRET），已随机生成签名密钥；"
                    + "本次启动签发的令牌在服务重启后将全部失效。正式联调请注入固定密钥。");
        } else {
            this.secretKey = new SecretKeySpec(configured.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
        }
    }

    /** 令牌有效期（小时），供日志与文档说明使用 */
    public long getTtlHours() {
        return ttlHours;
    }

    /**
     * 为指定用户签发令牌。
     *
     * payload 只放两项：用户 ID 与过期时间戳。
     * **不放昵称、openid 等任何业务字段**——令牌会存在客户端，
     * 且用户信息随时可能变，把快照塞进去只会产生「令牌里的昵称与库里不一致」的问题。
     */
    public String issue(long userId) {
        try {
            long expiresAt = Instant.now().plus(ttlHours, ChronoUnit.HOURS).getEpochSecond();
            String header = encode(HEADER_JSON.getBytes(StandardCharsets.UTF_8));
            String payload = encode(objectMapper.writeValueAsBytes(
                    objectMapper.createObjectNode().put("uid", userId).put("exp", expiresAt)));
            String signingInput = header + "." + payload;
            return signingInput + "." + encode(sign(signingInput));
        } catch (Exception ex) {
            // 序列化一个只含两个数字的对象不可能失败；真失败说明环境异常，按 500 暴露
            throw new IllegalStateException("签发登录令牌失败", ex);
        }
    }

    /**
     * 校验令牌并取出用户 ID。
     *
     * 任何一步不通过都返回空 Optional（由调用方统一转成 401）：
     * 令牌格式错、签名不符、已过期——对客户端来说都是同一件事，无需区分。
     *
     * @param token 令牌原文；为空或格式不符时返回空
     */
    public Optional<Long> verify(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }

        String[] segments = token.split("\\.");
        if (segments.length != SEGMENT_COUNT) {
            return Optional.empty();
        }

        try {
            String signingInput = segments[0] + "." + segments[1];
            byte[] expected = sign(signingInput);
            byte[] actual = Base64.getUrlDecoder().decode(segments[2]);
            // 定长比较，避免因比较耗时差异泄漏签名信息
            if (!MessageDigest.isEqual(expected, actual)) {
                return Optional.empty();
            }

            JsonNode payload = objectMapper.readTree(Base64.getUrlDecoder().decode(segments[1]));
            long expiresAt = payload.path("exp").asLong(0);
            if (expiresAt <= Instant.now().getEpochSecond()) {
                return Optional.empty();
            }

            long userId = payload.path("uid").asLong(0);
            return userId > 0 ? Optional.of(userId) : Optional.empty();
        } catch (Exception ex) {
            // 非法 Base64 / 非法 JSON 都归入「令牌不可信」
            return Optional.empty();
        }
    }

    private byte[] sign(String signingInput) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(secretKey);
        return mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
    }

    private String encode(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
