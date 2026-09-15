/**
 * 全局环境类型声明（ambient types）
 *
 * 这些类型使用 `declare` 声明为全局可见，任何 .ts 文件都无需 import 即可使用，
 * 与微信小程序 Page / Component 的写法保持一致。
 *
 * 取值范围需与后端 API Contract 一致，见 docs/（API 契约文档待 Phase 10 前建立）。
 */

/** 登录状态 */
declare type LoginState = 'LOGGED_OUT' | 'LOGGED_IN'

/** 资源类型：自习室 / 研讨室 / 摄影棚 / 球场 */
declare type ResourceType = 'STUDY_ROOM' | 'SEMINAR_ROOM' | 'STUDIO' | 'COURT'

/** 时间段状态；用户只能选择 AVAILABLE */
declare type TimeSlotStatus = 'AVAILABLE' | 'BOOKED' | 'DISABLED'

/** 预约状态：待使用 / 已完成 / 已取消 */
declare type BookingStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

/**
 * 用户基础信息。
 * 仅缓存展示所需的最小字段，禁止缓存敏感信息。
 */
declare interface UserInfo {
  id: number
  nickname: string
  avatarUrl?: string
}
