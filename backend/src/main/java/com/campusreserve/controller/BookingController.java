package com.campusreserve.controller;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.campusreserve.common.ApiResponse;
import com.campusreserve.dto.BookingDto;
import com.campusreserve.dto.CreateBookingRequest;
import com.campusreserve.security.CurrentUser;
import com.campusreserve.service.BookingService;

import jakarta.validation.Valid;

/**
 * 预约接口（需求 §4.5 / §4.6 / §4.7）。
 *
 * 三个接口都需要登录：身份由 AuthInterceptor 校验凭证后放进请求属性，
 * 再通过 `@CurrentUser` 注入到方法参数。**三个方法都看不到 token、也拿不到别人 userId**，
 * 这是「归属校验无法被客户端绕开」的形式化保证。
 *
 * 这三个路径同时是 WebConfig 里拦截器的注册范围，两处必须一致。
 */
@RestController
@RequestMapping("/api")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    /**
     * `POST /api/bookings`：创建预约。
     *
     * 请求体只有 resourceId / date / startTime / endTime 四项，
     * **没有 userId**——前端能替谁下单完全取决于带了谁的凭证。
     */
    @PostMapping("/bookings")
    public ApiResponse<BookingDto> create(@CurrentUser Long userId,
                                          @Valid @RequestBody CreateBookingRequest request) {
        return ApiResponse.success(bookingService.create(userId, request));
    }

    /** `GET /api/bookings/my`：我的预约，天然只含本人记录 */
    @GetMapping("/bookings/my")
    public ApiResponse<List<BookingDto>> myBookings(@CurrentUser Long userId) {
        return ApiResponse.success(bookingService.listMine(userId));
    }

    /**
     * `DELETE /api/bookings/{id}`：取消预约。
     *
     * 返回取消后的预约而不是空响应：调用方据此立即把状态标签改成「已取消」，
     * 不必再多发一次查询（见 services/booking.ts 的 cancelBooking 注释）。
     */
    @DeleteMapping("/bookings/{id}")
    public ApiResponse<BookingDto> cancel(@CurrentUser Long userId,
                                         @PathVariable("id") Long id) {
        return ApiResponse.success(bookingService.cancel(userId, id));
    }
}
