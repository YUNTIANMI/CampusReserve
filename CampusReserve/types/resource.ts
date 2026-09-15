/**
 * 资源与可用时间相关类型。
 *
 * 需求见 docs/01_requirements.md §4.2 / §4.3 / §4.4。
 * 字段以需求文档为准；docs/05_api_contract.md 建立时若与实际契约有差异，
 * 以契约文档为准并同步修改本文件。
 */

/** 资源类型：自习室 / 研讨室 / 摄影棚 / 球场 */
export type ResourceType = 'STUDY_ROOM' | 'SEMINAR_ROOM' | 'STUDIO' | 'COURT'

/**
 * 资源。
 * 需求 §4.3 要求展示：图片、名称、类型、地点、容量、描述、当前状态。
 *
 * 注意：需求中的「当前状态」尚未在 API 契约中定义取值，
 * 因此本阶段**不定义** status 字段，待 docs/05_api_contract.md 确定后补充。
 */
export interface Resource {
  id: number
  /** 资源名称 */
  name: string
  /** 资源类型 */
  type: ResourceType
  /** 地点 */
  location: string
  /** 容量（可容纳人数） */
  capacity: number
  /** 描述 */
  description: string
  /** 展示图片 */
  imageUrl?: string
}

/**
 * 资源列表查询参数。
 * 对应 `GET /api/resources` 的 query，具体字段以 `docs/05_api_contract.md` 为准；
 * 该文档建立前，Service 层按此结构组装参数。
 */
export interface ResourceQuery {
  /** 按资源类型筛选；空串或缺省表示不筛选 */
  type?: ResourceType | ''
  /** 返回条数上限；缺省表示由服务端决定 */
  limit?: number
}

/** 时间段状态；用户只能选择 AVAILABLE */
export type TimeSlotStatus = 'AVAILABLE' | 'BOOKED' | 'DISABLED'

/** 时间段，如 09:00-10:00 */
export interface TimeSlot {
  /** 开始时间，格式 HH:mm */
  startTime: string
  /** 结束时间，格式 HH:mm */
  endTime: string
  /** 状态 */
  status: TimeSlotStatus
}

/** 指定资源在指定日期的可用时间段 */
export interface Availability {
  /** 资源 ID */
  resourceId: number
  /** 日期，格式 YYYY-MM-DD */
  date: string
  /** 该日期下的时间段列表 */
  slots: TimeSlot[]
}
