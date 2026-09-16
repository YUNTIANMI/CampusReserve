package com.campusreserve.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Generated;

/**
 * 预约记录（表结构见 docs/03_database_design.md §3.3）。
 *
 * 刻意不映射 `active_slot_key` 生成列：它由数据库计算，应用侧写进去只会制造
 * 「两边算法不一致」的隐患。一致性靠「数据库唯一索引 + Service 先查一次」双保险，
 * 详见 docs/03_database_design.md §5。
 *
 * 同样不映射 resource 的名称与地点：它们在查询时连接得到，不冗余存储，
 * 否则资源改名后历史预约会显示旧名字。
 */
@Entity
@Table(name = "booking")
public class BookingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "resource_id", nullable = false)
    private Long resourceId;

    @Column(name = "booking_date", nullable = false)
    private LocalDate bookingDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private BookingStatus status;

    /**
     * 由数据库默认值填充，应用侧只读；取消预约时该值必须保持不变。
     *
     * `@Generated` 让 Hibernate 在插入后把它读回来：
     * 该列由 `DEFAULT CURRENT_TIMESTAMP` 赋值，应用侧不写它，
     * 若不回读，刚创建的预约在响应里 `createdAt` 就是 null（前端要直接展示这个字段）。
     * 代价是一次额外查询，换来的是「时间只有一个来源」——服务端时钟，
     * 而不是让应用和数据库各记一次当前时间、再偶尔对不上。
     */
    @Generated
    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    protected BookingEntity() {
        // JPA 要求的无参构造
    }

    public BookingEntity(Long userId, Long resourceId, LocalDate bookingDate,
                         LocalTime startTime, LocalTime endTime, BookingStatus status) {
        this.userId = userId;
        this.resourceId = resourceId;
        this.bookingDate = bookingDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.status = status;
    }

    /**
     * 取消预约：只改状态，其余字段原样保留。
     *
     * 取消不是「重新写一条记录」——预约编号与创建时间必须与原来一致，
     * 否则用户在列表里看到的就是另一条数据了。
     */
    public void cancel() {
        this.status = BookingStatus.CANCELLED;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getResourceId() {
        return resourceId;
    }

    public LocalDate getBookingDate() {
        return bookingDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
