/**
 * 时间段展示工具。
 *
 * 技术设计 §4 规定 `utils` 存放工具；本文件只承载「时间段状态 ↔ 中文展示」的映射
 * 与「是否可被选择」的判定，不含任何数据获取逻辑（见 services/resource.ts）。
 *
 * 需求 §4.4：状态有 AVAILABLE / BOOKED / DISABLED 三种，**用户只能选择 AVAILABLE**。
 * 该判定被页面与 TimeSlot 组件共同依赖，集中在此处避免两处各写一遍。
 */
import type { TimeSlot, TimeSlotStatus } from '../types/resource'

/** 时间段状态 → 中文标签 */
const TIME_SLOT_STATUS_LABELS: Record<TimeSlotStatus, string> = {
  AVAILABLE: '可预约',
  BOOKED: '已约满',
  DISABLED: '不可预约',
}

/** 取时间段状态的中文名；未知状态回退为「不可预约」而不是展示 `undefined` */
export function getTimeSlotStatusLabel(status: TimeSlotStatus | string): string {
  return TIME_SLOT_STATUS_LABELS[status as TimeSlotStatus] || '不可预约'
}

/**
 * 判断时间段是否可被选择。
 * 只认 AVAILABLE：BOOKED 与 DISABLED 一律不可选（需求 §4.4）。
 */
export function isTimeSlotSelectable(slot: TimeSlot | null | undefined): boolean {
  return !!slot && slot.status === 'AVAILABLE'
}

/** 时间段的展示文案，如 `09:00-10:00` */
export function getTimeSlotLabel(slot: TimeSlot): string {
  return `${slot.startTime}-${slot.endTime}`
}

/** 判断两个时间段是否为同一时段（用于「再次点击取消选择」） */
export function isSameTimeSlot(a: TimeSlot | null, b: TimeSlot | null): boolean {
  if (!a || !b) {
    return false
  }
  return a.startTime === b.startTime && a.endTime === b.endTime
}
