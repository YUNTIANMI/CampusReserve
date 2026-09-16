/**
 * 开发期预约表（Phase 6 新增）。
 *
 * 为什么单独成一个模块：
 * 1. 「可用时间段」（services/mock-resource.ts）与「创建预约」（services/mock-booking.ts）
 *    都要读它——前者要让已约走的格子显示为 `BOOKED`，后者要判「同一时段不能重复预约」。
 *    若把表放在任一侧，两个数据源就会互相 import 形成循环依赖；
 * 2. 它是唯一需要「跨数据源共享的可变状态」，单独放一处，谁能改、谁能读一目了然。
 *
 * 为什么落在本地缓存而不是模块级变量：
 * - 模块级变量在开发者工具每次重新编译时清空，调试时「刚创建的预约」转眼就没了，
 *   而 Phase 7 的「我的预约」需要它稳定可读；
 * - 落在缓存后，调试、端到端测试、Phase 7 读到的是同一份数据；
 * - 端到端测试因此可以在每次运行开始时直接清掉这个键，拿到干净状态
 *   （模块级变量在 appservice 外部无法重置）。
 *
 * 这只是开发期机制：联调前应随 `USE_MOCK_DATA` 一并移除，真实持久化由 Phase 10 的数据库承担。
 */
import type { Booking, BookingStatus } from '../types/booking'
import type { TimeSlot } from '../types/resource'

/** 开发期预约表缓存键 */
export const MOCK_BOOKINGS_STORAGE_KEY = 'CR_MOCK_BOOKINGS'

/** 缓存中的结构：预约列表 + 自增序号（序号也持久化，避免重复 ID） */
interface MockBookingState {
  seq: number
  list: Booking[]
}

/**
 * 读缓存中的预约表。
 * 缓存为空、被外部写坏或不兼容时一律回退为空表，绝不抛错——
 * 一个开发期数据源不该让页面因为缓存脏了而崩掉。
 */
function readState(): MockBookingState {
  try {
    const raw: unknown = wx.getStorageSync(MOCK_BOOKINGS_STORAGE_KEY)
    if (raw && typeof raw === 'object' && Array.isArray((raw as MockBookingState).list)) {
      const state = raw as MockBookingState
      return {
        seq: typeof state.seq === 'number' && state.seq >= 0 ? state.seq : state.list.length,
        list: state.list,
      }
    }
  } catch {
    /* 读缓存失败：当作空表 */
  }
  return { seq: 0, list: [] }
}

function writeState(state: MockBookingState): void {
  try {
    wx.setStorageSync(MOCK_BOOKINGS_STORAGE_KEY, state)
  } catch {
    /* 写缓存失败不阻断本次预约：它已成功返回给调用方 */
  }
}

/** 清空预约表（端到端测试在每次运行开始时调用） */
export function resetMockBookings(): void {
  try {
    wx.removeStorageSync(MOCK_BOOKINGS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** 读取全部预约（返回副本，避免调用方改动内部状态） */
export function listMockBookings(): Booking[] {
  return readState().list.map((item) => ({ ...item }))
}

/** 追加一条预约并分配 ID */
export function appendMockBooking(input: Omit<Booking, 'id'>): Booking {
  const state = readState()
  state.seq += 1
  const booking: Booking = { ...input, id: state.seq }
  state.list.push(booking)
  writeState(state)
  return { ...booking }
}

/**
 * 更新一条预约的状态（Phase 8：取消预约）。
 *
 * 只改 `status`，其余字段原样保留——取消不是「重新写一条记录」，
 * 预约编号、创建时间都必须与原来一致，否则用户在列表里看到的就是另一条数据了。
 *
 * @returns 更新后的记录；ID 不存在时返回 null（由调用方决定是报错还是忽略）
 */
export function updateMockBookingStatus(
  bookingId: number,
  status: BookingStatus,
): Booking | null {
  const state = readState()
  const index = state.list.findIndex((item) => item.id === bookingId)
  if (index < 0) {
    return null
  }
  const updated: Booking = { ...state.list[index], status }
  state.list[index] = updated
  writeState(state)
  return { ...updated }
}

/**
 * 该资源在该日期该开始时间是否已被占用。
 * 已取消的预约不算占用——需求 §4.7「取消后时间段恢复可用」。
 */
export function isSlotBooked(resourceId: number, date: string, startTime: string): boolean {
  return readState().list.some(
    (item) =>
      item.resourceId === resourceId &&
      item.date === date &&
      item.startTime === startTime &&
      item.status !== 'CANCELLED',
  )
}

/**
 * 把已创建的预约叠加到时段状态上。
 *
 * 只动「仍为 `AVAILABLE` 且已被约走」的时段：`BOOKED`（别人已占）与
 * `DISABLED`（已过时或不可预约）的含义更强，不该被覆盖。
 *
 * 不做这一步的后果是自相矛盾：服务端刚以「该时间段已被预约」拒绝了提交，
 * 页面重新拉取后却仍显示它可预约，用户会反复点一个必然失败的按钮。
 */
export function overlayBookedSlots(resourceId: number, date: string, slots: TimeSlot[]): TimeSlot[] {
  const booked = new Set(
    readState()
      .list.filter(
        (item) =>
          item.resourceId === resourceId && item.date === date && item.status !== 'CANCELLED',
      )
      .map((item) => item.startTime),
  )

  return slots.map((slot) =>
    slot.status === 'AVAILABLE' && booked.has(slot.startTime)
      ? { ...slot, status: 'BOOKED' }
      : slot,
  )
}
