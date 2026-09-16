/**
 * CampusReserve Phase 8 端到端测试（取消预约）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase8.js ws://127.0.0.1:9420
 *
 * 覆盖：取消按钮的出现条件（只有有效预约可取消）、二次确认（确认 / 取消两种结果）、
 *       取消中的防重复、取消成功后状态更新与按钮消失、预约表落 `CANCELLED`、
 *       返回「我的预约」自动刷新、取消后时间段恢复可用、
 *       四类失败分流（网络 / 查不到 / 状态冲突 / 登录态失效）与失败后重试、
 *       服务端在绕开 UI 时同样拦得住「取消已完成 / 已取消的预约」。
 *
 * 复用 e2e-phase4/5/6/7.js 的实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 进不了自定义组件内部；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中返回占位对象而非 null，判存在要同时校验 tagName 与尺寸，见 xpathEl()。
 *   3. 不要用 mp.reLaunch()；多级返回用 mp.evaluate(() => wx.navigateBack({ delta }))。
 *   4. 导航之间必须等过渡收尾（约 1.4s），见 waitForRouteSettled()。
 *   5. 点击交互后要轮询到「目标字段已变为期望值」，不能只读一次。
 *   6. element.tap() 只派发给查到的那个节点，必须点组件根节点（这里就是按钮本身）。
 *   7. toast / modal 由客户端渲染读不到，用常驻探针 installFeedbackSpy() 捕获。
 *   8. 登录态的真源是 store 的内存态，写 storage 不生效，必须走真实登录流程。
 *   9. 构造数据直接写缓存键 CR_MOCK_BOOKINGS（与 mock-booking-store.ts 同结构 `{ seq, list }`）。
 *
 * 本阶段新增的三条注意点：
 *   1. **探针要能分别模拟「确定」与「再想想」**。取消是带二次确认的操作，
 *      「用户点取消后什么都不该发生」是必须验证的一条，只有自动确认的探针测不到。
 *      本文件的探针用 `mode` 控制：`confirm` / `cancel` / `none`（不回调，模拟弹窗挂着）。
 *   2. **「取消中…」是瞬时态**，必须在点击后立刻轮询读（请求有 600ms 模拟延迟，窗口够），
 *      不能等请求完成再断言。
 *   3. **「返回页面刷新」靠 onShow 自然发生**：本文件不手动调用任何刷新方法，
 *      直接 wx.navigateBack 回「我的预约」，断言列表已更新——这样才能证明
 *      真实用户的返回路径是通的，而不是只有手动触发才对。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'
const MOCK_AUTH_MODE_KEY = 'CR_MOCK_AUTH_MODE'
const MOCK_BOOKING_MODE_KEY = 'CR_MOCK_BOOKING_MODE'
const MOCK_MY_BOOKINGS_MODE_KEY = 'CR_MOCK_MY_BOOKINGS_MODE'
const MOCK_CANCEL_MODE_KEY = 'CR_MOCK_CANCEL_MODE'

/** 与小程序端 services/mock-booking-store.ts 保持一致 */
const MOCK_BOOKINGS_KEY = 'CR_MOCK_BOOKINGS'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'
const BOOKING_DETAIL = 'pages/booking-detail/booking-detail'

/** 被测资源：mock 数据源中的固定一条 */
const RESOURCE_ID = 1

/** 预约卡片组件根节点 */
const BOOKING_CARD_ROOT = (i) =>
  `(//view[contains(@class,"booking-card") and not(contains(@class,"booking-card__"))])[${i}]`

/** 详情页的取消预约按钮 */
const CANCEL_BUTTON = '//view[contains(@class,"action--danger")]'

