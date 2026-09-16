package com.campusreserve.controller;

import java.util.List;
import java.util.Locale;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.campusreserve.common.ApiResponse;
import com.campusreserve.common.BizException;
import com.campusreserve.dto.AvailabilityDto;
import com.campusreserve.dto.ResourceDto;
import com.campusreserve.entity.ResourceType;
import com.campusreserve.service.ResourceService;

/**
 * 资源与可用时间段查询（需求 §4.2 / §4.3 / §4.4）。
 *
 * 三个接口都**不需要登录**：需求 §2 的核心流程是「登录 → 浏览资源」，
 * 但实际使用中用户总是先看到资源才决定要不要登录下单。
 * 不为浏览加身份门槛，也让「未登录也能看」这件事在契约里写死，避免以后被随手加上。
 */
@RestController
@RequestMapping("/api")
public class ResourceController {

    private final ResourceService resourceService;

    public ResourceController(ResourceService resourceService) {
        this.resourceService = resourceService;
    }

    /**
     * `GET /api/resources?type=&limit=`
     *
     * `type` 缺省或空串表示不筛选；给了非法取值返回 400001 而不是静默返回空列表——
     * 静默会把「参数拼错」伪装成「没有数据」，排查时最耗时的一种假象。
     */
    @GetMapping("/resources")
    public ApiResponse<List<ResourceDto>> list(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return ApiResponse.success(resourceService.list(parseType(type), limit));
    }

    /**
     * `GET /api/resources/{id}`
     *
     * 资源不存在时返回 `code: 0` + `data: null`（HTTP 200），不是 404：
     * 「接口正常返回但没有这条数据」应落到页面的 empty 态，而不是 error 态。
     * 约定见 docs/05_api_contract.md §5.4。
     */
    @GetMapping("/resources/{id}")
    public ApiResponse<ResourceDto> detail(@PathVariable("id") Long id) {
        return ApiResponse.success(resourceService.detail(id));
    }

    /** `GET /api/resources/{id}/availability?date=YYYY-MM-DD` */
    @GetMapping("/resources/{id}/availability")
    public ApiResponse<AvailabilityDto> availability(
            @PathVariable("id") Long id,
            @RequestParam("date") String date) {
        return ApiResponse.success(resourceService.availability(id, date));
    }

    /** 把 query 里的类型字符串转成枚举；空串视为不筛选，非法取值直接报参数错误 */
    private ResourceType parseType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return ResourceType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw BizException.param("资源类型不合法");
        }
    }
}
