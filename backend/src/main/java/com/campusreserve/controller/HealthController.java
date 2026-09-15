package com.campusreserve.controller;

import com.campusreserve.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 健康检查接口。
 *
 * 用途：Phase 0 用于验证「后端可启动」，Phase 1 起供小程序请求服务连通性自检。
 * 不承载任何业务逻辑。
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public ApiResponse<Map<String, String>> health() {
        return ApiResponse.success(Map.of(
                "status", "UP",
                "service", "campusreserve-backend"
        ));
    }
}