/** 与小程序端一致的提示文案 */
const MSG = {
  network: '网络连接失败，请检查网络后重试',
  unauthorized: '登录状态已失效，请重新登录',
  cancelled: '已取消',
  ended: '该预约已结束，无需取消',
  alreadyCancelled: '该预约已取消，无需重复操作',
  conflictGeneric: '该预约已结束或已取消，无需重复操作',
  notFound: '未找到该预约，或它不属于当前用户',
  loginGuide: '登录后查看我的预约',
  emptyPending: '暂无待使用的预约',
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
  await removeStorageValue(mp, MOCK_CANCEL_MODE_KEY)
}

async function setCancelMode(mp, mode) {
  await setStorageValue(mp, MOCK_CANCEL_MODE_KEY, mode)
}

async function clearCancelMode(mp) {
  await removeStorageValue(mp, MOCK_CANCEL_MODE_KEY)
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
    if (text === '登录中…') sawLoading = true
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

/* ---------------- 反馈探针（本阶段扩展：可控的二次确认结果） ---------------- */

/**
 * @param mode 'confirm' 自动点「确定取消」| 'cancel' 自动点「再想想」| 'none' 不回调
 */
async function installFeedbackSpy(mp, mode) {
  return mp.evaluate((m) => {
    const app = getApp()
    const previous = app.__e2eSpy
    if (previous) {
      try {
        wx.showToast = previous.originalToast
      } catch (e) {
        /* ignore */
      }
      try {
        wx.showModal = previous.originalModal
      } catch (e) {
        /* ignore */
      }
    }
    const spy = {
      toasts: [],
      modals: [],
      mode: m,
      originalToast: wx.showToast,
      originalModal: wx.showModal,
    }
    app.__e2eSpy = spy
    wx.showToast = function (options) {
      spy.toasts.push((options && options.title) || '')
    }
    wx.showModal = function (options) {
      spy.modals.push({ title: (options && options.title) || '', content: (options && options.content) || '' })
      if (spy.mode !== 'none' && options && typeof options.success === 'function') {
        options.success(
          spy.mode === 'confirm' ? { confirm: true, cancel: false } : { confirm: false, cancel: true },
        )
      }
    }
    return true
  }, mode)
}

async function setSpyMode(mp, mode) {
  await mp.evaluate((m) => {
    const app = getApp()
    if (app.__e2eSpy) app.__e2eSpy.mode = m
  }, mode)
}

async function readFeedbackSpy(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    const spy = app.__e2eSpy
    return spy ? { toasts: spy.toasts.slice(), modals: spy.modals.slice() } : { toasts: [], modals: [] }
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

/* ---------------- 我的预约页 / 预约详情页辅助 ---------------- */

async function openMyBookings(mp) {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/my-bookings/my-bookings' }))
  return waitForRouteSettled(mp, MY_BOOKINGS)
}

async function waitMyBookingsState(mp, state, timeoutMs = 12000) {
  return waitForPageData(mp, MY_BOOKINGS, (d) => d.pageState === state, timeoutMs)
}

async function tapTab(mp, index) {
  const page = await mp.currentPage()
  const tabs = await page.$$('.tabs__item')
  if (!tabs[index]) return false
  await tabs[index].tap()
  await sleep(500)
  return true
}

/** 从「我的预约」点开第 index 张卡片进入预约详情 */
async function openBookingByCardIndex(mp, index) {
  const page = await mp.currentPage()
  const card = await xpathEl(page, BOOKING_CARD_ROOT(index))
  if (!card) return null
  await card.tap()
  return waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
}

async function waitBookingDetailState(mp, state, timeoutMs = 12000) {
  return waitForPageData(mp, BOOKING_DETAIL, (d) => d.pageState === state, timeoutMs)
}

/**
 * 直接调页面方法发起取消（用于验证「绕开 UI 也拦得住」与防重复）。
 * 注意：栈顶若不是预约详情页就跳过而不是抛错——否则一次前置失败会中断整轮测试。
 */
async function callCancel(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (!current || typeof current.onCancel !== 'function') {
      return { canceling: false, skipped: true }
    }
    current.onCancel()
    return { canceling: current.data.canceling }
  })
}

