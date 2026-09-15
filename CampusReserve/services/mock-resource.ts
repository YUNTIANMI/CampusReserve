/**
 * 开发期本地资源数据源。
 *
 * 仅在启用 services/config.ts 的 `USE_MOCK_DATA` 时被 services/resource.ts 调用，
 * 用途是让前端页面在后端业务 API（Phase 10）落地前就能验证 success / empty / error 三种展示。
 *
 * 约束：
 * 1. 数据形态严格对齐 types/resource.ts 的 `Resource`；
 * 2. 返回 Promise 并带模拟延迟，接口形态与 services/request.ts 一致（失败时 reject `ApiError`），
 *    使页面代码切换到真实接口时无需改动。
 */
import type { Resource, ResourceQuery } from '../types/resource'
import { MOCK_MODE_STORAGE_KEY } from './config'
import { ApiError, ApiErrorCode } from './request'

/** 模拟网络延迟（毫秒），用于观察 loading 态 */
const MOCK_DELAY = 600

/**
 * 开发期资源数据，覆盖全部 4 个资源类型。
 * 数组顺序即首页「热门 / 推荐」的临时划分依据（见 pages/index/index.ts）。
 * 暂不提供 `imageUrl`：卡片在无图时展示类型占位块，避免测试依赖网络图片。
 */
export const MOCK_RESOURCES: Resource[] = [
  {
    id: 1,
    name: '图书馆三楼自习室 A',
    type: 'STUDY_ROOM',
    location: '图书馆 3 楼东侧',
    capacity: 60,
    description: '独立隔间，配备插座与台灯，适合长时间自习。',
  },
  {
    id: 2,
    name: '图书馆四楼自习室 B',
    type: 'STUDY_ROOM',
    location: '图书馆 4 楼西侧',
    capacity: 40,
    description: '靠窗座位，采光良好，可使用校园网。',
  },
  {
    id: 3,
    name: '教学楼研讨室 201',
    type: 'SEMINAR_ROOM',
    location: '教学楼 2 楼',
    capacity: 12,
    description: '配备投影与白板，适合小组讨论与课程汇报。',
  },
  {
    id: 4,
    name: '教学楼研讨室 305',
    type: 'SEMINAR_ROOM',
    location: '教学楼 3 楼',
    capacity: 8,
    description: '圆桌会议室，适合小型课题讨论。',
  },
  {
    id: 5,
    name: '传媒学院摄影棚',
    type: 'STUDIO',
    location: '传媒楼 B1',
    capacity: 20,
    description: '专业灯光与多种背景布，可拍摄人像与静物。',
  },
  {
    id: 6,
    name: '影音制作室',
    type: 'STUDIO',
    location: '传媒楼 2 楼',
    capacity: 10,
    description: '提供剪辑工作站与录音设备。',
  },
  {
    id: 7,
    name: '东区篮球场 1 号',
    type: 'COURT',
    location: '东区体育场',
    capacity: 30,
    description: '室外标准半场，晚间开放灯光。',
  },
  {
    id: 8,
    name: '西区羽毛球场',
    type: 'COURT',
    location: '西区体育馆 2 楼',
    capacity: 16,
    description: '室内 4 片场地，可借球拍。',
  },
]

/** 开发期数据源模式 */
export type MockMode = 'success' | 'empty' | 'error'

/**
 * 读取当前数据源模式。
 * 通过 `wx.setStorageSync('CR_MOCK_MODE', 'empty')` 可在调试与端到端测试中注入空数据或失败响应。
 */
export function readMockMode(): MockMode {
  const raw: unknown = wx.getStorageSync(MOCK_MODE_STORAGE_KEY)
  return raw === 'empty' || raw === 'error' ? raw : 'success'
}

/**
 * 从本地数据源取资源列表。
 * @param query 与真实接口一致的筛选参数
 * @throws {ApiError} 数据源模式为 'error' 时，抛出与 request.ts 同形态的错误
 */
export function mockGetResources(query: ResourceQuery = {}): Promise<Resource[]> {
  const mode = readMockMode()

  return new Promise<Resource[]>((resolve, reject) => {
    setTimeout(() => {
      if (mode === 'error') {
        reject(new ApiError(ApiErrorCode.NETWORK, '网络连接失败，请检查网络后重试'))
        return
      }

      if (mode === 'empty') {
        resolve([])
        return
      }

      let list = MOCK_RESOURCES.filter((item) => !query.type || item.type === query.type)
      if (typeof query.limit === 'number' && query.limit > 0) {
        list = list.slice(0, query.limit)
      }

      // 返回副本，避免调用方修改返回值时污染数据源
      resolve(list.map((item) => ({ ...item })))
    }, MOCK_DELAY)
  })
}
