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
import { mockGetResources } from './mock-resource'
import { request } from './request'
import type { Resource, ResourceQuery } from '../types/resource'

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
