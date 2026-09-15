/**
 * TimeSlot —— 时间段组件（技术设计 §6）。
 *
 * 用途：资源详情页展示单个时间段及其可用状态（需求 §4.4）。
 * 职责边界：只负责展示与抛出选择事件，**不做选择状态管理**——「当前选了哪个时段」
 * 由使用方持有，组件只通过 `selected` 属性接收结果，使同一时段能在不同上下文复用。
 *
 * 使用：
 *   <time-slot
 *     wx:for="{{slots}}"
 *     wx:key="startTime"
 *     slot-data="{{item}}"
 *     selected="{{item.startTime === selectedSlot.startTime}}"
 *     bind:slottap="onTapSlot" />
 *
 * 事件：`slottap`，detail 为 `{ slot }`。事件名刻意不复用 `tap`：组件内部原生 tap 会冒泡，
 * 与自定义事件同名时可能触发两次（同 ResourceCard 的处理）。
 * 仅 `AVAILABLE` 的时段会触发该事件，不可预约时段点击无任何反馈（需求 §4.4）。
 *
 * ⚠ 属性名刻意用 `slotData`（标签上写 `slot-data`）而不是 `slot`：
 * **`slot` 是小程序的保留属性**（用于自定义组件的具名插槽），写 `<time-slot slot="{{item}}">`
 * 会被框架当成插槽声明吃掉，properties 永远收不到值。此坑不报错、不告警，症状是
 * 「组件渲染出来了但内容是空的」——实测排查了一次才定位（当时组件根节点有正确的
 * class（来自 data 默认值），但时段文案与状态文案都是空串）。
 */
import type { TimeSlot as TimeSlotData } from '../../types/resource'
import {
  getTimeSlotLabel,
  getTimeSlotStatusLabel,
  isTimeSlotSelectable,
} from '../../utils/time-slot'

Component({
  properties: {
    /** 要展示的时间段；标签上写作 `slot-data` */
    slotData: {
      type: Object,
      value: null,
    },
    /** 是否为当前选中项，由使用方计算 */
    selected: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    /** 时段文案，如 09:00-10:00 */
    label: '',
    /** 状态中文名 */
    statusLabel: '',
    /** 是否可被选择；决定是否响应点击与 hover 效果 */
    selectable: false,
    /** hover 样式类；不可选时用 'none' 关闭，避免出现「能点」的错觉 */
    hoverClass: 'none',
  },

  observers: {
    slotData(value: TimeSlotData | null) {
      const selectable = isTimeSlotSelectable(value)
      this.setData({
        label: value ? getTimeSlotLabel(value) : '',
        statusLabel: value ? getTimeSlotStatusLabel(value.status) : '',
        selectable,
        hoverClass: selectable ? 'time-slot--hover' : 'none',
      })
    },
  },

  methods: {
    /** 点击时段：不可预约时不触发事件，避免用户误以为选中了 */
    handleTap() {
      if (!this.data.selectable) {
        return
      }
      this.triggerEvent('slottap', { slot: this.data.slotData })
    },
  },
})
