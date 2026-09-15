/**
 * 资源详情页。
 *
 * Phase 1：建立页面骨架、接收 id 参数、处理参数缺失的异常情况。
 * Phase 4：接入资源详情与指定日期可用时间段（GET /api/resources/{id} 与 /availability），
 * 实现图片展示、资源信息、日期选择、TimeSlot、选择时间与预约按钮状态。
 *
 * 数据经由 `services/resource.ts` 获取（调用链 Page → Service → API，技术设计 §5），
 * 后端业务 API 落地前由 services/config.ts 的 `USE_MOCK_DATA` 切到本地数据源。
 *
 * 五个刻意的设计判断：
 * 1. **资源信息区与时间段区各自独立四态**。切换日期只重新请求时间段，若两区共用一个状态，
 *    一次时段请求失败就会把资源名称、地点、描述一并清掉——用户连自己在看哪个资源都不知道了。
 *    分开之后，时段失败只在时段区提示并提供重试。
 * 2. **日期条是静态内容，不随任何四态变化**。理由与列表页的筛选栏一致（技术设计 §7「禁止白屏」）：
 *    某个日期取不到时段时，用户仍应能切换到别的日期。
 * 3. **资源不存在用 empty 态而不是 error 态**。接口正常返回但查无此资源时重试没有意义，
 *    应直接告知「资源不存在」并只给「返回上一页」，而不是给一个注定无效的「重新加载」。
 * 4. **切换日期时清空已选时段**。时段属于某一天，跨日期沿用会提交出一个用户并未选择的组合。
 * 5. **丢弃过期响应**。连续切换日期时先发的请求可能后返回，会覆盖新日期的结果，
 *    因此返回后比对日期，已变化则丢弃本次结果（同资源列表页处理分类筛选的做法）。
 *
 * 边界说明：本阶段只交付「预约按钮的状态逻辑」（未选时段禁用 / 选中后可点击）。
 * 真正的预约提交（校验 + POST /api/bookings）属于 Phase 6，此处点击只给出提示。
 */
import { getAvailability, getResourceDetail } from '../../services/resource'
import { ApiError } from '../../services/request'
import { buildDateOptions, getWeekdayLabel } from '../../utils/date'
import { getResourceTypeLabel } from '../../utils/resource'
import { getTimeSlotLabel, isSameTimeSlot } from '../../utils/time-slot'
import type { DateOption } from '../../utils/date'
import type { PageState } from '../../types/page'
import type { Availability, Resource, TimeSlot } from '../../types/resource'

/** 日期条展示天数：从今天起连续 7 天 */
const DATE_RANGE_DAYS = 7

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_DETAIL_ERROR = '资源加载失败，请稍后重试'
const FALLBACK_SLOT_ERROR = '时间段加载失败，请稍后重试'

