/**
 * CampusReserve Phase 7 端到端测试（我的预约）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase7.js ws://127.0.0.1:9420
 *
 * 覆盖：未登录引导、空列表三页签、真实创建一条预约后出现在待使用（Phase 6 → Phase 7 串联）、
 *       状态派生（已过时的待使用自动归到已完成）、三个页签的过滤与排序、
 *       BookingCard 渲染、页签切换不重新请求、预约详情展示与两类兜底（查不到 / 缺参数）、
 *       列表请求失败与重试、登录态失效时清掉本地状态并引导重新登录。
 *
 * 复用 e2e-phase4/5/6.js 的实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 进不了自定义组件内部；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中返回占位对象而非 null，判存在要同时校验 tagName 与尺寸，见 xpathEl()。
 *   3. 不要用 mp.reLaunch()；多级返回用 mp.evaluate(() => wx.navigateBack({ delta }))。
 *   4. 导航之间必须等过渡收尾（约 1.4s），见 waitForRouteSettled()。
 *   5. 点击交互后要轮询到「目标字段已变为期望值」，不能只读一次。
 *   6. element.tap() 只派发给查到的那个节点，必须点组件根节点。
 *   7. toast 由客户端渲染读不到，用常驻探针 installFeedbackSpy() 捕获。
 *   8. 登录态的真源是 store 的内存态，写 storage 不生效，必须走真实登录流程。
 *
 * 本阶段新增的三条注意点：
 *   1. **构造数据直接写缓存键 CR_MOCK_BOOKINGS**（与 services/mock-booking-store.ts 同结构
 *      `{ seq, list }`）。它本来就是开发期数据源的存储位置，直接写等价于服务端有这些数据，
 *      比绕一圈 UI 去创建三条不同状态的预约可控得多——尤其是「已过时」与「已取消」
 *      这两类，UI 上根本创建不出来。
 *   2. **断言列表内容优先读 page.data 的 list 字段**，而不是去数渲染层卡片；
 *      卡片渲染只做少量抽样断言（xpath 文案），避免把「数据对不对」和「渲染对不对」
 *      两个问题耦合成一个难以定位的失败。
 *   3. **「页签切换不重新请求」要用注入法验证**：先把数据源打成 error，
 *      再切页签——若列表照常显示，就证明确实没有重新请求。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'
const MOCK_AUTH_MODE_KEY = 'CR_MOCK_AUTH_MODE'
const MOCK_BOOKING_MODE_KEY = 'CR_MOCK_BOOKING_MODE'
const MOCK_MY_BOOKINGS_MODE_KEY = 'CR_MOCK_MY_BOOKINGS_MODE'

/** 与小程序端 services/mock-booking-store.ts 保持一致 */
const MOCK_BOOKINGS_KEY = 'CR_MOCK_BOOKINGS'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'
const BOOKING_DETAIL = 'pages/booking-detail/booking-detail'

/** 被测资源：mock 数据源中的固定一条 */
const RESOURCE_ID = 1

/** 时段组件根节点（class 带修饰符，用 contains + not 排除子元素） */
const SLOT_ROOT = (i) =>
  `(//view[contains(@class,"time-slot") and not(contains(@class,"time-slot__"))])[${i}]`

/** 预约卡片组件根节点 */
const BOOKING_CARD_ROOT = (i) =>
  `(//view[contains(@class,"booking-card") and not(contains(@class,"booking-card__"))])[${i}]`

/** 与小程序端一致的提示文案 */
const MSG = {
  network: '网络连接失败，请检查网络后重试',
  unauthorized: '登录状态已失效，请重新登录',
  submitSuccess: '预约成功',
  loginLoading: '登录中…',
  loginGuide: '登录后查看我的预约',
  notFound: '未找到该预约',
  emptyPending: '暂无待使用的预约',
  emptyCompleted: '暂无已完成的预约',
  emptyCancelled: '暂无已取消的预约',
}

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function pad(n) {
  return n < 10 ? `0${n}` : String(n)
}