/**
 * 连点两次「取消预约」，读回页面此刻的防重复标记。
 *
 * 同时返回 `confirming` 与 `canceling`：Phase 9 把二次确认 Promise 化之后，
 * 「防重复」的职责落在两个阶段上 —— 先「等待确认」（`confirming`），再「请求中」（`canceling`）。
 * 连点时第二个调用会被**当时所在阶段**的标记拦住，但具体是哪一个随实现而变。
 * 因此这里两个都返回，由用例断言「进入了防重复状态」而不是「某个字段等于 true」，
 * 免得实现一调整就误报（断言具体字段会绑死实现细节）。
 */
async function callCancelTwice(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (!current || typeof current.onCancel !== 'function') {
      return { canceling: false, confirming: false, skipped: true }
    }
    current.onCancel()
    current.onCancel()
    return { canceling: !!current.data.canceling, confirming: !!current.data.confirming }
  })
}

/** 绕过 canCancel 直接发请求：验证服务端校验本身成立 */
async function callPerformCancel(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (!current || typeof current.performCancel !== 'function') {
      return { canceling: false, skipped: true }
    }
    current.performCancel()
    return { canceling: current.data.canceling }
  })
}

/** 点详情页的取消按钮，并立刻轮询「取消中…」瞬时态 */
async function tapCancelButton(mp) {
  const page = await mp.currentPage()
  const btn = await xpathEl(page, CANCEL_BUTTON)
  if (!btn) return { found: false, sawCanceling: false }
  await btn.tap()
  const data = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.canceling === true, 3000)
  return { found: true, sawCanceling: !!(data && data.canceling) }
}

/* ---------------- 资源详情页（用于验证时间段恢复可用） ---------------- */

async function openDetail(mp, id) {
  await mp.evaluate(
    (rid) => wx.navigateTo({ url: `/pages/resource-detail/resource-detail?id=${rid}` }),
    id,
  )
  return waitForRouteSettled(mp, DETAIL)
}

/** 打开资源详情并切到指定日期，返回页面 data */
async function openDetailAtDate(mp, resourceId, date) {
  await goBackTo(mp, HOME)
  const path = await openDetail(mp, resourceId)
  if (path !== DETAIL) return null
  await waitForPageData(mp, DETAIL, (d) => d.pageState === 'success' && d.slotState === 'success')
  await mp.evaluate((dt) => {
    const pages = getCurrentPages()
    pages[pages.length - 1].onTapDate({ currentTarget: { dataset: { value: dt } } })
  }, date)
  return waitForPageData(
    mp,
    DETAIL,
    (d) => d.selectedDate === date && d.slotState === 'success',
    12000,
  )
}

function slotStatus(detailData, startTime) {
  const slots = (detailData && detailData.slots) || []
  const hit = slots.find((s) => s.startTime === startTime)
  return hit ? hit.status : null
}

