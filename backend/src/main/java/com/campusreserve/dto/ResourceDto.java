package com.campusreserve.dto;

import com.campusreserve.entity.ResourceEntity;
import com.campusreserve.entity.ResourceType;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 资源，对应小程序 `types/resource.ts` 的 `Resource`。
 *
 * `imageUrl` 当前恒为 null（开发期不提供图片资源，见 PROJECT_MEMORY.md §11），
 * 因此响应里不会出现该字段；将来补齐图片时只需让 `resource.image_url` 有值，
 * 字段会自动出现，页面无需改动。
 *
 * `openSlots`（开放时段配置）**不对外暴露**：它是服务端合成可用时间段的内部依据，
 * 客户端拿到的应当是「某天有哪些时段、各自什么状态」，而不是配置原文——
 * 否则客户端迟早会自己去解析它，把服务端的规则复制一份出来。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ResourceDto(

        Long id,

        String name,

        ResourceType type,

        String location,

        Integer capacity,

        String description,

        String imageUrl
) {

    public static ResourceDto from(ResourceEntity resource) {
        return new ResourceDto(
                resource.getId(),
                resource.getName(),
                resource.getType(),
                resource.getLocation(),
                resource.getCapacity(),
                resource.getDescription(),
                resource.getImageUrl());
    }
}
