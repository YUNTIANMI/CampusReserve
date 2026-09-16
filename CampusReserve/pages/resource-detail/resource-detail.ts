/**
 * 资源详情页。
 *
 * Phase 1：建立页面骨架、接收 id 参数、处理参数缺失的异常情况。
 * Phase 4：接入资源详情与指定日期可用时间段（GET /api/resources/{id} 与 /availability），
 * 实现图片展示、资源信息、日期选择、TimeSlot、选择时间与预约按钮状态。
 * Phase 5：预约前补上「用户已登录」这道门槛。
 * Phase 6：接入真实的预约提交（POST /api/bookings）与全部分支处理。
 * Phase 9：toast 与二次确认改走 utils/feedback.ts 统一出口。
 *
 * 数据经由 `services/resource.ts` / `services/booking.ts` 获取（调用链 Page → Service → API，
 * 技术设计 §5），后端业务 API 落地前由 services/config.ts 的 `USE_MOCK_DATA` 切到本地数据源。
 *
 * 七个刻意的设计判断：
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
 * 6. **提交失败要分清「能不能换个方式重试」**。业务失败（冲突 / 参数 / 时间）重试同样的入参
 *    永远还是失败，必须让用户换时段；只有网络异常才值得原样重试。因此按错误码分流：
 *    冲突时立即重取时段（让那一格显示为已约满），资源不存在时重新加载详情落到 empty 态，
 *    登录态失效时清掉本地登录态并引导重新登录——继续保留「已登录」只会让用户反复碰壁。
 * 7. **客户端预校验不替代服务端校验**。页面提交前先用 utils/booking.ts 判一遍，
 *    只为「不用等一个来回就知道哪里不对」；服务端仍是权威（Phase 6 由开发期数据源承担、
 *    Phase 10 由后端承担）。特别是「不得早于当前时间」——页面上的时段是加载时的快照，
 *    用户停留久了它就可能过期，这条只能在提交那一刻重新判定。
 *
 * 边界说明：预约成功后的「查看预约详情」与「我的预约」列表内容属于 Phase 7，
 * 本阶段成功后跳转到我的预约页（该页 Phase 5 已有登录引导、Phase 7 填充列表）。
 */
import { createBooking } from '../../services/booking'
import { getAvailability, getResourceDetail } from '../../services/resource'
import { ApiError, ApiErrorCode } from '../../services/request'
import { clearSession, isLoggedIn } from '../../store/auth'
import { BOOKING_ERROR_CODE, validateBookingPayload } from '../../utils/booking'
import { buildDateOptions, getWeekdayLabel } from '../../utils/date'
import { confirm, toastError, toastNavigateFailed, toastSuccess } from '../../utils/feedback'
import { getResourceTypeLabel } from '../../utils/resource'
import { getTimeSlotLabel, isSameTimeSlot } from '../../utils/time-slot'
import type { DateOption } from '../../utils/date'
import type { Booking, CreateBookingPayload } from '../../types/booking'
import type { PageState } from '../../types/page'
import type { Availability, Resource, TimeSlot } from '../../types/resource'

/** 日期条展示天数：从今天起连续 7 天 */
const DATE_RANGE_DAYS = 7

/** 提交成功后停留多久再跳转（毫秒），让用户看清「预约成功」提示 */
const SUBMIT_REDIRECT_DELAY = 800

/** 预约成功后的去向；Phase 7 会把该页填成真实的预约列表 */
const MY_BOOKINGS_URL = '/pages/my-bookings/my-bookings'

