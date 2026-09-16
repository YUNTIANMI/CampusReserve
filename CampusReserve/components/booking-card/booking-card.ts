/**
 * BookingCard —— 预约卡片（Phase 7）。
 *
 * 用途：我的预约页展示单条预约（需求 §4.6「每条包含资源、日期、时间、状态」）。
 * 职责边界与 ResourceCard 一致——只负责展示与抛出点击事件，**不硬编码路由**，
 * 跳转由使用方决定。
 *
 * 状态标签展示的是 utils/booking.ts 的 `resolveBookingStatus()` **派生**结果，
 * 不是 `booking.status` 原值：服务端只记录显式变更（创建 / 取消），
 * 「时段已过」没有人去点一下，但卡片上必须显示成「已完成」，
 * 否则昨天约的场地今天还挂在「待使用」里。
 *
 * 使用：
 *   <booking-card wx:for="{{list}}" wx:key="id" booking="{{item}}" bind:cardtap="onOpenBooking" />
 *
 * 事件：`cardtap`，detail 为 `{ booking }`。
 * 事件名刻意不复用 `tap`：组件内部的原生 tap 会冒泡，与自定义事件同名时可能触发两次。
 */
import { BOOKING_STATUS_LABELS, resolveBookingStatus } from '../../utils/booking'
import { getWeekdayLabel } from '../../utils/date'
import type { Booking, BookingStatus } from '../../types/booking'

Component({
  properties: {
    /** 要展示的预约 */
    booking: {
      type: Object,
      value: null,
    },
  },

  data: {
    /** 派生状态：PENDING / COMPLETED / CANCELLED */
    status: 'PENDING' as BookingStatus,
    /** 状态中文名 */
    statusLabel: '',
    /** 日期文案，如「2026-09-16 周三」 */
    dateLabel: '',
    /** 时间段文案，如「09:00-10:00」 */
    timeLabel: '',
    /** 状态标签的样式修饰符后缀，用于区分配色 */
    statusModifier: 'pending',
  },

  observers: {
    booking(value: Booking | null) {
      if (!value) {
        this.setData({ status: 'PENDING', statusLabel: '', dateLabel: '', timeLabel: '' })
        return
      }

      const status = resolveBookingStatus(value)
      const weekday = getWeekdayLabel(value.date)

      this.setData({
        status,
        statusLabel: BOOKING_STATUS_LABELS[status],
        dateLabel: weekday ? `${value.date} ${weekday}` : value.date,
        timeLabel: `${value.startTime}-${value.endTime}`,
        statusModifier: status.toLowerCase(),
      })
    },
  },

  methods: {
    /** 点击卡片时触发 cardtap 事件，携带 booking 供使用方跳转 */
    handleTap() {
      this.triggerEvent('cardtap', { booking: this.data.booking })
    },
  },
})
