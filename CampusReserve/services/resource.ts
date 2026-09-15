/**
 * 资源业务接口。
 *
 * 技术设计 §5 约定调用链为 `Page → Service → API`：页面只调用本文件的方法，
 * 不直接使用 services/request.ts，也不自己拼接口路径。
 *
 * 数据来源由 services/config.ts 的 `USE_MOCK_DATA` 决定：
 * 后端业务 API 属于 Phase 10，在此之前切到开发期本地数据源，调用方无感知。
 */
import { USE_MOCK_DATA } from './config'
import { mockGetAvailability, mockGetResourceDetail, mockGetResources } from './mock-resource'
import { request } from './request'
import type { Availability, Resource, ResourceQuery } from '../types/resource'

/**
 * 获取资源列表。
 *
 * 对应 `GET /api/resources`，query 为 `{ type?, limit? }`。
 * 响应体结构以 `docs/05_api_contract.md` 为准；该契约文档建立前按 `Resource[]` 处理。
 *
 * @throws {ApiError} 网络异常、超时、HTTP 异常或业务失败
 */
export function getResources(query: ResourceQuery = {}): Promise<Resource[]> {
  if (USE_MOCK_DATA) {
    return mockGetResources(query)
  }

  const data: Record<string, unknown> = {}
  if (query.type) {
    data.type = query.type
  }
  if (typeof query.limit === 'number') {
    data.limit = query.limit
  }

  return request<Resource[]>({ url: '/resources', data })
}

/**
 * 获取单个资源详情。
 *
 * 对应 `GET /api/resources/{id}`。
 *
 * 返回值约定：**资源不存在时 resolve(null)**，而不是抛错。
 * 「接口正常返回但没有这条数据」与「请求失败」是两种不同的用户处境——
 * 前者应提示「资源不存在」（empty 态），后者才提示「网络异常」并给重试入口（error 态）。
 * 该约定需在 `docs/05_api_contract.md` 建立时确认（`data` 为 null，还是返回业务错误码）；
 * 契约确定后只需调整本方法，页面无需改动。
 *
 * @throws {ApiError} 网络异常、超时、HTTP 异常或业务失败
 */
export function getResourceDetail(id: number): Promise<Resource | null> {
  if (USE_MOCK_DATA) {
    return mockGetResourceDetail(id)
  }

  return request<Resource | null>({ url: `/resources/${id}` })
}

/**
 * 获取指定资源在指定日期的可用时间段。
 *
 * 对应 `GET /api/resources/{id}/availability`，日期通过 query 传给服务端
 * （由服务端决定当天有哪些时段、以及每个时段的状态，前端不做任何时间推算）。
 *
 * @param resourceId 资源 ID
 * @param date 日期，格式 `YYYY-MM-DD`
 * @throws {ApiError} 网络异常、超时、HTTP 异常或业务失败
 */
export function getAvailability(resourceId: number, date: string): Promise<Availability> {
  if (USE_MOCK_DATA) {
    return mockGetAvailability(resourceId, date)
  }

  return request<Availability>({
    url: `/resources/${resourceId}/availability`,
    data: { date },
  })
}
