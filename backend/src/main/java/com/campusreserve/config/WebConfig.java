package com.campusreserve.config;

import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.campusreserve.security.AuthInterceptor;
import com.campusreserve.security.CurrentUserArgumentResolver;
import com.campusreserve.security.TokenService;

/**
 * Web 层装配：注册登录态拦截器与 @CurrentUser 参数解析器。
 *
 * 需要身份的路径在此集中声明（对应 docs/05_api_contract.md §4）：
 * 预约相关的三个接口。资源与可用时间的查询、健康检查、登录本身都不需要身份，
 * 刻意不为它们加拦截——未登录也应当能浏览资源（需求 §2 的核心流程里，
 * 登录发生在浏览之后）。
 */
@Configuration
@EnableConfigurationProperties(CrProperties.class)
public class WebConfig implements WebMvcConfigurer {

    private final TokenService tokenService;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;

    public WebConfig(TokenService tokenService, CurrentUserArgumentResolver currentUserArgumentResolver) {
        this.tokenService = tokenService;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new AuthInterceptor(tokenService))
                .addPathPatterns("/api/bookings", "/api/bookings/**");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }
}
