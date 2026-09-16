package com.campusreserve.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.campusreserve.common.BizException;
import com.campusreserve.common.TimeFormats;
import com.campusreserve.dto.BookingDto;
import com.campusreserve.dto.CreateBookingRequest;
import com.campusreserve.entity.BookingEntity;
import com.campusreserve.entity.BookingStatus;
import com.campusreserve.entity.ResourceEntity;
import com.campusreserve.entity.UserEntity;
import com.campusreserve.repository.BookingRepository;
import com.campusreserve.repository.ResourceRepository;
import com.campusreserve.repository.UserRepository;

/**
 * 预约业务（需求 §4.5 / §4.6 / §4.7）。
 *
 * 技术设计 §11 的六条预约规则在这里逐条落地，顺序刻意固定
 * （与 docs/05_api_contract.md §5.6 的表格一致，也与开发期数据源
 * services/mock-booking.ts 的校验顺序一致）：先判「请求本身对不对」，再判「目标存不存在」，
 * 最后才判「能不能约」。顺序错了会出现「资源不存在」被报成「参数错误」这类误导性提示。
 *
 * 一致性（技术设计 §12）：Service 层先查一次以给出可读文案，
 * 数据库唯一索引 `uk_booking_active_slot` 兜住并发——两层都指向同一个 `409001`，
 * 见 docs/03_database_design.md §5。
 */
@Service
public class BookingService {

    /** 归属校验失败与资源不存在共用同一个错误码，文案区分（见 docs/05_api_contract.md §3） */
    private static final String NOT_FOUND_MESSAGE = "未找到该预约，或它不属于当前用户";

    private final UserRepository userRepository;
    private final ResourceRepository resourceRepository;
    private final BookingRepository bookingRepository;

    public BookingService(UserRepository userRepository,
                          ResourceRepository resourceRepository,
                          BookingRepository bookingRepository) {
        this.userRepository = userRepository;
        this.resourceRepository = resourceRepository;
        this.bookingRepository = bookingRepository;
    }

    /**
     * 创建预约（需求 §4.5）。
     *
     * @param userId 由 @CurrentUser 注入，来自登录凭证——**不来自请求体**
     * @throws BizException 401002 / 400001 / 400002 / 404001 / 409001
     */
    @Transactional
    public BookingDto create(Long userId, CreateBookingRequest request) {
        // 1. 用户已登录且仍然存在（凭证有效但账号已被删除时不能继续）
        requireUser(userId);

        // 2. 参数形状与日期真实性
        Long resourceId = request.resourceId();
        if (resourceId == null || resourceId <= 0) {
            throw BizException.param("资源信息有误，请返回重新选择");
        }
        LocalDate date = TimeFormats.parseDate(request.date());
        LocalTime start = TimeFormats.parseTime(request.startTime());
        LocalTime end = TimeFormats.parseTime(request.endTime());

        // 3. 时间合法：结束晚于开始，且开始时刻不早于当前时间
        requireBookableTime(date, start, end);

        // 4. 资源存在（技术设计 §11 第 2 条）
        ResourceEntity resource = resourceRepository.findById(resourceId)
                .orElseThrow(() -> BizException.notFound("该资源不存在或已下架"));

        // 5. 请求的时段在该资源的开放范围内
        requireOpenSlot(resource, start, end);

        // 6. 同一资源同一日期同一起始时刻未被占用（技术设计 §11 第 5 条）
        requireSlotFree(resourceId, date, start);

        BookingEntity saved = bookingRepository.save(
                new BookingEntity(userId, resourceId, date, start, end, BookingStatus.PENDING));
        return BookingDto.from(saved, resource);
    }

