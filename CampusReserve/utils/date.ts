/**
 * 日期工具。
 *
 * 技术设计 §4 规定 `utils` 存放工具；本文件只承载「日期字符串 ↔ 展示信息」的转换，
 * 不含任何业务规则（例如某个时间段是否已过期由数据源负责，见 services/mock-resource.ts）。
 *
 * 全项目统一使用三种字符串格式，避免各处自行拼装：
 * - 日期：`YYYY-MM-DD`
 * - 时间：`HH:mm`
 * - 时间戳：`YYYY-MM-DD HH:mm:ss`（预约的 `createdAt`，Phase 6 追加）
 * 与 types/resource.ts 的 `Availability.date` / `TimeSlot.startTime`、
 * types/booking.ts 的 `Booking.createdAt` 注释保持一致。
 */

/** 星期中文名，索引与 `Date.getDay()` 一致（0 为周日） */
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 两位补零 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 把 Date 格式化为 `YYYY-MM-DD`（按本机时区取年月日，不走 UTC） */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 取本机时区的今天，格式 `YYYY-MM-DD` */
export function todayString(): string {
  return formatDate(new Date())
}

/**
 * 把 Date 格式化为 `YYYY-MM-DD HH:mm:ss`（按本机时区，不走 UTC）。
 * 用于预约的 `createdAt` 这类「带时刻的时间戳」。
 */
export function formatDateTime(date: Date): string {
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${formatDate(date)} ${hh}:${mm}:${ss}`
}

/**
 * 把 `YYYY-MM-DD` 解析为当天 00:00 的本地 Date。
 * 格式非法或日期不存在（如 2026-02-31）返回 null，避免 `new Date()` 静默进位到别的日期。
 */
export function parseDate(value: string): Date | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!matched) {
    return null
  }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** 取星期的中文名；日期非法时返回空串而不是 `undefined` */
export function getWeekdayLabel(value: string): string {
  const date = parseDate(value)
  return date ? WEEKDAY_LABELS[date.getDay()] : ''
}

/**
 * 把 `HH:mm` 转成当天已过的分钟数，便于比较大小。
 * 格式非法时返回 -1：调用方据此判断「时间不可比较」，不要当成 00:00。
 */
export function toMinutes(value: string): number {
  const matched = /^(\d{2}):(\d{2})$/.exec(value)
  if (!matched) {
    return -1
  }
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) {
    return -1
  }
  return hour * 60 + minute
}

/** 日期条上的一个日期选项 */
export interface DateOption {
  /** 提交给接口的日期，格式 `YYYY-MM-DD` */
  value: string
  /** 展示用短日期，如 `09-15` */
  shortLabel: string
  /** 星期中文名 */
  weekday: string
  /** 是否为今天；今天在日期条上显示为「今天」而不是星期几 */
  isToday: boolean
}

/**
 * 生成从今天开始、连续 `days` 天的日期选项。
 *
 * 日期选择采用「未来 N 天横向日期条」而不是原生 `<picker mode="date">`：
 * 1. 原生 picker 的弹层由客户端渲染，自动化测试无法驱动，交付后无法回归；
 * 2. 校园场地预约的实际使用场景集中在最近几天，横向日期条交互层级更浅。
 * 若后续需要更远日期，只需扩大 `days`，页面结构无需改动。
 *
 * @param days 生成天数，小于 1 时返回空数组
 * @param from 起始日期，缺省为今天；测试可注入固定值
 */
export function buildDateOptions(days: number, from: Date = new Date()): DateOption[] {
  const options: DateOption[] = []
  if (days < 1) {
    return options
  }

  for (let i = 0; i < days; i++) {
    // 用「年月日 + i」构造而不是累加毫秒，避免夏令时之类的边界把日期算偏
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    options.push({
      value: formatDate(date),
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      weekday: WEEKDAY_LABELS[date.getDay()],
      isToday: i === 0,
    })
  }

  return options
}