/** 兜底错误文案，非 ApiError 时使用 */
const FALLBACK_DETAIL_ERROR = '资源加载失败，请稍后重试'
const FALLBACK_SLOT_ERROR = '时间段加载失败，请稍后重试'
const FALLBACK_SUBMIT_ERROR = '预约提交失败，请稍后重试'


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
    /** 是否正在提交（提交中禁用按钮，避免重复下单） */
    submitting: false,
    /** 提交失败的页面内提示；空串表示不展示 */
    submitError: '',
    /**
     * 是否需要在下次显示本页时重新拉取时段。
     * 预约成功后置为 true：那个时段已经被占掉，返回本页时不能再显示为可预约。
     */
    pendingSlotRefresh: false,
  },

  /**
   * 每次显示都检查是否需要刷新时段。
   *
   * 为什么不在提交成功时直接刷新：成功后会跳转到我的预约页，等用户返回时
   * 距离提交已经过了一段时间，期间可能又有别人约走了别的时段。
   * 在「回来的那一刻」重新拉取，拿到的才是当前真实状态。
   */
  onShow() {
    if (!this.data.pendingSlotRefresh) {
      return
    }
    this.setData({ pendingSlotRefresh: false })
    if (this.data.hasValidId && this.data.pageState === 'success') {
      this.loadAvailability()
    }
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
    const submitting = this.data.submitting
    this.setData({
      // 提交中一律不可点：接口已经发出，再点一次就是重复预约
      canSubmit: !!slot && !submitting,
      submitText: submitting
        ? '提交中…'
        : slot
          ? `预约 ${getTimeSlotLabel(slot)}`
          : '请选择时间段',
    })
  },

  /** 切换日期：重新请求该日期的可用时间段 */
  onTapDate(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value as string | undefined
    // 用 === undefined 判断而不是真值：日期值本身不可能是空串，但保持与列表页一致的写法
    if (value === undefined || value === this.data.selectedDate) {
      return
    }

    // 用户主动换了日期：上一条提交失败的提示已经过期
    this.setData({
      selectedDate: value,
      selectedWeekday: getWeekdayLabel(value),
      submitError: '',
    })
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
    // 用户改了选择：上一条失败提示说的是旧时段，继续留着会误导
    this.setData({ selectedSlot: isReselect ? null : slot, submitError: '' })
    this.applySubmitState()
  },

  /**
   * 提交预约（需求 §4.5、技术设计 §11）。
   *
   * 提交前检查的五项分工：
   * 1. 用户已登录 —— 本方法第一步（未登录走 promptLogin）
   * 2. 资源存在   —— 服务端判定（本页已成功加载过资源，但资源可能在用户停留期间下架）
   * 3. 日期合法   —— 客户端预校验（validateBookingPayload）
   * 4. 时间合法   —— 客户端预校验（含「不得早于当前时间」）
   * 5. 时间段仍可用 —— 服务端判定（本页的时段状态是加载时的快照，可能已过期或被别人约走）
   *
   * 为什么用 showModal 而不是直接把用户推去登录页：
   * 用户可能只是误触；而且本页已经选好了日期与时段，直接跳走会让人以为选择丢了。
   * 先问一句，确认后再去登录——登录页是 push 进来的，返回时本页实例与已选时段都还在。
   */
  async onSubmit() {
    // 提交中再点一次就是重复预约，直接忽略（按钮此时也是禁用态）
    if (this.data.submitting) {
      return
    }

    const slot = this.data.selectedSlot
    if (!slot) {
      return
    }

    if (!isLoggedIn()) {
      this.promptLogin()
      return
    }

    const payload: CreateBookingPayload = {
      resourceId: this.data.resourceId,
      date: this.data.selectedDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }

    // 客户端预校验：只覆盖不依赖服务端数据就能判定的部分
    const validation = validateBookingPayload(payload)
    if (!validation.ok) {
      this.showSubmitError(validation.message)
      return
    }

    this.setData({ submitting: true, submitError: '' })
    this.applySubmitState()

    try {
      const booking = await createBooking(payload)
      this.afterSubmitSuccess(booking)
    } catch (error) {
      this.afterSubmitFailure(error)
    }
  },

  /**
   * 未登录时的引导：先问一句再去登录页。
   * 抽成独立方法是因为两条路径都要用——用户本来就未登录，以及登录态被服务端判定为失效。
   *
   * Phase 9 改用 `await confirm(...)`：原先「确认后跳转」只能写在 `wx.showModal` 的
   * `success` 回调里，与外层的提交流程形成两层嵌套；Promise 化后是一条直线。
   */
  async promptLogin() {
    const goLogin = await confirm({
      title: '需要登录',
      content: '登录后才能预约场地，是否现在去登录？',
      confirmText: '去登录',
    })
    if (!goLogin) {
      return
    }
    wx.navigateTo({
      url: '/pages/login/login',
      fail: toastNavigateFailed,
    })
  },

  /** 提交失败的统一展示：页面内提示条 + toast */
  showSubmitError(message: string) {
    this.setData({ submitError: message })
    toastError(message)
  },

  /**
   * 提交成功：提示并跳转到我的预约（需求 §4.5「成功：提示并跳转」）。
   *
   * 「我的预约」而不是「预约详情」：用户预约完的自然意图是「看我约到了什么」，
   * 而预约详情页在 Phase 6 还是骨架，跳过去信息量为零，反而像出了错。
   */
  afterSubmitSuccess(booking: Booking) {
    // 用户在提交期间可能切了日期——那种情况下当前页面上的选择不属于这次提交，不该被清掉
    const isSameTarget =
      this.data.resourceId === booking.resourceId && this.data.selectedDate === booking.date

    this.setData({
      submitting: false,
      submitError: '',
      // 该时段已经约掉了，留着选择只会让用户再点一次注定失败的按钮
      selectedSlot: isSameTarget ? null : this.data.selectedSlot,
      // 返回本页时重新拉时段，让刚约掉的那一格不再显示为可预约
      pendingSlotRefresh: isSameTarget,
    })
    this.applySubmitState()

    toastSuccess('预约成功')
    setTimeout(() => {
      wx.navigateTo({
        url: MY_BOOKINGS_URL,
        fail: toastNavigateFailed,
      })
    }, SUBMIT_REDIRECT_DELAY)
  },

  /**
   * 提交失败：按错误码分流，让用户知道「该换个时段」还是「稍后重试」。
   * 见文件头设计判断 6。
   */
  afterSubmitFailure(error: unknown) {
    const apiError = error instanceof ApiError ? error : null
    const code = apiError ? apiError.code : 0
    const message = apiError ? apiError.message : FALLBACK_SUBMIT_ERROR

    this.setData({ submitting: false })
    this.applySubmitState()
    this.showSubmitError(message)

    if (code === ApiErrorCode.UNAUTHORIZED) {
      // 服务端说凭证已失效：本地继续保留「已登录」只会让用户反复碰壁
      clearSession()
      this.promptLogin()
      return
    }

    if (code === BOOKING_ERROR_CODE.CONFLICT) {
      // 时段状态已经变了，必须重取——否则那一格还显示为可预约，用户会反复点同一个必然失败的按钮。
      // 注意：这里不清 submitError，页面上的原因提示要留着，用户才知道刚才为什么失败。
      this.loadAvailability()
      return
    }

    if (code === BOOKING_ERROR_CODE.RESOURCE_NOT_FOUND) {
      // 资源没了：重新加载详情，落到 empty 态并只给「返回上一页」
      this.loadDetail()
    }
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
