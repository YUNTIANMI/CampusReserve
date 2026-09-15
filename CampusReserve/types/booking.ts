/**
 * 预约相关类型。
 *
 * 需求见 docs/01_requirements.md §4.5 / §4.6 / §4.7，
 * 业务规则见 docs/02_technical_design.md §11。
 */

/** 预约状态：待使用 / 已完成 / 已取消 */
export type BookingStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

/** 预约记录 */
export interface Booking {
  id: number
  /** 资源 ID */
  resourceId: number
  /** 资源名称，用于列表直接展示 */
  resourceName: string
  /** 资源地点 */
  location: string
  /** 预约日期，格式 YYYY-MM-DD */
  date: string
  /** 开始时间，格式 HH:mm */
  startTime: string
  /** 结束时间，格式 HH:mm */
  endTime: string
  /** 预约状态 */
  status: BookingStatus
  /** 创建时间，格式 YYYY-MM-DD HH:mm:ss */
  createdAt: string
}

/** 创建预约入参（需求 §4.5） */
export interface CreateBookingPayload {
  resourceId: number
  /** 日期，格式 YYYY-MM-DD */
  date: string
  /** 开始时间，格式 HH:mm */
  startTime: string
  /** 结束时间，格式 HH:mm */
  endTime: string
}