function firstAvailableStartTime(detailData) {
  const slots = (detailData && detailData.slots) || []
  const hit = slots.find((s) => s.status === 'AVAILABLE')
  return hit ? hit.startTime : null
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

  const tomorrow = dateString(1)
  const yesterday = dateString(-1)

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

    await installFeedbackSpy(mp, 'confirm')

    // ---------- 1. 登录后：待使用预约展示取消按钮 ----------
    const login = await loginViaPage(mp, HOME)
    check('通过登录页完成登录并返回首页', login.back === HOME, String(login.back))
    auth = await readGlobalAuth(mp)
    check('登录后全局登录态为 LOGGED_IN', auth.loginState === 'LOGGED_IN', String(auth.loginState))

    const pendingBooking = makeBooking(
      1,
      '篮球场',
      '体育馆一层',
      tomorrow,
      '09:00',
      '10:00',
      'PENDING',
      RESOURCE_ID,
    )
    await writeMockBookings(mp, [pendingBooking])

    await openMyBookings(mp)
    let list = await waitMyBookingsState(mp, 'success')
    check(
      '「我的预约」待使用页签展示刚写入的预约',
      !!list && list.list.length === 1,
      `list=${list && list.list.length}`,
    )

    let path = await openBookingByCardIndex(mp, 1)
    check('点击预约卡片进入预约详情页', path === BOOKING_DETAIL, String(path))

    let detail = await waitBookingDetailState(mp, 'success')
    check('预约详情加载成功', !!detail, detail ? '' : '未读到页面数据')
    check('详情展示资源名称', !!detail && detail.resourceName === '篮球场', detail && detail.resourceName)
    check('详情展示时间段', !!detail && detail.timeLabel === '09:00-10:00', detail && detail.timeLabel)
    check('详情展示派生状态为待使用', !!detail && detail.statusLabel === '待使用', detail && detail.statusLabel)
    check('待使用的预约允许取消（canCancel）', !!detail && detail.canCancel === true, String(detail && detail.canCancel))
    check('取消中标记初始为 false', !!detail && detail.canceling === false, String(detail && detail.canceling))

    let page = await mp.currentPage()
    let btnText = await xpathText(page, CANCEL_BUTTON)
    check('详情页渲染出「取消预约」按钮', btnText === '取消预约', String(btnText))

    // ---------- 2. 二次确认：点「再想想」什么都不该发生 ----------
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'cancel')
    await tapCancelButton(mp)
    await sleep(1200)

    let spy = await readFeedbackSpy(mp)
    check('点击取消弹出二次确认框', spy.modals.length === 1, `modals=${spy.modals.length}`)
    check(
      '确认框标题为「取消预约」',
      spy.modals.length > 0 && spy.modals[0].title === '取消预约',
      spy.modals.length > 0 ? spy.modals[0].title : '',
    )
    check(
      '确认框说明了取消的后果',
      spy.modals.length > 0 && spy.modals[0].content.indexOf('释放') >= 0,
      spy.modals.length > 0 ? spy.modals[0].content : '',
    )

    let afterCancelPrompt = await waitBookingDetailState(mp, 'success')
    check(
      '点「再想想」后预约状态不变',
      !!afterCancelPrompt && afterCancelPrompt.statusLabel === '待使用',
      afterCancelPrompt && afterCancelPrompt.statusLabel,
    )
    check(
      '点「再想想」后没有发起取消请求（无 toast）',
      spy.toasts.length === 0,
      `toasts=${JSON.stringify(spy.toasts)}`,
    )
    let store = await readMockBookings(mp)
    check(
      '点「再想想」后预约记录仍为 PENDING',
      store.length === 1 && store[0].status === 'PENDING',
      store.length ? store[0].status : 'no record',
    )

    // ---------- 3. 二次确认：点「确定取消」走完整流程 ----------
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'confirm')
    const tapped = await tapCancelButton(mp)
    check('点击取消后按钮进入「取消中…」态', tapped.found && tapped.sawCanceling, JSON.stringify(tapped))

    detail = await waitForPageData(
      mp,
      BOOKING_DETAIL,
      (d) => d.statusLabel === '已取消' && d.canceling === false,
      12000,
    )
    check('取消成功后状态标签变为「已取消」', !!detail && detail.statusLabel === '已取消', detail && detail.statusLabel)
    check('取消成功后不再允许取消（canCancel=false）', !!detail && detail.canCancel === false, String(detail && detail.canCancel))
    check('取消成功后取消中标记复位', !!detail && detail.canceling === false, String(detail && detail.canceling))

    page = await mp.currentPage()
    btnText = await xpathText(page, CANCEL_BUTTON)
    check('取消成功后取消按钮消失', btnText === null, String(btnText))

    spy = await readFeedbackSpy(mp)
    check('取消成功给出「已取消」提示', countOf(spy.toasts, MSG.cancelled) === 1, JSON.stringify(spy.toasts))

    path = await currentPath(mp)
    check('取消成功后仍停在预约详情页（不自动跳走）', path === BOOKING_DETAIL, String(path))

    store = await readMockBookings(mp)
    check(
      '预约记录状态落为 CANCELLED',
      store.length === 1 && store[0].status === 'CANCELLED',
      store.length ? store[0].status : 'no record',
    )
    check(
      '取消只改状态，其余字段保持不变',
      store.length === 1 &&
        store[0].id === 1 &&
        store[0].resourceName === '篮球场' &&
        store[0].date === tomorrow &&
        store[0].startTime === '09:00' &&
        store[0].endTime === '10:00' &&
        store[0].createdAt === pendingBooking.createdAt,
      store.length ? JSON.stringify(store[0]) : 'no record',
    )

    // ---------- 4. 返回「我的预约」自动刷新 ----------
    path = await goBackTo(mp, MY_BOOKINGS)
    check('返回「我的预约」页', path === MY_BOOKINGS, String(path))

    list = await waitMyBookingsState(mp, 'empty', 12000)
    check(
      '返回后待使用页签自动刷新为空',
      !!list && list.pageState === 'empty' && list.list.length === 0,
      `pageState=${list && list.pageState} list=${list && list.list.length}`,
    )

    await tapTab(mp, 2)
    list = await waitMyBookingsState(mp, 'success')
    check(
      '切到已取消页签后该预约出现在列表里',
      !!list && list.list.length === 1 && list.list[0].id === 1,
      `list=${list && list.list.length}`,
    )
    check(
      '已取消页签里该条状态为 CANCELLED',
      !!list && list.list.length === 1 && list.list[0].status === 'CANCELLED',
      list && list.list.length ? list.list[0].status : '',
    )

    // ---------- 5. 取消后时间段恢复可用 ----------
    await goBackTo(mp, HOME)
    let rd = await openDetailAtDate(mp, RESOURCE_ID, tomorrow)
    const freeSlot = firstAvailableStartTime(rd)
    const freeSlotEnd = ((rd.slots || []).find((s) => s.startTime === freeSlot) || {}).endTime
    check('取到一个可预约时段用于验证恢复可用', !!freeSlot && !!freeSlotEnd, `${freeSlot}-${freeSlotEnd}`)

    await resetMockBookings(mp)
    await writeMockBookings(
      mp,
      [
        makeBooking(
          2,
          '篮球场',
          '体育馆一层',
          tomorrow,
          freeSlot,
          freeSlotEnd,
          'PENDING',
          RESOURCE_ID,
        ),
      ],
    )

    await goBackTo(mp, HOME)
    rd = await openDetailAtDate(mp, RESOURCE_ID, tomorrow)
    check(
      '被预约的时段在资源详情页显示为 BOOKED',
      slotStatus(rd, freeSlot) === 'BOOKED',
      String(slotStatus(rd, freeSlot)),
    )

    await openMyBookings(mp)
    await waitMyBookingsState(mp, 'success')
    path = await openBookingByCardIndex(mp, 1)
    check('进入该预约的详情页准备取消', path === BOOKING_DETAIL, String(path))

    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'confirm')
    await waitBookingDetailState(mp, 'success')
    await tapCancelButton(mp)
    await waitForPageData(mp, BOOKING_DETAIL, (d) => d.statusLabel === '已取消', 12000)

    await goBackTo(mp, HOME)
    rd = await openDetailAtDate(mp, RESOURCE_ID, tomorrow)
    check(
      '取消后该时间段恢复为 AVAILABLE（需求 §4.7）',
      slotStatus(rd, freeSlot) === 'AVAILABLE',
      String(slotStatus(rd, freeSlot)),
    )

    // ---------- 6. 已完成 / 已取消的预约不显示取消按钮 ----------
    await goBackTo(mp, HOME)
    await resetMockBookings(mp)
    await writeMockBookings(
      mp,
      [makeBooking(3, '羽毛球馆', '体育馆二层', yesterday, '09:00', '10:00', 'PENDING', RESOURCE_ID)],
    )
    await openMyBookings(mp)
    await waitMyBookingsState(mp, 'empty', 12000)
    await tapTab(mp, 1)
    await waitMyBookingsState(mp, 'success')
    path = await openBookingByCardIndex(mp, 1)
    check('进入已结束预约的详情页', path === BOOKING_DETAIL, String(path))

    detail = await waitBookingDetailState(mp, 'success')
    check('已结束的预约派生状态为「已完成」', !!detail && detail.statusLabel === '已完成', detail && detail.statusLabel)
    check('已结束的预约不允许取消', !!detail && detail.canCancel === false, String(detail && detail.canCancel))

    page = await mp.currentPage()
    btnText = await xpathText(page, CANCEL_BUTTON)
    check('已结束的预约不渲染取消按钮', btnText === null, String(btnText))

    await resetFeedbackSpy(mp)
    await callPerformCancel(mp)
    await sleep(1500)
    spy = await readFeedbackSpy(mp)
    check(
      '绕开 UI 直接取消已结束的预约，服务端仍然拒绝',
      countOf(spy.toasts, MSG.ended) === 1,
      JSON.stringify(spy.toasts),
    )
    store = await readMockBookings(mp)
    check(
      '被拒绝后记录未被改动（仍为 PENDING）',
      store.length === 1 && store[0].status === 'PENDING',
      store.length ? store[0].status : 'no record',
    )

    await goBackTo(mp, MY_BOOKINGS)
    await resetMockBookings(mp)
    await writeMockBookings(
      mp,
      [
        makeBooking(4, '羽毛球馆', '体育馆二层', tomorrow, '14:00', '15:00', 'CANCELLED', RESOURCE_ID),
      ],
    )
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onShow()
    })
    await waitMyBookingsState(mp, 'empty', 12000)
    await tapTab(mp, 2)
    await waitMyBookingsState(mp, 'success')
    path = await openBookingByCardIndex(mp, 1)
    check('进入已取消预约的详情页', path === BOOKING_DETAIL, String(path))

    detail = await waitBookingDetailState(mp, 'success')
    check('已取消的预约不允许再次取消', !!detail && detail.canCancel === false, String(detail && detail.canCancel))

    page = await mp.currentPage()
    btnText = await xpathText(page, CANCEL_BUTTON)
    check('已取消的预约不渲染取消按钮', btnText === null, String(btnText))

    await resetFeedbackSpy(mp)
    await callPerformCancel(mp)
    await sleep(1500)
    spy = await readFeedbackSpy(mp)
    check(
      '绕开 UI 重复取消已取消的预约，服务端仍然拒绝',
      countOf(spy.toasts, MSG.alreadyCancelled) === 1,
      JSON.stringify(spy.toasts),
    )

    // ---------- 7. 取消失败：网络异常 → 保留按钮可原样重试 ----------
    await goBackTo(mp, MY_BOOKINGS)
    // 上一段结束时停在「已取消」页签，先切回「待使用」——页签过滤是本地行为，
    // 不切回来的话新写入的待使用预约会被过滤掉，卡片在渲染层根本不存在
    await tapTab(mp, 0)
    await resetMockBookings(mp)
    await writeMockBookings(
      mp,
      [makeBooking(5, '篮球场', '体育馆一层', tomorrow, '15:00', '16:00', 'PENDING', RESOURCE_ID)],
    )
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onShow()
    })
    await waitMyBookingsState(mp, 'success')
    path = await openBookingByCardIndex(mp, 1)
    check('进入待取消预约的详情页（失败分流用例）', path === BOOKING_DETAIL, String(path))

    await waitBookingDetailState(mp, 'success')
    await setCancelMode(mp, 'error')
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'confirm')
    await tapCancelButton(mp)
    detail = await waitForPageData(mp, BOOKING_DETAIL, (d) => !!d.cancelError, 12000)
    check(
      '取消失败时在页面上保留失败原因',
      !!detail && detail.cancelError === MSG.network,
      detail && detail.cancelError,
    )
    check('取消失败后取消中标记复位', !!detail && detail.canceling === false, String(detail && detail.canceling))
    check('取消失败后按钮仍可再次取消（canCancel=true）', !!detail && detail.canCancel === true, String(detail && detail.canCancel))

    page = await mp.currentPage()
    btnText = await xpathText(page, CANCEL_BUTTON)
    check('取消失败后取消按钮仍在', btnText === '取消预约', String(btnText))

    spy = await readFeedbackSpy(mp)
    check('取消失败时不给出成功提示', countOf(spy.toasts, MSG.cancelled) === 0, JSON.stringify(spy.toasts))
    store = await readMockBookings(mp)
    check(
      '取消失败后记录仍为 PENDING',
      store.length === 1 && store[0].status === 'PENDING',
      store.length ? store[0].status : 'no record',
    )

    await clearCancelMode(mp)
    await resetFeedbackSpy(mp)
    await tapCancelButton(mp)
    detail = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.statusLabel === '已取消', 12000)
    check('失败后原样重试可以取消成功', !!detail && detail.statusLabel === '已取消', detail && detail.statusLabel)
    check('重试成功后失败原因被清空', !!detail && detail.cancelError === '', JSON.stringify(detail && detail.cancelError))
    store = await readMockBookings(mp)
    check(
      '重试成功后记录落为 CANCELLED',
      store.length === 1 && store[0].status === 'CANCELLED',
      store.length ? store[0].status : 'no record',
    )

    // ---------- 8. 取消失败：其余三类分流 ----------
    await goBackTo(mp, MY_BOOKINGS)
    await tapTab(mp, 0)
    await resetMockBookings(mp)
    await writeMockBookings(
      mp,
      [makeBooking(6, '篮球场', '体育馆一层', tomorrow, '16:00', '17:00', 'PENDING', RESOURCE_ID)],
    )
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onShow()
    })
    await waitMyBookingsState(mp, 'success')
    await openBookingByCardIndex(mp, 1)
    await waitBookingDetailState(mp, 'success')

    await setCancelMode(mp, 'not-found')
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'confirm')
    await callCancel(mp)
    detail = await waitBookingDetailState(mp, 'empty', 12000)
    check('预约不存在时落到 empty 态（不给重试）', !!detail && detail.pageState === 'empty', detail && detail.pageState)
    spy = await readFeedbackSpy(mp)
    check(
      '预约不存在时给出对应提示',
      countOf(spy.toasts, MSG.notFound) === 1,
      JSON.stringify(spy.toasts),
    )

    // 重新进入详情页，验证状态冲突分支
    await goBackTo(mp, MY_BOOKINGS)
    await tapTab(mp, 0)
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onShow()
    })
    await waitMyBookingsState(mp, 'success')
    await openBookingByCardIndex(mp, 1)
    await waitBookingDetailState(mp, 'success')

    await setCancelMode(mp, 'conflict')
    await resetFeedbackSpy(mp)
    await callCancel(mp)
    await sleep(1800)
    spy = await readFeedbackSpy(mp)
    check(
      '状态冲突时给出「已结束或已取消」提示',
      countOf(spy.toasts, MSG.conflictGeneric) === 1,
      JSON.stringify(spy.toasts),
    )
    detail = await waitBookingDetailState(mp, 'success', 12000)
    check(
      '状态冲突后重新拉取详情、页面回到真实状态',
      !!detail && detail.pageState === 'success' && detail.statusLabel === '待使用',
      `${detail && detail.pageState}/${detail && detail.statusLabel}`,
    )

    await setCancelMode(mp, 'unauthorized')
    await resetFeedbackSpy(mp)
    await callCancel(mp)
    await sleep(1800)
    spy = await readFeedbackSpy(mp)
    check(
      '登录态失效时给出重新登录提示',
      countOf(spy.toasts, MSG.unauthorized) === 1,
      JSON.stringify(spy.toasts),
    )
    detail = await waitBookingDetailState(mp, 'success', 12000)
    check(
      '登录态失效时页面仍停留在详情（清理与引导交给我的预约页）',
      !!detail && detail.pageState === 'success',
      detail && detail.pageState,
    )
    await clearCancelMode(mp)

    // ---------- 9. 取消中的防重复 ----------
    await goBackTo(mp, MY_BOOKINGS)
    await tapTab(mp, 0)
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onShow()
    })
    await waitMyBookingsState(mp, 'success')
    await openBookingByCardIndex(mp, 1)
    await waitBookingDetailState(mp, 'success')

    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'confirm')
    const twice = await callCancelTwice(mp)
    // 断言「进入了防重复状态」而不是某个具体字段：Phase 9 之后连点被拦在「等待确认」阶段，
    // 此刻 `canceling` 尚未置位。真正的保护效果由下面三条（只弹一次框 / 只提示一次 / 只有一条记录）保证
    check(
      '连续两次触发取消时进入防重复状态',
      !!twice && (twice.confirming === true || twice.canceling === true),
      JSON.stringify(twice),
    )

    await waitForPageData(mp, BOOKING_DETAIL, (d) => d.statusLabel === '已取消', 12000)
    spy = await readFeedbackSpy(mp)
    check('重复点击只弹出一次确认框', spy.modals.length === 1, `modals=${spy.modals.length}`)
    check(
      '重复点击只产生一次成功提示',
      countOf(spy.toasts, MSG.cancelled) === 1,
      JSON.stringify(spy.toasts),
    )
    store = await readMockBookings(mp)
    check(
      '重复点击不会产生重复记录',
      store.length === 1 && store[0].status === 'CANCELLED',
      `len=${store.length}`,
    )

    // ---------- 10. 未登录与不存在的预约 ----------
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
    auth = await readGlobalAuth(mp)
    check('已退出登录', auth.loginState === 'LOGGED_OUT', String(auth.loginState))

    await mp.evaluate(() => wx.navigateTo({ url: '/pages/booking-detail/booking-detail?id=1' }))
    await waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
    detail = await waitBookingDetailState(mp, 'empty', 12000)
    check('未登录时预约详情落到 empty 态', !!detail && detail.pageState === 'empty', detail && detail.pageState)
    check('未登录时不允许取消', !!detail && detail.canCancel === false, String(detail && detail.canCancel))

    await goBackTo(mp, HOME)
    const login2 = await loginViaPage(mp, HOME)
    check('重新登录成功', login2.back === HOME, String(login2.back))

    await mp.evaluate(() => wx.navigateTo({ url: '/pages/booking-detail/booking-detail?id=999' }))
    await waitForRouteSettled(mp, BOOKING_DETAIL, 15000)
    detail = await waitBookingDetailState(mp, 'empty', 12000)
    check('预约 ID 不存在时落到 empty 态', !!detail && detail.pageState === 'empty', detail && detail.pageState)
    check('预约不存在时不渲染取消按钮', !!detail && detail.canCancel === false, String(detail && detail.canCancel))

    // ---------- 收尾 ----------
    await uninstallFeedbackSpy(mp)
    await clearAllModes(mp)
    await resetMockBookings(mp)
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
  } catch (e) {
    check(`脚本执行异常：${e.message}`, false)
    console.error(e)
  } finally {
    const total = results.length
    console.log(`\n合计 ${total} 项，失败 ${failed} 项`)
    if (results.length) {
      console.log(`E2E_TEST total=${total} failed=${failed}`)
    }
    try {
      await mp.disconnect()
    } catch (e) {
      /* ignore */
    }
    process.exit(failed > 0 ? 1 : 0)
  }
})()
