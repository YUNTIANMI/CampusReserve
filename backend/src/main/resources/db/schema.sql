-- =============================================================================
-- CampusReserve 数据库结构（MySQL 8.4）
--
-- 权威说明见 docs/03_database_design.md，本文件是它的执行形态；
-- 两者冲突时以文档为准，并回来修正本文件。
--
-- 幂等：全部使用 IF NOT EXISTS，开发期由 spring.sql.init 在每次启动时执行，
-- 重复启动不会报错、不会丢数据、不会覆盖已经改过的结构。
--
-- 库本身由 JDBC URL 的 createDatabaseIfNotExist=true 自动创建（字符集见
-- application.yml 的 connectionCollation 设置），此处不重复 CREATE DATABASE。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user：需求 §4.8「后端识别用户」的落点，一个微信 openid 对应一行
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户 ID',
  `open_id`    VARCHAR(64)     NOT NULL COMMENT '微信 openid（开发期降级模式下为派生值）',
  `nickname`   VARCHAR(64)     NOT NULL COMMENT '昵称',
  `avatar_url` VARCHAR(512)    NULL     COMMENT '头像地址，当前恒为 NULL（开发期不提供图片资源）',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次登录时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_open_id` (`open_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '用户';

-- -----------------------------------------------------------------------------
-- resource：资源本身。刻意不含状态列——需求 §4.3 的「当前状态」由选中日期的
-- 可用时间段体现（见 docs/03_database_design.md §3.2）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '资源 ID',
  `name`        VARCHAR(128)    NOT NULL COMMENT '名称',
  `type`        VARCHAR(32)     NOT NULL COMMENT 'STUDY_ROOM / SEMINAR_ROOM / STUDIO / COURT',
  `location`    VARCHAR(128)    NOT NULL COMMENT '地点',
  `capacity`    INT             NOT NULL COMMENT '容量（人）',
  `description` VARCHAR(512)    NOT NULL DEFAULT '' COMMENT '描述',
  `image_url`   VARCHAR(512)    NULL     COMMENT '展示图，当前恒为 NULL（开发期不提供图片资源）',
  `open_slots`  VARCHAR(255)    NOT NULL COMMENT '开放时段，逗号分隔的 HH:mm-HH:mm 列表',
  PRIMARY KEY (`id`),
  KEY `idx_resource_type` (`type`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '资源';

-- -----------------------------------------------------------------------------
-- booking：预约记录，三张表里唯一会被并发写入的一张
--
-- active_slot_key 是本表一致性的核心（docs/03_database_design.md §5）：
--   · 有效预约 → 'resourceId|日期|开始时刻'，唯一索引保证物理上不可能重复；
--   · 已取消   → NULL，而 MySQL 唯一索引允许多个 NULL，
--                于是「取消后可再约同一时段」（需求 §4.7）自然成立，
--                不需要任何额外的清理动作；
--   · 应用层不写这一列（JPA 未映射），由数据库计算，避免两边算得不一样。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `booking` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '预约编号',
  `user_id`     BIGINT UNSIGNED NOT NULL COMMENT '归属用户',
  `resource_id` BIGINT UNSIGNED NOT NULL COMMENT '资源',
  `booking_date` DATE           NOT NULL COMMENT '预约日期',
  `start_time`  TIME            NOT NULL COMMENT '开始时刻',
  `end_time`    TIME            NOT NULL COMMENT '结束时刻',
  `status`      VARCHAR(16)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / COMPLETED / CANCELLED',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `active_slot_key` VARCHAR(64) GENERATED ALWAYS AS (
      CASE WHEN `status` = 'CANCELLED' THEN NULL
           ELSE CONCAT(`resource_id`, '|', `booking_date`, '|', TIME_FORMAT(`start_time`, '%H:%i'))
      END
  ) STORED COMMENT '有效占用键：取消后为 NULL，以此实现「条件唯一」',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_booking_active_slot` (`active_slot_key`),
  KEY `idx_booking_user` (`user_id`),
  KEY `idx_booking_resource_date` (`resource_id`, `booking_date`),
  CONSTRAINT `fk_booking_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `fk_booking_resource` FOREIGN KEY (`resource_id`) REFERENCES `resource` (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '预约记录';
