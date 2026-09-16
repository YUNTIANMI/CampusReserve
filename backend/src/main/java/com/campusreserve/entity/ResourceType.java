package com.campusreserve.entity;

/**
 * 资源类型，取值与小程序 CampusReserve/types/resource.ts 的 `ResourceType` 一致，
 * 也与 docs/05_api_contract.md §6 的表格一致（三处必须同时改）。
 *
 * 用枚举而不是自由字符串：非法取值在编译期就写不出来，
 * 从数据库读到的值若不在枚举内会直接报错，而不是悄悄变成一个前端不认识的类型
 * （前端按四个取值渲染分类入口，多出来的值只会让那个资源在任何分类下都不出现）。
 */
public enum ResourceType {

    /** 自习室 */
    STUDY_ROOM,

    /** 研讨室 */
    SEMINAR_ROOM,

    /** 摄影棚 */
    STUDIO,

    /** 球场 */
    COURT,
}