    /**
     * 我的预约（需求 §4.6）。
     *
     * 只返回当前用户的记录，**过滤发生在服务端**：前端无从伪造身份，
     * 因此「用户只能看到自己的预约」不是靠客户端自觉。
     *
     * 返回全部状态的原始列表、不排序不分组：三个页签是同一份数据的不同视图，
     * 一次请求全量返回后由页面本地切换（utils/booking.ts 的 selectBookingsByStatus）。
     */
    @Transactional(readOnly = true)
    public List<BookingDto> listMine(Long userId) {
        requireUser(userId);

        List<BookingEntity> bookings =
                bookingRepository.findByUserIdOrderByBookingDateAscStartTimeAscIdAsc(userId);
        if (bookings.isEmpty()) {
            return List.of();
        }

        // 一次查出本页涉及的全部资源，避免逐条查询（N+1）。
        // 连接放在 Service 而不是 Repository 的 JPQL 构造表达式里：
        // 映射逻辑（资源缺失时退化为空串）需要一个明确的落点，放在这里比藏在查询注解里可读。
        Map<Long, ResourceEntity> resources = resourceRepository
                .findAllById(bookings.stream().map(BookingEntity::getResourceId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(ResourceEntity::getId, resource -> resource));

        return bookings.stream()
                .map(booking -> BookingDto.from(booking, resources.get(booking.getResourceId())))
                .toList();
    }

    /**
     * 取消预约（需求 §4.7）。
     *
     * 归属校验靠 `findByIdAndUserId` 一步到位：查不到即等于「不存在或不属于当前用户」，
     * 两种情况刻意返回同一个错误——否则可以用错误码差异探测他人预约是否存在
     * （技术设计 §11 第 6 条「用户只能取消自己的预约」）。
     *
     * 状态校验是权威：客户端的 `canCancelBooking()` 只负责让按钮不出错，
     * 绕开界面直接调接口同样拦得住。
     */
    @Transactional
    public BookingDto cancel(Long userId, Long bookingId) {
        requireUser(userId);

        if (bookingId == null || bookingId <= 0) {
            throw BizException.param("预约信息有误，请返回重试");
        }

        BookingEntity booking = bookingRepository.findByIdAndUserId(bookingId, userId)
                .orElseThrow(() -> BizException.notFound(NOT_FOUND_MESSAGE));

        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw BizException.conflict("该预约已取消，无需重复操作");
        }
        if (isFinished(booking)) {
            throw BizException.conflict("该预约已结束，无需取消");
        }

        // 只改状态，编号与创建时间原样保留——取消不是「重新写一条记录」
        booking.cancel();
        BookingEntity updated = bookingRepository.save(booking);

        ResourceEntity resource = resourceRepository.findById(booking.getResourceId()).orElse(null);
        return BookingDto.from(updated, resource);
    }

    /** 用户必须存在；凭证有效但账号不存在时按登录态失效处理（401） */
    private UserEntity requireUser(Long userId) {
        if (userId == null) {
            throw BizException.unauthorized();
        }
        return userRepository.findById(userId).orElseThrow(BizException::unauthorized);
    }

    /** 结束晚于开始（400002），且开始时刻不早于当前时间（400002） */
    private void requireBookableTime(LocalDate date, LocalTime start, LocalTime end) {
        if (!end.isAfter(start)) {
            throw BizException.invalidTime("预约时间不合法，请重新选择时间段");
        }
        // 用户可能在详情页停留很久，页面上的时段是加载时的快照，提交这一刻它可能已经过期；
        // 因此这条只能在提交时重新判定（与 utils/booking.ts 的 validateBookingPayload 同规则）
        if (LocalDateTime.of(date, start).isBefore(LocalDateTime.now())) {
            throw BizException.invalidTime("该时间段已过时，请选择其他时段");
        }
    }

    /** 请求的时段必须与资源开放时段中的某一段完全一致 */
    private void requireOpenSlot(ResourceEntity resource, LocalTime start, LocalTime end) {
        String wanted = TimeFormats.format(start) + "-" + TimeFormats.format(end);
        for (String segment : resource.getOpenSlots().split(",")) {
            if (wanted.equals(segment.trim())) {
                return;
            }
        }
        throw BizException.param("该时间段不在可预约范围内");
    }

    /** 同一资源同一日期同一起始时刻未被占用（已取消的记录不算占用） */
    private void requireSlotFree(Long resourceId, LocalDate date, LocalTime start) {
        boolean taken = bookingRepository
                .findByResourceIdAndBookingDateAndStatusNot(resourceId, date, BookingStatus.CANCELLED)
                .stream()
                .anyMatch(booking -> booking.getStartTime().equals(start));
        if (taken) {
            throw BizException.conflict("该时间段已被预约，请选择其他时段");
        }
    }

    /**
     * 该预约是否已经结束。
     *
     * 判据与小程序 utils/booking.ts 的 `resolveBookingStatus` 完全一致（结束时刻 ≤ 现在），
     * 这样「列表里显示已完成」与「详情页不显示取消按钮」永远用同一把尺子，
     * 不会出现「这一页说已结束、那一页还能取消」。
     */
    private boolean isFinished(BookingEntity booking) {
        return !LocalDateTime.of(booking.getBookingDate(), booking.getEndTime())
                .isAfter(LocalDateTime.now());
    }
}
