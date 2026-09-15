/**
 * 后端统一响应体类型。
 *
 * 契约见 docs/02_technical_design.md §13，对应后端
 * backend/src/main/java/com/campusreserve/common/ApiResponse.java。
 *
 *   { "code": 0,        "message": "success",         "data": {} }
 *   { "code": 409001,   "message": "该时间段已被预约", "data": null }
 *
 * code === 0 表示业务成功，其余为业务失败码。
 */

/** 统一响应体 */
export interface ApiResponse<T> {
  /** 业务状态码，0 表示成功 */
  code: number
  /** 提示信息，成功时为 "success"，失败时可直接展示给用户 */
  message: string
  /** 业务数据；失败时为 null */
  data: T
}

/** 失败响应体（data 固定为 null） */
export interface ApiErrorResponse {
  code: number
  message: string
  data: null
}

/** HTTP 方法，与 request.ts 保持一致 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
