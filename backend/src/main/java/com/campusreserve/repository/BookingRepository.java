package com.campusreserve.repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.campusreserve.entity.BookingEntity;
import com.campusreserve.entity.BookingStatus;

/**
 * 预约仓储。
 *
 * 每个方法的第一个参数都带 userId（除了时间段占用查询）——这是「归属校验落在数据访问层」
 * 的体现：`findByIdAndUserId` 而不是「先 findById 再在 Service 里比 userId」，
 * 少一步判断就少一次写错的机会，而且查询计划上也不会把别人的记录读出来。
 *
 * 「同一时段是否被占用」一律排除 CANCELLED：需求 §4.7 取消后时间段恢复可用，
 * 这条规则体现在**每一次**占用判定里，因此必须作为查询条件而不是调用方的事后过滤。
 */
public interface BookingRepository extends JpaRepository<BookingEntity, Long> {

    /** 某个用户的全部预约，按时间升序（页面自行按状态分组排序，此处只保证顺序确定） */
    List<BookingEntity> findByUserIdOrderByBookingDateAscStartTimeAscIdAsc(Long userId);

    /** 按编号 + 归属查单条：查不到即「不存在或不属于当前用户」，两者刻意不区分 */
    Optional<BookingEntity> findByIdAndUserId(Long id, Long userId);

    /**
     * 某资源某天所有**仍占用**的预约，用于合成可用时间段。
     * 传 `BookingStatus.CANCELLED` 即可排除已取消记录。
     */
    List<BookingEntity> findByResourceIdAndBookingDateAndStatusNot(
            Long resourceId, LocalDate bookingDate, BookingStatus status);
}
