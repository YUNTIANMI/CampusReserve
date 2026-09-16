package com.campusreserve.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 用户（表结构见 docs/03_database_design.md §3.1）。
 *
 * 字段与数据库列一一对应，不做任何关系映射（不用 @OneToMany 之类）：
 * 本项目查询模式简单且明确，映射关系只会带来懒加载时机问题，
 * 而「预约里显示资源名」这类需要连接的操作在 Service 层显式发起，代价是一次索引查询。
 */
@Entity
@Table(name = "user")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "open_id", nullable = false, length = 64)
    private String openId;

    @Column(name = "nickname", nullable = false, length = 64)
    private String nickname;

    @Column(name = "avatar_url", length = 512)
    private String avatarUrl;

    /** 由数据库默认值填充，应用侧只读 */
    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    protected UserEntity() {
        // JPA 要求的无参构造
    }

    public UserEntity(String openId, String nickname) {
        this.openId = openId;
        this.nickname = nickname;
    }

    public Long getId() {
        return id;
    }

    public String getOpenId() {
        return openId;
    }

    public String getNickname() {
        return nickname;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
