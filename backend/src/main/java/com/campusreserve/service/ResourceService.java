package com.campusreserve.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.campusreserve.common.BizException;
import com.campusreserve.common.TimeFormats;
import com.campusreserve.dto.AvailabilityDto;
import com.campusreserve.dto.ResourceDto;
import com.campusreserve.dto.TimeSlotDto;
import com.campusreserve.entity.BookingEntity;
import com.campusreserve.entity.BookingStatus;
import com.campusreserve.entity.ResourceEntity;
import com.campusreserve.entity.ResourceType;
import com.campusreserve.repository.BookingRepository;
import com.campusreserve.repository.ResourceRepository;

/**
 * 资源与可用时间段（需求 §4.2 / §4.3 / §4.4）。
 *
 * 可用时间段**不是查出来的，而是合成出来的**（docs/03_database_design.md §4）：
 * 资源的开放时段配置 → 生成骨架，预约表 → 标出已被占用的，当前时间 → 标出已过时的。
 * 这样「时段配置改了」与「有人约走了」两件事互不干扰，也不会产生每天一行配置快照的垃圾数据。
 */
@Service
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final BookingRepository bookingRepository;

    public ResourceService(ResourceRepository resourceRepository, BookingRepository bookingRepository) {
        this.resourceRepository = resourceRepository;
        this.bookingRepository = bookingRepository;
    }

    /**
     * 资源列表（需求 §4.2）。
     *
     * @param type  按类型筛选；null 表示不筛选
     * @param limit 返回条数上限；null 或非正数表示不限制
     */
    @Transactional(readOnly = true)
    public List<ResourceDto> list(ResourceType type, Integer limit) {
        List<ResourceEntity> entities = type == null
                ? resourceRepository.findAllByOrderByIdAsc()
                : resourceRepository.findByTypeOrderByIdAsc(type);

        // limit 在应用层截断而不是写进 SQL：列表数据量是「一个学校的场地数」这个量级，
        // 而首页只需要前几条；为了一个展示用的条数上限引入了分页语义（总数、能否翻页）
        // 得不偿失。若将来真的分页，这里换成 Pageable，接口签名不变。
        if (limit != null && limit > 0) {
            entities = entities.stream().limit(limit).toList();
        }
        return entities.stream().map(ResourceDto::from).toList();
    }

    /**
     * 资源详情（需求 §4.3）。
     *
     * **资源不存在时返回 null，由 Controller 包成 `code: 0` + `data: null`**，
     * 而不是抛 404——
     * 「接口正常返回，只是没有这条数据」与「请求失败」是两种不同的用户处境：
     * 前者页面落 empty 态（提示资源不存在），后者落 error 态（提示网络异常并给重试入口）。
     * 这个约定写在 docs/05_api_contract.md §5.4。
     */
    @Transactional(readOnly = true)
    public ResourceDto detail(Long id) {
        if (id == null || id <= 0) {
            throw BizException.param("资源信息有误，请返回重新选择");
        }
        return resourceRepository.findById(id).map(ResourceDto::from).orElse(null);
    }

    /**
     * 指定资源在指定日期的可用时间段（需求 §4.4）。
     *
     * 状态判定优先级：`DISABLED`（已过时） > `BOOKED`（已被约走） > `AVAILABLE`。
     * 已过时优先是刻意的：一个已经过去的时段，对用户就是不可预约，
     * 不必再区分它当初是否被约满。
     *
     * 关于过去日期：本方法对**早于今天**的日期把全部时段标为 `DISABLED`。
     * 开发期数据源只按「是否今天」判定，因此对过去日期会显示为可预约——
     * 那一段是页面不可达的区间（详情页的日期条从今天起），
     * 但语义上服务端这样处理才是对的。差异已记入 docs/05_api_contract.md §5.5。
     *
     * @throws BizException 400001（date 缺失或非法）、404001（资源不存在）
     */
    @Transactional(readOnly = true)
    public AvailabilityDto availability(Long resourceId, String date) {
        if (resourceId == null || resourceId <= 0) {
            throw BizException.param("资源信息有误，请返回重新选择");
        }
        ResourceEntity resource = resourceRepository.findById(resourceId)
                .orElseThrow(() -> BizException.notFound("该资源不存在或已下架"));

        LocalDate day = TimeFormats.parseDate(date);
        Set<LocalTime> occupied = new HashSet<>();
        for (BookingEntity booking : bookingRepository
                .findByResourceIdAndBookingDateAndStatusNot(resourceId, day, BookingStatus.CANCELLED)) {
            // 已取消的记录天然被排除：需求 §4.7「取消后时间段恢复可用」
            occupied.add(booking.getStartTime());
        }

        return new AvailabilityDto(resourceId, day, buildSlots(resource, day, occupied));
    }

    /** 按开放时段配置生成时段列表，并把已占用与已过时的格子改写成对应状态 */
    private List<TimeSlotDto> buildSlots(ResourceEntity resource, LocalDate day, Set<LocalTime> occupied) {
        LocalDate today = LocalDate.now();
        LocalTime now = LocalTime.now();
        boolean past = day.isBefore(today);

        List<TimeSlotDto> slots = new ArrayList<>();
        for (String segment : resource.getOpenSlots().split(",")) {
            String trimmed = segment.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            int separator = trimmed.indexOf('-');
            if (separator <= 0 || separator == trimmed.length() - 1) {
                // 配置写坏了：跳过这一段而不是让整个接口 500——
                // 一个时段配错不该让用户看不到这一天的其他时段
                continue;
            }
            LocalTime start = TimeFormats.parseTime(trimmed.substring(0, separator));
            LocalTime end = TimeFormats.parseTime(trimmed.substring(separator + 1));

            String status;
            if (past || (day.isEqual(today) && !start.isAfter(now))) {
                status = TimeSlotDto.STATUS_DISABLED;
            } else if (occupied.contains(start)) {
                status = TimeSlotDto.STATUS_BOOKED;
            } else {
                status = TimeSlotDto.STATUS_AVAILABLE;
            }
            slots.add(new TimeSlotDto(TimeFormats.format(start), TimeFormats.format(end), status));
        }
        return slots;
    }
}
