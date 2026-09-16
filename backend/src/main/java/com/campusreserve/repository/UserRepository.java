package com.campusreserve.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.campusreserve.entity.UserEntity;

/**
 * 用户仓储。
 *
 * 只暴露两个必要操作：按 openid 找用户（登录时识别身份）、按 ID 找用户
 * （每次带凭证的请求都要确认这个人确实存在）。不做用户列表、搜索等本阶段用不到的方法——
 * 仓储层的每个方法都会被真实的调用方支撑，没有调用方的方法就是没有测试的死代码。
 */
public interface UserRepository extends JpaRepository<UserEntity, Long> {

    Optional<UserEntity> findByOpenId(String openId);
}
