package com.campusreserve.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 资源（表结构见 docs/03_database_design.md §3.2）。
 *
 * 刻意没有「状态」字段：需求 §4.3 的「当前状态」由选中日期的可用时间段体现，
 * 而可用时间段是 openSlots 与 booking 表的合成结果，不是资源自身的属性。
 */
@Entity
@Table(name = "resource")
public class ResourceEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 32)
    private ResourceType type;

    @Column(name = "location", nullable = false, length = 128)
    private String location;

    @Column(name = "capacity", nullable = false)
    private Integer capacity;

    @Column(name = "description", nullable = false, length = 512)
    private String description;

    @Column(name = "image_url", length = 512)
    private String imageUrl;

    /**
     * 开放时段，逗号分隔的 `HH:mm-HH:mm` 列表，例如
     * `09:00-10:00,10:00-11:00,14:00-15:00`。
     * 列表顺序即前端展示顺序；解析只发生在 ResourceService 一处。
     */
    @Column(name = "open_slots", nullable = false, length = 255)
    private String openSlots;

    protected ResourceEntity() {
        // JPA 要求的无参构造
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public ResourceType getType() {
        return type;
    }

    public String getLocation() {
        return location;
    }

    public Integer getCapacity() {
        return capacity;
    }

    public String getDescription() {
        return description;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public String getOpenSlots() {
        return openSlots;
    }
}
