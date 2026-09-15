/**
 * 资源类型展示常量与工具。
 *
 * 技术设计 §4 规定 `utils` 存放工具；本文件只承载「资源类型枚举 ↔ 中文展示信息」的映射，
 * 不含任何业务逻辑，页面与组件统一从这里取中文标签，避免各处硬编码。
 */
import type { ResourceType } from '../types/resource'

/** 资源分类入口选项 */
export interface ResourceTypeOption {
  /** 枚举值，与 `Resource.type`、资源列表页的 `category` 参数保持一致 */
  value: ResourceType
  /** 分类中文名 */
  label: string
  /** 分类一句话说明 */
  desc: string
}

/** 全部资源分类，数组顺序即首页分类入口的展示顺序 */
export const RESOURCE_TYPE_OPTIONS: ResourceTypeOption[] = [
  { value: 'STUDY_ROOM', label: '自习室', desc: '安静自习与备考' },
  { value: 'SEMINAR_ROOM', label: '研讨室', desc: '小组讨论与会议' },
  { value: 'STUDIO', label: '摄影棚', desc: '拍摄与影音制作' },
  { value: 'COURT', label: '球场', desc: '篮球与羽毛球' },
]

/**
 * 取资源类型的中文名。
 * 未知类型回退为「其他」，避免界面出现 `undefined`。
 */
export function getResourceTypeLabel(type: ResourceType | string): string {
  const hit = RESOURCE_TYPE_OPTIONS.find((item) => item.value === type)
  return hit ? hit.label : '其他'
}

/**
 * 资源列表页的筛选项。
 * 值为空串表示不筛选，与 `ResourceQuery.type` 的约定保持一致。
 */
export interface ResourceFilterOption {
  /** 筛选取值；空串表示「全部」 */
  value: ResourceType | ''
  /** 筛选项中文名 */
  label: string
}

/**
 * 资源列表页筛选栏选项：首项「全部」，其余与 `RESOURCE_TYPE_OPTIONS` 同序。
 * 单独定义而不复用 `RESOURCE_TYPE_OPTIONS`，是为了不把「全部」混进首页的分类入口。
 */
export const RESOURCE_FILTER_OPTIONS: ResourceFilterOption[] = [
  { value: '', label: '全部' },
  ...RESOURCE_TYPE_OPTIONS.map(
    (item): ResourceFilterOption => ({ value: item.value, label: item.label }),
  ),
]

/** 判断任意取值是否为合法资源类型 */
export function isResourceType(value: unknown): value is ResourceType {
  return RESOURCE_TYPE_OPTIONS.some((item) => item.value === value)
}

/**
 * 把外部传入的 `category` 参数归一化为合法筛选值，非法值一律视为「全部」。
 *
 * 与资源详情页「缺少 id 即错误态」刻意不同：详情页没有 id 就无事可做，
 * 而列表页的筛选条件不满足时页面依然可用（展示全部资源）——
 * 因此非法参数应降级而不是让整页报错，避免一个脏链接把功能全部挡掉。
 */
export function normalizeResourceType(value: unknown): ResourceType | '' {
  return isResourceType(value) ? value : ''
}
