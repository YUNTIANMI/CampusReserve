package com.campusreserve.dto;

import com.campusreserve.entity.UserEntity;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 用户基础信息，对应小程序 `types/user.ts` 的 `UserInfo`。
 *
 * `avatarUrl` 为 null 时整个字段不出现在 JSON 里（`@JsonInclude(NON_NULL)`）：
 * 小程序端该字段是可选属性，页面已有「无头像则用昵称首字占位」的分支，
 * 返回 `"avatarUrl": null` 与不返回字段对它等价，但**不返回**更贴近「当前确实没有这个数据」，
 * 也避免调用方把 null 当成一个有意义的值去判断。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserInfoDto(

        Long id,

        String nickname,

        String avatarUrl
) {

    public static UserInfoDto from(UserEntity user) {
        return new UserInfoDto(user.getId(), user.getNickname(), user.getAvatarUrl());
    }
}
