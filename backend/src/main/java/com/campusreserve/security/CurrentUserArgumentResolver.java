package com.campusreserve.security;

import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import com.campusreserve.common.BizException;

/**
 * 把 {@link CurrentUser} 标注的参数解析成 AuthInterceptor 校验后放进请求属性的用户 ID。
 *
 * 取不到时直接抛 401 而不是传 null：让「没登录」在这里就断掉，
 * 业务代码不必在每个方法开头写 `if (userId == null)`——
 * 那种判断写十遍就会漏一遍，而漏掉的那一遍就是越权。
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && Long.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Object userId = webRequest.getAttribute(AuthInterceptor.USER_ID_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        if (userId == null) {
            // 正常情况下拦截器已经拦下了；能走到这里说明拦截器没覆盖到该路径
            throw BizException.unauthorized();
        }
        return userId;
    }
}