Page({
  data: {
    /** 资源 ID，来自页面参数 */
    resourceId: 0,
    /** 参数是否合法；不合法时展示错误状态而不是空白页 */
    hasValidId: false,

    /** 资源信息区状态 */
    pageState: 'loading' as PageState,
    /** 资源信息区错误提示 */
    errorMessage: '',
    /** 资源详情 */
    resource: null as Resource | null,
    /** 资源类型中文名 */
    typeLabel: '',

    /** 日期条选项，静态内容 */
    dateOptions: [] as DateOption[],
    /** 当前选中日期，格式 YYYY-MM-DD */
    selectedDate: '',
    /** 当前选中日期是星期几（页面标题区展示用） */
    selectedWeekday: '',

    /** 时间段区状态 */
    slotState: 'loading' as PageState,
    /** 时间段区错误提示 */
    slotError: '',
    /** 当前日期的全部时间段 */
    slots: [] as TimeSlot[],
    /** 当前选中的时间段；null 表示未选择 */
    selectedSlot: null as TimeSlot | null,
    /** 该日期存在时间段但全部不可预约时的补充提示；空串表示不展示 */
    slotHint: '',

    /** 预约按钮文案 */
    submitText: '请选择时间段',
    /** 预约按钮是否可点击 */
    canSubmit: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const raw = query.id || ''
    const id = Number(raw)
    // 要求正整数：`0`、`1.5`、`abc` 都不是合法资源 ID，一律走参数错误分支
    const hasValidId = raw !== '' && Number.isInteger(id) && id > 0

    if (!hasValidId) {
      this.setData({ hasValidId: false, resourceId: 0 })
      return
    }

    const dateOptions = buildDateOptions(DATE_RANGE_DAYS)
    const selectedDate = dateOptions.length > 0 ? dateOptions[0].value : ''
    this.setData({
      hasValidId: true,
      resourceId: id,
      dateOptions,
      selectedDate,
      selectedWeekday: getWeekdayLabel(selectedDate),
    })
    this.loadDetail()
  },

  /**
   * 加载资源详情。
   * 资源信息区四态由本方法统一维护，不存在无限 loading。
   */
  async loadDetail() {
    const id = this.data.resourceId
    this.setData({ pageState: 'loading', errorMessage: '' })

    try {
      const resource = await getResourceDetail(id)
      if (this.data.resourceId !== id) {
        return
      }

      if (!resource) {
        // 资源不存在：时间段区无事可做，一并落到空态，避免残留上一个资源的时段
        this.setData({
          pageState: 'empty',
          resource: null,
          typeLabel: '',
          slots: [],
          selectedSlot: null,
          slotState: 'empty',
          slotHint: '',
        })
        this.applySubmitState()
        return
      }

      this.setData({
        pageState: 'success',
        resource,
        typeLabel: getResourceTypeLabel(resource.type),
      })
      this.loadAvailability()
    } catch (error) {
      if (this.data.resourceId !== id) {
        return
      }
      const message = error instanceof ApiError ? error.message : FALLBACK_DETAIL_ERROR
      this.setData({ pageState: 'error', errorMessage: message, resource: null })
    }
  },

  /**
   * 加载当前日期的可用时间段。
   * 每次加载都先清空已选时段：时段属于某一天，旧选择不能带到新日期。
   */
  async loadAvailability() {
    const id = this.data.resourceId
    const date = this.data.selectedDate

    this.setData({
      slotState: 'loading',
      slotError: '',
      slots: [],
      selectedSlot: null,
      slotHint: '',
    })
    this.applySubmitState()

    try {
      const availability = await getAvailability(id, date)
      // 等待期间用户切换了日期或资源：本次结果已过期，丢弃以免覆盖新日期的结果
      if (date !== this.data.selectedDate || id !== this.data.resourceId) {
        return
      }
      this.renderSlots(availability)
    } catch (error) {
      if (date !== this.data.selectedDate || id !== this.data.resourceId) {
        return
      }
      const message = error instanceof ApiError ? error.message : FALLBACK_SLOT_ERROR
      this.setData({ slotState: 'error', slotError: message, slots: [], selectedSlot: null })
      this.applySubmitState()
    }
  },

  /**
   * 渲染时间段。
   *
   * 「有时段但全部不可预约」仍是 success 而不是 empty：时段确实存在、也确实要展示出来
   * （用户需要看到「已约满 / 不可预约」才知道为什么约不上），只是额外给一句提示。
   * 若这里落到 empty，展示成「该日期暂无可约时段」会把已有信息藏起来。
   */
  renderSlots(availability: Availability) {
    const slots = availability.slots || []

    if (slots.length === 0) {
      this.setData({ slotState: 'empty', slots: [], selectedSlot: null, slotHint: '' })
      this.applySubmitState()
      return
    }

    const hasSelectable = slots.some((slot) => slot.status === 'AVAILABLE')
    this.setData({
      slotState: 'success',
      slots,
      selectedSlot: null,
      slotHint: hasSelectable ? '' : '该日期时段均已约满或已过时，请选择其他日期',
    })
    this.applySubmitState()
  },

  /** 依据当前选择刷新预约按钮的状态与文案 */
  applySubmitState() {
    const slot = this.data.selectedSlot
    this.setData({
      canSubmit: !!slot,
      submitText: slot ? `预约 ${getTimeSlotLabel(slot)}` : '请选择时间段',
    })
  },

  /** 切换日期：重新请求该日期的可用时间段 */
  onTapDate(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value as string | undefined
    // 用 === undefined 判断而不是真值：日期值本身不可能是空串，但保持与列表页一致的写法
    if (value === undefined || value === this.data.selectedDate) {
      return
    }

    this.setData({ selectedDate: value, selectedWeekday: getWeekdayLabel(value) })
    this.loadAvailability()
  },

  /**
   * 选择时间段。
   * 再次点击已选时段视为取消选择——时段是可选项而非必填项，给用户一个不用找「取消」的退路。
   * 不可预约的时段不会走到这里（TimeSlot 组件已拦截），此处再校验一次以防调用方绕过组件。
   */
  onTapSlot(e: WechatMiniprogram.CustomEvent<{ slot: TimeSlot }>) {
    const slot = e.detail.slot
    if (!slot || slot.status !== 'AVAILABLE') {
      return
    }

    const isReselect = isSameTimeSlot(this.data.selectedSlot, slot)
    this.setData({ selectedSlot: isReselect ? null : slot })
    this.applySubmitState()
  },

  /**
   * 提交预约。
   * Phase 4 只交付按钮状态：未选时段时按钮禁用（此处再兜一次），选中后点击给出提示。
   * Phase 6 会把这里换成 createBooking 调用与结果处理。
   */
  onSubmit() {
    const slot = this.data.selectedSlot
    if (!slot) {
      return
    }
    wx.showToast({ title: '预约提交功能即将开放', icon: 'none' })
  },

  /** 资源信息区 error-state 的重试事件 */
  onRetryDetail() {
    this.loadDetail()
  },

  /** 时间段区 error-state 的重试事件：只重取当前日期的时段，不动资源信息 */
  onRetrySlots() {
    this.loadAvailability()
  },

  /** 参数非法或资源不存在时，ErrorState / EmptyState 的按钮作为「返回上一页」使用 */
  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' })
      },
    })
  },
})
