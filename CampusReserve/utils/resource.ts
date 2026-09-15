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
