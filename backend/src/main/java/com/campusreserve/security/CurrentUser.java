package com.campusreserve.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前登录用户 ID。
 *
 * 用法：`public ApiResponse<Booking> create(@CurrentUser Long userId, @RequestBody ... req)`
 *
 * 为什么不让 Controller 自己去读请求头：
 * 一是 Controller 不该知道凭证放在哪个请求头、怎么解析；
 * 二是让「这个接口需要身份」在方法签名上就能一眼看出来，
 * 而取值的合法性由 AuthInterceptor 与 CurrentUserArgumentResolver 共同保证
 * （前者校验，后者取值并在取不到时直接 401，不会把 null 传给业务代码）。
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentUser {
}