/** 相对今天偏移 offsetDays 天的日期，格式 YYYY-MM-DD（与 utils/date.ts 的 formatDate 同语义） */
function dateString(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowDateTime() {
  const d = new Date()
  return `${dateString(0)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/* ---------------- 路由 ---------------- */

async function currentPath(mp) {
  try {
    return await mp.evaluate(() => {
      const pages = getCurrentPages()
      return pages.length ? pages[pages.length - 1].route : null
    })
  } catch (e) {
    const page = await mp.currentPage()
    return page ? page.path : null
  }
}

async function waitForPath(mp, target, timeoutMs = 6000) {
  const t0 = Date.now()
  let p = null
  while (Date.now() - t0 < timeoutMs) {
    p = await currentPath(mp)
    if (p === target) return p
    await sleep(250)
  }
  return p
}

const TRANSITION_SETTLE_MS = 1400

async function waitForRouteSettled(mp, target, timeoutMs = 15000) {
  const path = await waitForPath(mp, target, timeoutMs)
  if (path === target) {
    await sleep(TRANSITION_SETTLE_MS)
  }
  return path
}

async function stackInfo(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    return { len: pages.length, routes: pages.map((p) => p.route) }
  })
}

/** 退回页面栈栈底 */
async function bottomRoute(mp) {
  let info = await stackInfo(mp)
  let guard = 0
  while (info.len > 1 && guard < 8) {
    try {
      await mp.evaluate((d) => wx.navigateBack({ delta: d }), info.len - 1)
    } catch (e) {
      /* 工具层抛错时导航通常已生效 */
    }
    await sleep(1200)
    info = await stackInfo(mp)
    guard++
  }
  await sleep(TRANSITION_SETTLE_MS)
  return info.routes[0]
}

/** 按真实页面栈一次返回到指定页 */
async function goBackTo(mp, targetPath) {
  await sleep(300)
  const info = await stackInfo(mp)
  const idx = info.routes.lastIndexOf(targetPath)
  if (idx < 0) {
    return info.routes.length ? info.routes[info.routes.length - 1] : null
  }
  const delta = info.routes.length - 1 - idx
  if (delta <= 0) return targetPath
  try {
    await mp.evaluate((d) => wx.navigateBack({ delta: d }), delta)
  } catch (e) {
    /* 同上 */
  }
  return waitForRouteSettled(mp, targetPath, 15000)
}

/* ---------------- 渲染层查询 ---------------- */

/** xpath 未命中返回占位对象，故以 tagName + 尺寸双重判定 */
async function xpathEl(page, xpath) {
  const el = await page.xpath(xpath)
  if (!el) return null
  const size = await el.size().catch(() => null)
  const w = size ? parseFloat(String(size.width)) : 0
  const h = size ? parseFloat(String(size.height)) : 0
  if (typeof el.tagName !== 'string' || !el.tagName || !(w > 0) || !(h > 0)) return null
  return el
}

async function xpathText(page, xpath) {
  const el = await xpathEl(page, xpath)
  return el ? await el.text() : null
}

/** 依次试探 n = 1..max，数出匹配到的元素个数 */
async function xpathCount(page, xpathOf, max = 20) {
  let n = 0
  for (let i = 1; i <= max; i++) {
    const el = await xpathEl(page, xpathOf(i))
    if (!el) break
    n = i
  }
  return n
}

/** 轮询读当前页 data，直到命中 predicate；超时返回最后一次读到的数据 */
async function waitForPageData(mp, path, predicate, timeoutMs = 12000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === path) {
      const data = await page.data()
      last = data
      if (predicate(data)) return data
    }
    await sleep(200)
  }
  return last
}

/* ---------------- 开发期数据源注入 ---------------- */

async function setStorageValue(mp, key, value) {
  await mp.evaluate((k, v) => wx.setStorageSync(k, v), key, value)
}

async function removeStorageValue(mp, key) {
  await mp.evaluate((k) => wx.removeStorageSync(k), key)
}

async function clearAllModes(mp) {
  await removeStorageValue(mp, MOCK_MODE_KEY)
  await removeStorageValue(mp, MOCK_AVAIL_MODE_KEY)
  await removeStorageValue(mp, MOCK_AUTH_MODE_KEY)
  await removeStorageValue(mp, MOCK_BOOKING_MODE_KEY)
  await removeStorageValue(mp, MOCK_MY_BOOKINGS_MODE_KEY)
}

async function setMyBookingsMode(mp, mode) {
  await setStorageValue(mp, MOCK_MY_BOOKINGS_MODE_KEY, mode)
}

async function clearMyBookingsMode(mp) {
  await removeStorageValue(mp, MOCK_MY_BOOKINGS_MODE_KEY)
}

async function resetMockBookings(mp) {
  await removeStorageValue(mp, MOCK_BOOKINGS_KEY)
}

async function readMockBookings(mp) {
  return mp.evaluate((key) => {
    try {
      const raw = wx.getStorageSync(key)
      return raw && Array.isArray(raw.list) ? raw.list : []
    } catch (e) {
      return []
    }
  }, MOCK_BOOKINGS_KEY)
}

/**
 * 直接写开发期预约表。
 * 结构必须与 services/mock-booking-store.ts 的 MockBookingState 一致：`{ seq, list }`。
 */
async function writeMockBookings(mp, list) {
  await mp.evaluate(
    (key, l) => wx.setStorageSync(key, { seq: l.length, list: l }),
    MOCK_BOOKINGS_KEY,
    list,
  )
}

function makeBooking(id, resourceName, location, date, startTime, endTime, status, resourceId) {
  return {
    id,
    resourceId: resourceId || 1,
    resourceName,
    location,
    date,
    startTime,
    endTime,
    status,
    createdAt: nowDateTime(),
  }
}

/* ---------------- 登录态 ---------------- */

async function readGlobalAuth(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    const g = (app && app.globalData) || {}
    return {
      loginState: g.loginState || 'UNKNOWN',
      userInfo: g.userInfo || null,
    }
  })
}

async function openLogin(mp) {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/login/login' }))
  return waitForRouteSettled(mp, LOGIN, 15000)
}

/** 已站在登录页时不能再 navigateTo 一次（会让页面栈变成 [来源页, 登录页, 登录页]） */
async function ensureOnLoginPage(mp) {
  const path = await currentPath(mp)
  if (path === LOGIN) return LOGIN
  return openLogin(mp)
}

async function readLoginButtonText(mp) {
  const page = await mp.currentPage()
  if (!page || page.path !== LOGIN) return null
  const btn = await page.$('.cr-btn--primary')
  if (!btn) return null
  const text = await btn.text()
  return (text || '').trim()
}

async function tapLoginAndWatchLoading(mp, timeoutMs = 6000) {
  const page = await mp.currentPage()
  const btn = await page.$('.cr-btn--primary')
  if (!btn) return { tapped: false, sawLoading: false, seen: [] }

  const seen = []
  let sawLoading = false
  await btn.tap()

  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const text = await readLoginButtonText(mp)
    if (text !== null && seen.indexOf(text) < 0) seen.push(text)
    if (text === MSG.loginLoading) sawLoading = true
    if (text === null) break
    if (sawLoading && text === '微信一键登录') break
    await sleep(60)
  }
  return { tapped: true, sawLoading, seen }
}

async function loginViaPage(mp, backTo, timeoutMs = 20000) {
  await ensureOnLoginPage(mp)
  const watch = await tapLoginAndWatchLoading(mp)
  const back = await waitForRouteSettled(mp, backTo, timeoutMs)
  return { watch, back }
}

async function logoutViaPage(mp, backTo) {
  await ensureOnLoginPage(mp)
  await mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    const original = wx.showModal
    wx.showModal = function (options) {
      if (options && typeof options.success === 'function') {
        options.success({ confirm: true, cancel: false })
      }
    }
    try {
      current.onLogout()
    } finally {
      try {
        wx.showModal = original
      } catch (e) {
        /* ignore */
      }
    }
  })
  await sleep(700)
  await mp.evaluate(() => wx.navigateBack({ delta: 1 }))
  return waitForRouteSettled(mp, backTo, 15000)
}

async function ensureLoggedOut(mp, backTo) {
  const auth = await readGlobalAuth(mp)
  if (auth.loginState === 'LOGGED_IN') {
    await logoutViaPage(mp, backTo)
  }
}

/* ---------------- 反馈探针 ---------------- */

async function installFeedbackSpy(mp, autoConfirm) {
  return mp.evaluate((confirm) => {
    const app = getApp()
    if (!app.__e2eSpy) {
      const spy = {
        toasts: [],
        modals: [],
        autoConfirm: !!confirm,
        originalToast: wx.showToast,
        originalModal: wx.showModal,
      }
      app.__e2eSpy = spy
      wx.showToast = function (options) {
        spy.toasts.push((options && options.title) || '')
      }
      wx.showModal = function (options) {
        spy.modals.push((options && options.title) || '')
        if (spy.autoConfirm && options && typeof options.success === 'function') {
          options.success({ confirm: true, cancel: false })
        }
      }
    } else {
      app.__e2eSpy.autoConfirm = !!confirm
    }
    return true
  }, !!autoConfirm)
}

async function readFeedbackSpy(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    const spy = app.__e2eSpy
    return spy
      ? { toasts: spy.toasts.slice(), modals: spy.modals.slice() }
      : { toasts: [], modals: [] }
  })
}

async function resetFeedbackSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    if (app.__e2eSpy) {
      app.__e2eSpy.toasts = []
      app.__e2eSpy.modals = []
    }
  })
}

async function uninstallFeedbackSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    const spy = app.__e2eSpy
    if (spy) {
      try {
        wx.showToast = spy.originalToast
      } catch (e) {
        /* ignore */
      }
      try {
        wx.showModal = spy.originalModal
      } catch (e) {
        /* ignore */
      }
      delete app.__e2eSpy
    }
  })
}

function countOf(list, text) {
  return (list || []).filter((item) => item === text).length
}

/* ---------------- 我的预约页辅助 ---------------- */

async function openMyBookings(mp) {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/my-bookings/my-bookings' }))
  return waitForRouteSettled(mp, MY_BOOKINGS)
}

/** 等待我的预约页内容区达到某个状态（loading / success / empty / error） */
async function waitMyBookingsState(mp, state, timeoutMs = 12000) {
  return waitForPageData(mp, MY_BOOKINGS, (d) => d.pageState === state, timeoutMs)
}

/** 直接触发页面的重新加载（等价于点了 error-state 的「重新加载」） */
async function callMyBookingsRetry(mp) {
  await mp.evaluate(() => {
    const pages = getCurrentPages()
    pages[pages.length - 1].onRetry()
  })
}

/** 触发 onShow 语义的刷新：页面每次展示都会重新拉取 */
async function callMyBookingsOnShow(mp) {
  await mp.evaluate(() => {
    const pages = getCurrentPages()
    pages[pages.length - 1].onShow()
  })
}

/** 点第 index 个页签（0 基） */
async function tapTab(mp, index) {
  const page = await mp.currentPage()
  const tabs = await page.$$('.tabs__item')
  if (!tabs[index]) return false
  await tabs[index].tap()
  await sleep(500)
  return true
}

/* ---------------- 详情页（用于真实创建一条预约） ---------------- */

async function openDetail(mp, id) {
  await mp.evaluate(
    (rid) => wx.navigateTo({ url: `/pages/resource-detail/resource-detail?id=${rid}` }),
    id,
  )
  return waitForRouteSettled(mp, DETAIL)
}

function firstAvailableIndex(slots) {
  const idx = (slots || []).findIndex((s) => s.status === 'AVAILABLE')
  return idx < 0 ? 0 : idx + 1
}

async function tapSlotByXPathIndex(mp, n) {
  const page = await mp.currentPage()
  const el = await xpathEl(page, SLOT_ROOT(n))
  if (!el) return false
  await el.tap()
  await sleep(400)
  return true
}

/**
 * 打开详情页、切到明天、选中一个可预约时段。
 * 必须切到明天：mock 按技术设计 §11 把「当天已过时」的时段标为 DISABLED，
 * 傍晚之后运行测试时当天的可预约时段数会是 0。
 */
async function openFreshDetailWithSlot(mp, resourceId = RESOURCE_ID) {
  await goBackTo(mp, HOME)
  const path = await openDetail(mp, resourceId)
  if (path !== DETAIL) {
    return { ok: false, reason: `未能进入详情页（${path}）`, detail: null }
  }

  let detail = await waitForPageData(
    mp,
    DETAIL,
    (d) => d.pageState === 'success' && d.slotState === 'success',
  )
  if (!detail || detail.pageState !== 'success') {
    return { ok: false, reason: '详情页未加载成功', detail }
  }

  if (detail.dateOptions && detail.dateOptions.length > 1) {
    const tomorrow = detail.dateOptions[1].value
    if (detail.selectedDate !== tomorrow) {
      const page = await mp.currentPage()
      const dates = await page.$$('.date-bar__item')
      if (dates[1]) {
        await dates[1].tap()
        detail = await waitForPageData(
          mp,
          DETAIL,
          (d) => d.selectedDate === tomorrow && d.slotState === 'success',
        )
      }
    }
  }

  const slotIdx = firstAvailableIndex(detail ? detail.slots : [])
  if (slotIdx <= 0) {
    return { ok: false, reason: '该日期没有可预约时段', detail }
  }

  await tapSlotByXPathIndex(mp, slotIdx)
  detail = await waitForPageData(mp, DETAIL, (d) => !!d.selectedSlot)
  if (!detail || !detail.selectedSlot) {
    return { ok: false, reason: '未能选中时段', detail }
  }
  return { ok: true, reason: '', detail }
}

async function callSubmit(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current.onSubmit()
    return { submitting: current.data.submitting }
  })
}

/* ---------------- 主流程 ---------------- */

;(async () => {
  let mp
  for (let i = 1; i <= 6; i++) {
    try {
      mp = await automator.connect({ wsEndpoint })
      break
    } catch (e) {
      console.log(`第 ${i} 次连接失败：${e.message}`)
      if (i === 6) {
        console.error(`无法连接自动化：${e.message}`)
        process.exit(2)
      }
      await sleep(5000)
    }
  }

  try {
    await sleep(1500)

    // ---------- 0. 环境准备 ----------
    const bottom = await bottomRoute(mp)
    check('本次启动的入口页为首页（页面栈栈底）', bottom === HOME, String(bottom))

    await clearAllModes(mp)
    await resetMockBookings(mp)
    await ensureLoggedOut(mp, HOME)

    let auth = await readGlobalAuth(mp)
    check('起点为未登录状态', auth.loginState === 'LOGGED_OUT', String(auth.loginState))
    check('开发期预约表已清空', (await readMockBookings(mp)).length === 0)

    await installFeedbackSpy(mp, false)

    // ---------- 1. 未登录：展示登录引导，且不发起列表请求 ----------
    await openMyBookings(mp)
    let data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.loginState === 'LOGGED_OUT')
    check('未登录时可以进入我的预约页', !!data, data ? '' : '未读到页面数据')
    check(
      '未登录时登录态为 LOGGED_OUT',
      !!data && data.loginState === 'LOGGED_OUT',
      String(data && data.loginState),
    )

    let page = await mp.currentPage()
    let guideText = await xpathText(page, '//text[@class="empty-state__text"]')
    check('未登录时展示登录引导文案', guideText === MSG.loginGuide, String(guideText))

    const guideAction = await xpathText(page, '//view[@class="empty-state__action"]')
    check('登录引导提供「去登录」按钮', guideAction === '去登录', String(guideAction))

    const tabs = await page.$$('.tabs__item')
    check('未登录时三个状态页签仍然渲染', tabs.length === 3, `实际 ${tabs.length}`)
    check(
      '未登录时不发起列表请求（列表为空且未落到错误态）',
      !!data && data.allBookings.length === 0 && data.pageState === 'loading',
      `allBookings=${data && data.allBookings.length} pageState=${data && data.pageState}`,
    )

    await resetFeedbackSpy(mp)
    const loginBtn = await xpathEl(page, '//view[@class="empty-state__action"]')
    if (loginBtn) await loginBtn.tap()
    let p = await waitForRouteSettled(mp, LOGIN, 10000)
    check('点击「去登录」进入登录页', p === LOGIN, String(p))

    // ---------- 2. 登录后：空列表的三页签空态 ----------
    await goBackTo(mp, HOME)
    const login = await loginViaPage(mp, HOME)
    check('通过登录页完成登录并返回首页', login.back === HOME, String(login.back))
    auth = await readGlobalAuth(mp)
    check('已处于登录状态', auth.loginState === 'LOGGED_IN', String(auth.loginState))

    await openMyBookings(mp)
    data = await waitMyBookingsState(mp, 'empty')
    check(
      '已登录且无预约时落到空态',
      !!data && data.pageState === 'empty',
      String(data && data.pageState),
    )
    check('待使用页签空态文案', !!data && data.emptyText === MSG.emptyPending, String(data && data.emptyText))

    await tapTab(mp, 1)
    data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.activeStatus === 'COMPLETED')
    check(
      '切换到「已完成」页签',
      !!data && data.activeStatus === 'COMPLETED',
      String(data && data.activeStatus),
    )
    check(
      '已完成页签空态文案',
      !!data && data.emptyText === MSG.emptyCompleted,
      String(data && data.emptyText),
    )

    await tapTab(mp, 2)
    data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.activeStatus === 'CANCELLED')
    check(
      '切换到「已取消」页签',
      !!data && data.activeStatus === 'CANCELLED',
      String(data && data.activeStatus),
    )
    check(
      '已取消页签空态文案',
      !!data && data.emptyText === MSG.emptyCancelled,
      String(data && data.emptyText),
    )

    await tapTab(mp, 0)
    data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.activeStatus === 'PENDING')
    check(
      '切回「待使用」页签',
      !!data && data.activeStatus === 'PENDING',
      String(data && data.activeStatus),
    )

    // ---------- 3. 真实创建一条预约后出现在「我的预约」（Phase 6 → 7 串联） ----------
    await resetFeedbackSpy(mp)
    await goBackTo(mp, HOME)
    const prepared = await openFreshDetailWithSlot(mp)
    check('已登录时可以选中一个可预约时段', prepared.ok, prepared.reason)

    let createdSlot = null
    let createdDate = ''
    let createdResourceName = ''
    if (prepared.ok) {
      createdSlot = prepared.detail.selectedSlot
      createdDate = prepared.detail.selectedDate
      createdResourceName = prepared.detail.resource ? prepared.detail.resource.name : ''

      await callSubmit(mp)
      const arrived = await waitForRouteSettled(mp, MY_BOOKINGS, 15000)
      check('预约成功后跳转到我的预约页', arrived === MY_BOOKINGS, String(arrived))

      data = await waitMyBookingsState(mp, 'success')
      check(
        '新创建的预约出现在列表中',
        !!data && data.list.length === 1,
        `list=${data ? data.list.length : 'n/a'}`,
      )

      if (data && data.list.length === 1) {
        const b = data.list[0]
        check(
          '列表中的预约与提交的一致（资源 / 日期 / 时间）',
          b.resourceName === createdResourceName &&
            b.date === createdDate &&
            b.startTime === createdSlot.startTime &&
            b.endTime === createdSlot.endTime,
          `${b.resourceName}/${b.date}/${b.startTime}-${b.endTime}`,
        )
        check('新创建的预约状态为 PENDING', b.status === 'PENDING', String(b.status))
        check(
          '新创建的预约归到「待使用」页签',
          data.activeStatus === 'PENDING',
          String(data.activeStatus),
        )
      } else {
        check('列表中的预约与提交的一致（资源 / 日期 / 时间）', false, '列表为空')
        check('新创建的预约状态为 PENDING', false, '列表为空')
        check('新创建的预约归到「待使用」页签', false, '列表为空')
      }

      const feedback = await readFeedbackSpy(mp)
      check(
        '提交成功给出了「预约成功」提示',
        countOf(feedback.toasts, MSG.submitSuccess) === 1,
        JSON.stringify(feedback.toasts),
      )
    } else {
      check('预约成功后跳转到我的预约页', false, prepared.reason)
      check('新创建的预约出现在列表中', false, prepared.reason)
      check('列表中的预约与提交的一致（资源 / 日期 / 时间）', false, prepared.reason)
      check('新创建的预约状态为 PENDING', false, prepared.reason)
      check('新创建的预约归到「待使用」页签', false, prepared.reason)
      check('提交成功给出了「预约成功」提示', false, prepared.reason)
    }

    // ---------- 4. 状态派生与三个页签的过滤 / 排序 ----------
    await resetMockBookings(mp)
    const tomorrow = dateString(1)
    const dayAfter = dateString(2)
    const yesterday = dateString(-1)
    const dayBefore = dateString(-2)

    await writeMockBookings(mp, [
      makeBooking(1, '第一教学楼 A101', '东区一教', tomorrow, '09:00', '10:00', 'PENDING', 1),
      makeBooking(2, '第二教学楼 B202', '西区二教', dayAfter, '14:00', '15:00', 'PENDING', 2),
      makeBooking(3, '图书馆研讨室 C3', '中区图书馆', yesterday, '09:00', '10:00', 'PENDING', 3),
      makeBooking(4, '体育馆羽毛球馆', '北区体育馆', dayBefore, '08:00', '09:00', 'PENDING', 4),
      makeBooking(5, '第一教学楼 A101', '东区一教', yesterday, '16:00', '17:00', 'CANCELLED', 1),
    ])

    await callMyBookingsOnShow(mp)
    data = await waitMyBookingsState(mp, 'success')
    check(
      '注入 5 条预约后待使用页签有 2 条',
      !!data && data.list.length === 2,
      `list=${data ? data.list.length : 'n/a'}`,
    )
    check(
      '服务端返回的是全量 5 条（三个页签共享一次请求的结果）',
      !!data && data.allBookings.length === 5,
      `allBookings=${data ? data.allBookings.length : 'n/a'}`,
    )
    check(
      '待使用只含未来的 PENDING（已过时的不在这里）',
      !!data && data.list.every((b) => b.status === 'PENDING' && b.date >= tomorrow),
      data ? JSON.stringify(data.list.map((b) => `${b.id}:${b.date}`)) : 'n/a',
    )
    check(
      '待使用按时间升序（最近要先用的在最上面）',
      !!data && data.list.length === 2 && data.list[0].id === 1 && data.list[1].id === 2,
      data ? JSON.stringify(data.list.map((b) => b.id)) : 'n/a',
    )

    // ---------- 5. BookingCard 渲染 ----------
    page = await mp.currentPage()
    const cardCount = await xpathCount(page, BOOKING_CARD_ROOT)
    check('渲染出 2 张预约卡片', cardCount === 2, `实际 ${cardCount}`)

    const firstCardText = (await xpathText(page, BOOKING_CARD_ROOT(1))) || ''
    check('卡片展示资源名称', firstCardText.indexOf('第一教学楼 A101') >= 0, firstCardText)
    check('卡片展示时间段', firstCardText.indexOf('09:00-10:00') >= 0, firstCardText)
    check('卡片展示状态「待使用」', firstCardText.indexOf('待使用') >= 0, firstCardText)
    check(
      '卡片展示日期（含星期）',
      /\d{4}-\d{2}-\d{2}\s+周[一二三四五六日]/.test(firstCardText),
      firstCardText,
    )

    // ---------- 6. 已完成 / 已取消页签 ----------
    await tapTab(mp, 1)
    data = await waitForPageData(
      mp,
      MY_BOOKINGS,
      (d) => d.activeStatus === 'COMPLETED' && d.pageState === 'success',
    )
    check(
      '已完成页签含 2 条（已过时的 PENDING 被派生为已完成）',
      !!data && data.list.length === 2,
      `list=${data ? data.list.length : 'n/a'}`,
    )
    check(
      '已完成按时间降序（越近的越靠前）',
      !!data && data.list.length === 2 && data.list[0].id === 3 && data.list[1].id === 4,
      data ? JSON.stringify(data.list.map((b) => b.id)) : 'n/a',
    )

    page = await mp.currentPage()
    const completedCardText = (await xpathText(page, BOOKING_CARD_ROOT(1))) || ''
    check(
      '已过时的预约在卡片上显示「已完成」',
      completedCardText.indexOf('已完成') >= 0,
      completedCardText,
    )

    await tapTab(mp, 2)
    data = await waitForPageData(
      mp,
      MY_BOOKINGS,
      (d) => d.activeStatus === 'CANCELLED' && d.pageState === 'success',
    )
    check('已取消页签含 1 条', !!data && data.list.length === 1, `list=${data ? data.list.length : 'n/a'}`)
    check(
      '已取消页签的那条状态为 CANCELLED',
      !!data && !!data.list[0] && data.list[0].status === 'CANCELLED',
      data && data.list[0] ? String(data.list[0].status) : 'n/a',
    )

    // ---------- 7. 页签切换不重新请求 ----------
    await setMyBookingsMode(mp, 'error')
    await tapTab(mp, 0)
    data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.activeStatus === 'PENDING')
    check(
      '数据源已打成失败时切页签仍能正常显示（证明未重新请求）',
      !!data && data.pageState === 'success' && data.list.length === 2,
      `pageState=${data ? data.pageState : 'n/a'} list=${data ? data.list.length : 'n/a'}`,
    )
    await clearMyBookingsMode(mp)

    // ---------- 8. 预约详情 ----------
    page = await mp.currentPage()
    const firstCard = await xpathEl(page, BOOKING_CARD_ROOT(1))
    if (firstCard) await firstCard.tap()
    p = await waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
    check('点击预约卡片进入预约详情', p === BOOKING_DETAIL, String(p))

    const bd = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.pageState === 'success')
    check('预约详情加载成功', !!bd && bd.pageState === 'success', String(bd && bd.pageState))
    if (bd) {
      check('详情展示资源名称', bd.resourceName === '第一教学楼 A101', String(bd.resourceName))
      check('详情展示地点', bd.location === '东区一教', String(bd.location))
      check('详情展示时间段', bd.timeLabel === '09:00-10:00', String(bd.timeLabel))
      check('详情展示日期（含星期）', bd.dateLabel.indexOf(tomorrow) === 0, String(bd.dateLabel))
      check('详情状态为「待使用」', bd.statusLabel === '待使用', String(bd.statusLabel))
      check('详情展示预约编号', bd.bookingId === 1, String(bd.bookingId))
      check(
        '详情展示下单时间（YYYY-MM-DD HH:mm:ss）',
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(bd.createdAt),
        String(bd.createdAt),
      )
    } else {
      check('详情展示资源名称', false, '详情未加载')
      check('详情展示地点', false, '详情未加载')
      check('详情展示时间段', false, '详情未加载')
      check('详情展示日期（含星期）', false, '详情未加载')
      check('详情状态为「待使用」', false, '详情未加载')
      check('详情展示预约编号', false, '详情未加载')
      check('详情展示下单时间（YYYY-MM-DD HH:mm:ss）', false, '详情未加载')
    }

    // ---------- 9. 预约详情的两类兜底 ----------
    await goBackTo(mp, MY_BOOKINGS)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/booking-detail/booking-detail?id=99999' }))
    p = await waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
    check('打开不存在的预约 ID 可进入详情页', p === BOOKING_DETAIL, String(p))
    let bd2 = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.pageState === 'empty')
    check(
      '查不到的预约落到空态（而不是错误态）',
      !!bd2 && bd2.pageState === 'empty',
      String(bd2 && bd2.pageState),
    )
    page = await mp.currentPage()
    const notFoundText = await xpathText(page, '//text[@class="empty-state__text"]')
    check('空态文案为「未找到该预约」', notFoundText === MSG.notFound, String(notFoundText))

    await goBackTo(mp, MY_BOOKINGS)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/booking-detail/booking-detail' }))
    p = await waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
    bd2 = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.hasValidId === false)
    check(
      '缺少 id 参数时 hasValidId 为 false',
      !!bd2 && bd2.hasValidId === false,
      String(bd2 && bd2.hasValidId),
    )
    page = await mp.currentPage()
    const errText = await xpathText(page, '//view[@class="error-state"]')
    check('缺少 id 参数时展示错误态（而非白屏）', errText !== null, String(errText))

    // ---------- 10. 列表请求失败与重试 ----------
    await goBackTo(mp, MY_BOOKINGS)
    await setMyBookingsMode(mp, 'error')
    await callMyBookingsRetry(mp)
    data = await waitMyBookingsState(mp, 'error')
    check('列表请求失败时落到错误态', !!data && data.pageState === 'error', String(data && data.pageState))
    check(
      '错误文案为网络异常',
      !!data && data.errorMessage === MSG.network,
      String(data && data.errorMessage),
    )

    page = await mp.currentPage()
    const retryBtn = await xpathEl(page, '//view[@class="error-state__action"]')
    check('错误态提供「重新加载」按钮', retryBtn !== null, retryBtn ? '' : '未找到按钮')

    await clearMyBookingsMode(mp)
    if (retryBtn) {
      await retryBtn.tap()
      data = await waitMyBookingsState(mp, 'success')
      check('点击重试后恢复正常展示', !!data && data.pageState === 'success', String(data && data.pageState))
    } else {
      check('点击重试后恢复正常展示', false, '未找到重试按钮')
    }

    // ---------- 11. 登录态失效：清掉本地状态并引导重新登录 ----------
    await resetFeedbackSpy(mp)
    await setMyBookingsMode(mp, 'unauthorized')
    await callMyBookingsOnShow(mp)
    data = await waitForPageData(mp, MY_BOOKINGS, (d) => d.loginState === 'LOGGED_OUT', 12000)
    check(
      '登录态失效后页面回到未登录展示',
      !!data && data.loginState === 'LOGGED_OUT',
      String(data && data.loginState),
    )

    auth = await readGlobalAuth(mp)
    check('登录态失效时清掉了本地登录态', auth.loginState === 'LOGGED_OUT', String(auth.loginState))

    const fb = await readFeedbackSpy(mp)
    check(
      '登录态失效给出了明确提示',
      countOf(fb.toasts, MSG.unauthorized) === 1,
      JSON.stringify(fb.toasts),
    )

    page = await mp.currentPage()
    guideText = await xpathText(page, '//text[@class="empty-state__text"]')
    check('登录态失效后重新展示登录引导', guideText === MSG.loginGuide, String(guideText))

    await clearMyBookingsMode(mp)
  } catch (e) {
    check(`执行过程异常：${e && e.message ? e.message : e}`, false)
    console.error(e)
  } finally {
    try {
      await clearAllModes(mp)
      await uninstallFeedbackSpy(mp)
    } catch (e) {
      /* ignore */
    }
    const total = results.length
    console.log('')
    console.log(`Phase 7 端到端测试：${total - failed}/${total} 通过`)
    if (failed > 0) {
      console.log('失败项：')
      results
        .filter((r) => !r.ok)
        .forEach((r) => console.log(`  - ${r.name}${r.detail ? ` [${r.detail}]` : ''}`))
    }
    process.exit(failed > 0 ? 1 : 0)
  }
})()
