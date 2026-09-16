/**
 * CampusReserve Phase 9 端到端测试（体验优化）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase9.js ws://127.0.0.1:9420
 *
 * 覆盖三类本阶段的改动：
 *   A. 统一反馈出口 utils/feedback.ts —— toast 的形态与停留时长统一、
 *      二次确认的完整参数（标题 / 正文 / 按钮文案 / 危险色）、
 *      确认框弹不出来时按「未确认」处理（安全方向）、
 *      `页面跳转失败` 文案收敛到一处。
 *   B. 最近筛选条件缓存 store/preference.ts —— 切换即记录、不带参数进入时回退到上次、
 *      **URL 参数优先于缓存**、非法缓存值归一化、重复点击当前分类不重复写。
 *   C. 下拉刷新 —— 我的预约页（本阶段新增）、资源列表页的动画收起与筛选保持。
 *
 * 复用 e2e-phase4/5/6/7/8.js 的实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 进不了自定义组件内部；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中返回占位对象而非 null，判存在要同时校验 tagName 与尺寸，见 xpathEl()。
 *   3. 不要用 mp.reLaunch()；多级返回用 mp.evaluate(() => wx.navigateBack({ delta }))。
 *   4. 导航之间必须等过渡收尾（约 1.4s），见 waitForRouteSettled()。
 *   5. 点击交互后要轮询到「目标字段已变为期望值」，不能只读一次。
 *   6. toast / modal 由客户端渲染读不到，用常驻探针捕获。
 *   7. 登录态的真源是 store 的内存态，写 storage 不生效，必须走真实登录流程。
 *
 * 本阶段新增的四条注意点：
 *   1. **确认框的 Promise 化改变了「连点两次」的语义**。`await confirm(...)` 期间
 *      页面上的 `canceling` 尚未置位，因此页面另设了 `confirming` 拦截重复弹框。
 *      本文件的「弹窗确实只弹一次」断言就是冲着这条来的（Phase 8 也有一条，别删）。
 *   2. **「同一路由再入栈」要等栈深度 +1 才算新实例**。目标路由与当前相同时，
 *      `waitForRouteSettled` 会立刻命中旧实例，必须先比对栈深度（Phase 3 踩过）。
 *   3. **缓存断言要直接读 storage 键**，不能只看页面上的 `category`——
 *      页面上正确不代表写进去了，而写进去才是缓存的意义。
 *   4. **探针要能模拟「弹窗失败」**（`mode: 'fail'`）。`wx.showModal` 的 fail 分支
 *      在模拟器里正常路径下永远走不到，但不处理它就意味着「确认框没弹出来还是会执行」，
 *      对不可逆操作是危险的，必须专门验证。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/* ---------------- 与小程序端保持一致 ---------------- */

const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'
const MOCK_AUTH_MODE_KEY = 'CR_MOCK_AUTH_MODE'
const MOCK_BOOKING_MODE_KEY = 'CR_MOCK_BOOKING_MODE'
const MOCK_MY_BOOKINGS_MODE_KEY = 'CR_MOCK_MY_BOOKINGS_MODE'
const MOCK_CANCEL_MODE_KEY = 'CR_MOCK_CANCEL_MODE'
const MOCK_BOOKINGS_KEY = 'CR_MOCK_BOOKINGS'

/** 与 store/preference.ts 的 LAST_CATEGORY_STORAGE_KEY 保持一致 */
const LAST_CATEGORY_KEY = 'CR_LAST_CATEGORY'

/** 与 utils/feedback.ts 保持一致 */
const NAVIGATE_FAILED_TEXT = '页面跳转失败'
const TOAST_DURATION = 2000

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const LIST = 'pages/resource-list/resource-list'
const RESOURCE_DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'
const BOOKING_DETAIL = 'pages/booking-detail/booking-detail'

/** 详情页的取消预约按钮（Phase 8 同款选择器） */
const CANCEL_BUTTON = '//view[contains(@class,"action--danger")]'

/** 预约卡片组件根节点 */
const BOOKING_CARD_ROOT = (i) =>
  `(//view[contains(@class,"booking-card") and not(contains(@class,"booking-card__"))])[${i}]`

/** 与小程序端一致的提示文案（改这些等于改对用户的承诺，必须同步小程序） */
const MSG = {
  cancelTitle: '取消预约',
  cancelContent: '取消后该时间段将释放给其他同学，确定要取消吗？',
  cancelConfirm: '确定取消',
  cancelCancel: '再想想',
  cancelled: '已取消',
  logoutTitle: '退出登录',
  logoutContent: '退出后将无法预约场地，确定退出吗？',
  logoutConfirm: '退出',
  logoutDone: '已退出登录',
  needLoginTitle: '需要登录',
  needLoginContent: '登录后才能预约场地，是否现在去登录？',
  needLoginConfirm: '去登录',
  loginSuccess: '登录成功',
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

/** 相对今天偏移 offsetDays 天的日期，格式 YYYY-MM-DD */
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

/** 退回页面栈栈底，返回栈底路由（栈底即本次启动的入口页） */
async function bottomRoute(mp) {
  let info = await stackInfo(mp)
  let guard = 0
  while (info.len > 1 && guard < 8) {
    try {
      await mp.evaluate((d) => wx.navigateBack({ delta: d }), info.len - 1)
    } catch (e) {
      /* 工具层抛错时导航通常已生效，靠下面的轮询确认 */
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

/** 轮询读指定路径页面 data，直到命中 predicate；超时返回最后一次读到的数据 */
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

/* ---------------- 存储 ---------------- */

async function setStorageValue(mp, key, value) {
  await mp.evaluate((k, v) => wx.setStorageSync(k, v), key, value)
}

async function removeStorageValue(mp, key) {
  await mp.evaluate((k) => wx.removeStorageSync(k), key)
}

async function readStorageValue(mp, key) {
  return mp.evaluate((k) => {
    try {
      const v = wx.getStorageSync(k)
      return v === '' || v === undefined ? null : v
    } catch (e) {
      return null
    }
  }, key)
}

/** 清空全部开发期数据源模式键 */
async function clearAllModes(mp) {
  await removeStorageValue(mp, MOCK_MODE_KEY)
  await removeStorageValue(mp, MOCK_AVAIL_MODE_KEY)
  await removeStorageValue(mp, MOCK_AUTH_MODE_KEY)
  await removeStorageValue(mp, MOCK_BOOKING_MODE_KEY)
  await removeStorageValue(mp, MOCK_MY_BOOKINGS_MODE_KEY)
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

/** 直接写开发期预约表（结构必须与 mock-booking-store.ts 的 `{ seq, list }` 一致） */
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

/* ---------------- 筛选条件缓存 ---------------- */

/**
 * 读「最近筛选条件」缓存。
 *
 * 必须用 `getStorageInfoSync().keys` 先判断**键是否存在**，不能只看取值：
 * 「全部」这个筛选条件本身就是空串，而 `wx.getStorageSync` 对「键不存在」也返回空串，
 * 只看取值会把「确实存了『全部』」误判成「没存过」。
 * 于是本函数的返回值有三种含义：`null` = 没存过，`''` = 存的是「全部」，其余为具体分类。
 */
async function readLastCategory(mp) {
  return mp.evaluate((k) => {
    try {
      const info = wx.getStorageInfoSync()
      if (!info || !info.keys || info.keys.indexOf(k) < 0) return null
      const v = wx.getStorageSync(k)
      return typeof v === 'string' ? v : String(v)
    } catch (e) {
      return null
    }
  }, LAST_CATEGORY_KEY)
}

async function clearLastCategory(mp) {
  await removeStorageValue(mp, LAST_CATEGORY_KEY)
}

/* ---------------- 反馈探针（本阶段扩展：记录 modal 完整参数与 toast 形态） ---------------- */

/**
 * 安装常驻探针。同时接管 `wx.stopPullDownRefresh` 以统计下拉刷新是否收起动画。
 *
 * @param mode 'confirm' 自动点确认 | 'cancel' 自动点取消 | 'none' 不回调 |
 *             'fail' 走 fail 分支（模拟弹窗弹不出来）
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
      try {
        wx.stopPullDownRefresh = previous.originalStopPullDown
      } catch (e) {
        /* ignore */
      }
    }
    const spy = {
      toasts: [],
      modals: [],
      stopPullDownCalls: 0,
      mode: m,
      originalToast: wx.showToast,
      originalModal: wx.showModal,
      originalStopPullDown: wx.stopPullDownRefresh,
    }
    app.__e2eSpy = spy
    wx.showToast = function (options) {
      spy.toasts.push({
        title: (options && options.title) || '',
        icon: (options && options.icon) || '',
        duration: options && typeof options.duration === 'number' ? options.duration : null,
      })
    }
    wx.showModal = function (options) {
      spy.modals.push({
        title: (options && options.title) || '',
        content: (options && options.content) || '',
        confirmText: (options && options.confirmText) || '',
        cancelText: (options && options.cancelText) || '',
        confirmColor: (options && options.confirmColor) || '',
      })
      if (spy.mode === 'none') return
      if (spy.mode === 'fail') {
        if (options && typeof options.fail === 'function') options.fail({ errMsg: 'showModal:fail' })
        return
      }
      if (options && typeof options.success === 'function') {
        options.success(
          spy.mode === 'confirm' ? { confirm: true, cancel: false } : { confirm: false, cancel: true },
        )
      }
    }
    wx.stopPullDownRefresh = function (options) {
      spy.stopPullDownCalls += 1
      return spy.originalStopPullDown(options)
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
    return spy
      ? { toasts: spy.toasts.slice(), modals: spy.modals.slice(), stopPullDownCalls: spy.stopPullDownCalls }
      : { toasts: [], modals: [], stopPullDownCalls: 0 }
  })
}

async function resetFeedbackSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    if (app.__e2eSpy) {
      app.__e2eSpy.toasts = []
      app.__e2eSpy.modals = []
      app.__e2eSpy.stopPullDownCalls = 0
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
      try {
        wx.stopPullDownRefresh = spy.originalStopPullDown
      } catch (e) {
        /* ignore */
      }
      app.__e2eSpy = null
    }
  })
}

function countOf(list, text) {
  return (list || []).filter((item) => (typeof item === 'string' ? item : item.title) === text).length
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

/**
 * 通过登录页退出登录（Phase 8 同款）。
 * 退出前有二次确认弹窗，而弹窗由客户端渲染、自动化点不到，所以临时替换 wx.showModal。
 * 注意：这里刻意**不用**常驻探针——本文件的探针常驻期间会自己决定确认结果，
 * 退出登录的用例需要显式控制，用临时替换更不易互相干扰。
 */
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

/* ---------------- 资源列表页辅助 ---------------- */

async function waitForListData(mp, predicate, timeoutMs = 12000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === LIST) {
      const data = await page.data()
      last = data
      if (predicate(data)) return data
    }
    await sleep(250)
  }
  return last
}

async function waitForListState(mp, expect, timeoutMs = 12000) {
  const data = await waitForListData(mp, (d) => d.pageState === expect, timeoutMs)
  return data ? data.pageState : null
}

async function filterItems(page) {
  const els = await page.$$('.filter__item')
  const out = []
  for (const el of els) {
    out.push({
      text: ((await el.text()) || '').trim(),
      cls: (await el.attribute('class')) || '',
    })
  }
  return out
}

/** 取当前激活的筛选项文案 */
async function activeFilterLabel(page) {
  const items = await filterItems(page)
  const hit = items.find((it) => it.cls.indexOf('filter__item--active') >= 0)
  return hit ? hit.text : null
}

/** 点击文案等于 label 的筛选项 */
async function tapFilter(mp, label) {
  const page = await mp.currentPage()
  const els = await page.$$('.filter__item')
  for (const el of els) {
    const t = ((await el.text()) || '').trim()
    if (t === label) {
      await el.tap()
      return true
    }
  }
  return false
}

/**
 * 点击筛选项并等待切换真正完成。
 * 判定必须同时满足「category 已变为目标值」与「pageState 为期望值」：
 * 只等 pageState 会命中点击前的旧值（Phase 3 因此误报过 4 项）。
 */
async function tapFilterAndWait(mp, label, expectCategory, expectState = 'success', timeoutMs = 12000) {
  const tapped = await tapFilter(mp, label)
  if (!tapped) return { tapped: false, data: null }
  const data = await waitForListData(
    mp,
    (d) => d.category === expectCategory && d.pageState === expectState,
    timeoutMs,
  )
  return { tapped: true, data }
}

/**
 * 从首页打开一个**全新实例**的资源列表页。
 *
 * 为什么要先从首页发起：目标路由与当前相同时，`wx.navigateTo` 依然会新建实例，
 * 但 `waitForRouteSettled` 会因为路由名相同而立刻返回旧实例的数据，
 * 必须先等栈深度 +1（Phase 3 踩过）。从首页发起可以顺带验证「真实用户路径」。
 *
 * @param category 传 undefined 表示不带参数（走缓存），传字符串则带上参数（参数优先）
 */
async function openListFromHome(mp, category) {
  await goBackTo(mp, HOME)
  const before = await stackInfo(mp)
  const url = category === undefined ? `/${LIST}` : `/${LIST}?category=${encodeURIComponent(category)}`
  await mp.evaluate((u) => wx.navigateTo({ url: u }), url)
  const t0 = Date.now()
  let now = await stackInfo(mp)
  while (now.len <= before.len && Date.now() - t0 < 12000) {
    await sleep(300)
    now = await stackInfo(mp)
  }
  await sleep(TRANSITION_SETTLE_MS)
  return now.len === before.len + 1
}

/* ---------------- 我的预约页辅助 ---------------- */

async function openMyBookings(mp) {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/my-bookings/my-bookings' }))
  return waitForRouteSettled(mp, MY_BOOKINGS)
}

async function waitMyBookingsData(mp, predicate, timeoutMs = 12000) {
  return waitForPageData(mp, MY_BOOKINGS, predicate, timeoutMs)
}

async function tapTab(mp, index) {
  const page = await mp.currentPage()
  const tabs = await page.$$('.tabs__item')
  if (!tabs[index]) return false
  await tabs[index].tap()
  await sleep(500)
  return true
}

/** 触发页面的下拉刷新回调，返回回调是否返回了 Promise（都不重要，只关心它没抛错） */
async function callPullDownRefresh(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (!current || typeof current.onPullDownRefresh !== 'function') {
      return { called: false }
    }
    current.onPullDownRefresh()
    return { called: true }
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

  const tomorrow = dateString(1)

  try {
    await sleep(1500)

    // ---------- 0. 准备 ----------
    const bottom = await bottomRoute(mp)
    check('本次启动的入口页为首页（页面栈栈底）', bottom === HOME, String(bottom))
    await clearAllModes(mp)
    await resetMockBookings(mp)
    await clearLastCategory(mp)
    await ensureLoggedOut(mp, HOME)
    await installFeedbackSpy(mp, 'none')
    check('准备：筛选缓存已清空', (await readLastCategory(mp)) === null)

    // ---------- 1. 筛选缓存：无缓存时默认「全部」并记录本次浏览 ----------
    check('从首页不带参数打开资源列表（新实例已入栈）', await openListFromHome(mp, undefined))
    let listData = await waitForListData(mp, (d) => d.pageState === 'success' && d.category === '')
    check(
      '无缓存时默认筛选为「全部」',
      !!listData && listData.category === '',
      listData ? JSON.stringify(listData.category) : 'null',
    )
    check(
      '无缓存时展示全部 8 条资源',
      !!listData && listData.resources.length === 8,
      listData ? `n=${listData.resources.length}` : 'null',
    )
    check(
      '进入列表即把本次分类记为「最近浏览」（空串）',
      (await readLastCategory(mp)) === '',
      JSON.stringify(await readLastCategory(mp)),
    )

    // ---------- 2. 筛选缓存：切换分类即写入 ----------
    let res = await tapFilterAndWait(mp, '球场', 'COURT')
    check('点击筛选项「球场」', res.tapped)
    listData = res.data
    check(
      '「球场」筛选生效',
      !!listData &&
        listData.resources.length > 0 &&
        listData.resources.every((r) => r.type === 'COURT'),
      listData ? `n=${listData.resources.length}` : 'null',
    )
    check(
      '切换分类后缓存被写成该分类',
      (await readLastCategory(mp)) === 'COURT',
      JSON.stringify(await readLastCategory(mp)),
    )

    // ---------- 3. 筛选缓存：不带参数再进 → 回到上次浏览的分类 ----------
    check('从首页不带参数再次打开资源列表', await openListFromHome(mp, undefined))
    listData = await waitForListData(
      mp,
      (d) => d.category === 'COURT' && d.pageState === 'success',
    )
    check(
      '不带参数进入时回退到上次浏览的「球场」',
      !!listData && listData.category === 'COURT',
      listData ? JSON.stringify(listData.category) : 'null',
    )
    check(
      '筛选栏激活项随之落在「球场」',
      (await activeFilterLabel(await mp.currentPage())) === '球场',
      String(await activeFilterLabel(await mp.currentPage())),
    )

    // ---------- 4. 筛选缓存：URL 参数优先于缓存（本阶段的核心规则） ----------
    check('从首页带 category=STUDY_ROOM 打开资源列表', await openListFromHome(mp, 'STUDY_ROOM'))
    listData = await waitForListData(
      mp,
      (d) => d.category === 'STUDY_ROOM' && d.pageState === 'success',
    )
    check(
      'URL 参数优先于缓存：显示「自习室」而不是缓存里的「球场」',
      !!listData && listData.category === 'STUDY_ROOM',
      listData ? JSON.stringify(listData.category) : 'null',
    )
    check(
      '带参数进入同样更新「最近浏览」',
      (await readLastCategory(mp)) === 'STUDY_ROOM',
      JSON.stringify(await readLastCategory(mp)),
    )

    // ---------- 5. 筛选缓存：重复点击当前分类不产生副作用 ----------
    // 故意把缓存改成别的值，再点当前已激活的「自习室」：
    // 页面在 onTapFilter 里提前 return 了，因此不应重写缓存
    await setStorageValue(mp, LAST_CATEGORY_KEY, 'COURT')
    check('重复点击当前筛选项「自习室」', await tapFilter(mp, '自习室'))
    await sleep(700)
    check(
      '重复点击当前分类不重写缓存（提前 return 的分支）',
      (await readLastCategory(mp)) === 'COURT',
      JSON.stringify(await readLastCategory(mp)),
    )

    // ---------- 6. 筛选缓存：非法值归一化 ----------
    await setStorageValue(mp, LAST_CATEGORY_KEY, 'NOT_A_TYPE')
    check('缓存被写入非法值后再打开列表', await openListFromHome(mp, undefined))
    listData = await waitForListData(mp, (d) => d.pageState === 'success' && d.category === '')
    check(
      '非法缓存值归一化为「全部」，不落到错误态',
      !!listData && listData.category === '' && listData.pageState === 'success',
      listData
        ? `category=${JSON.stringify(listData.category)} state=${listData.pageState}`
        : 'null',
    )
    check(
      '非法缓存值下仍展示全部资源',
      !!listData && listData.resources.length === 8,
      listData ? `n=${listData.resources.length}` : 'null',
    )

    // ---------- 7. 下拉刷新：资源列表页（筛选保持 + 动画收起） ----------
    await resetFeedbackSpy(mp)
    await setStorageValue(mp, MOCK_MODE_KEY, 'empty')
    await callPullDownRefresh(mp)
    let state = await waitForListState(mp, 'empty')
    check('列表页下拉刷新重新拉取数据（数据源变空后落到 empty）', state === 'empty', String(state))
    let spy = await readFeedbackSpy(mp)
    check(
      '下拉刷新后收起刷新动画（调用了 stopPullDownRefresh）',
      spy.stopPullDownCalls >= 1,
      `calls=${spy.stopPullDownCalls}`,
    )
    await setStorageValue(mp, MOCK_MODE_KEY, 'success')
    await callPullDownRefresh(mp)
    listData = await waitForListData(
      mp,
      (d) => d.pageState === 'success' && d.resources.length === 8,
    )
    check(
      '刷新后筛选条件保持为「全部」',
      !!listData && listData.category === '',
      listData ? JSON.stringify(listData.category) : 'null',
    )

    // ---------- 8. 下拉刷新：我的预约页（已登录） ----------
    await clearAllModes(mp)
    await goBackTo(mp, HOME)
    const login1 = await loginViaPage(mp, HOME)
    check('登录成功并返回首页', login1.back === HOME, String(login1.back))

    await resetMockBookings(mp)
    await writeMockBookings(mp, [
      makeBooking(1, '篮球场', '体育馆一层', tomorrow, '09:00', '10:00', 'PENDING', 1),
    ])
    await openMyBookings(mp)
    let myData = await waitMyBookingsData(mp, (d) => d.pageState === 'success')
    check(
      '我的预约页拉到 1 条待使用',
      !!myData && myData.list.length === 1,
      `list=${myData ? myData.list.length : 'n/a'}`,
    )

    // 改数据源为 2 条：下拉刷新应真的重新请求，而不是空转
    await writeMockBookings(mp, [
      makeBooking(1, '篮球场', '体育馆一层', tomorrow, '09:00', '10:00', 'PENDING', 1),
      makeBooking(2, '研讨室', '图书馆三层', tomorrow, '10:00', '11:00', 'PENDING', 2),
    ])
    await resetFeedbackSpy(mp)
    await callPullDownRefresh(mp)
    myData = await waitMyBookingsData(
      mp,
      (d) => d.pageState === 'success' && d.list.length === 2,
    )
    check(
      '我的预约页下拉刷新重新拉取数据（新记录出现）',
      !!myData && myData.list.length === 2,
      `list=${myData ? myData.list.length : 'n/a'}`,
    )
    spy = await readFeedbackSpy(mp)
    check(
      '我的预约页下拉刷新后收起动画',
      spy.stopPullDownCalls >= 1,
      `calls=${spy.stopPullDownCalls}`,
    )

    // ---------- 9. 下拉刷新不重置页签 ----------
    check('切换到「已取消」页签', await tapTab(mp, 2))
    myData = await waitMyBookingsData(
      mp,
      (d) => d.activeStatus === 'CANCELLED' && d.pageState === 'empty',
    )
    check(
      '「已取消」页签初始为空态',
      !!myData && myData.activeStatus === 'CANCELLED' && myData.pageState === 'empty',
      myData ? `status=${myData.activeStatus} state=${myData.pageState}` : 'null',
    )

    // 写入一条已取消的预约后再刷新：既证明刷新真的生效，又能验证页签没被重置
    await writeMockBookings(mp, [
      makeBooking(1, '篮球场', '体育馆一层', tomorrow, '09:00', '10:00', 'PENDING', 1),
      makeBooking(2, '研讨室', '图书馆三层', tomorrow, '10:00', '11:00', 'CANCELLED', 2),
    ])
    await callPullDownRefresh(mp)
    myData = await waitMyBookingsData(
      mp,
      (d) => d.pageState === 'success' && d.list.length === 1,
    )
    check(
      '下拉刷新重新拉取（新写入的已取消预约出现）',
      !!myData && myData.list.length === 1,
      myData ? `list=${myData.list.length}` : 'null',
    )
    check(
      '下拉刷新保留当前页签「已取消」，不跳回待使用',
      !!myData && myData.activeStatus === 'CANCELLED',
      myData ? String(myData.activeStatus) : 'null',
    )

    // ---------- 10. 下拉刷新：未登录 ----------
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
    await openMyBookings(mp)
    let guest = await waitMyBookingsData(mp, (d) => d.loginState === 'LOGGED_OUT')
    check(
      '未登录时展示登录引导',
      !!guest && guest.loginState === 'LOGGED_OUT',
      guest ? String(guest.loginState) : 'null',
    )
    check(
      '未登录时不发起请求（停在 loading 态而不是转圈）',
      !!guest && guest.pageState === 'loading',
      guest ? String(guest.pageState) : 'null',
    )
    await resetFeedbackSpy(mp)
    await callPullDownRefresh(mp)
    await sleep(1000)
    spy = await readFeedbackSpy(mp)
    check(
      '未登录时下拉刷新也收起动画（用户的动作必须有回应）',
      spy.stopPullDownCalls >= 1,
      `calls=${spy.stopPullDownCalls}`,
    )
    guest = await (await mp.currentPage()).data()
    check(
      '未登录下拉刷新后仍是登录引导',
      guest.loginState === 'LOGGED_OUT',
      String(guest.loginState),
    )

    // ---------- 11. 统一反馈：取消预约的确认框参数 ----------
    await goBackTo(mp, HOME)
    const login2 = await loginViaPage(mp, HOME)
    check('再次登录成功', login2.back === HOME, String(login2.back))
    await resetMockBookings(mp)
    await writeMockBookings(mp, [
      makeBooking(1, '篮球场', '体育馆一层', tomorrow, '15:00', '16:00', 'PENDING', 1),
    ])
    await openMyBookings(mp)
    await waitMyBookingsData(mp, (d) => d.pageState === 'success')
    const card = await xpathEl(await mp.currentPage(), BOOKING_CARD_ROOT(1))
    check('预约卡片可点击', card !== null)
    if (card) await card.tap()
    await waitForRouteSettled(mp, BOOKING_DETAIL)
    let detail = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.pageState === 'success')
    check(
      '进入预约详情页',
      !!detail && detail.pageState === 'success',
      detail ? detail.pageState : 'null',
    )

    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'cancel')
    let cancelBtn = await xpathEl(await mp.currentPage(), CANCEL_BUTTON)
    check('渲染出「取消预约」按钮', cancelBtn !== null)
    if (cancelBtn) await cancelBtn.tap()
    await sleep(800)
    spy = await readFeedbackSpy(mp)
    check('点「取消预约」弹出二次确认框', spy.modals.length === 1, `modals=${spy.modals.length}`)
    const cm = spy.modals[0] || {}
    check('确认框标题为「取消预约」', cm.title === MSG.cancelTitle, JSON.stringify(cm.title))
    check('确认框正文说明时段会被释放', cm.content === MSG.cancelContent, JSON.stringify(cm.content))
    check(
      '确认按钮文案为「确定取消」',
      cm.confirmText === MSG.cancelConfirm,
      JSON.stringify(cm.confirmText),
    )
    check('取消按钮文案为「再想想」', cm.cancelText === MSG.cancelCancel, JSON.stringify(cm.cancelText))
    check(
      '危险操作的确认按钮用红色',
      String(cm.confirmColor).toLowerCase() === '#f5222d',
      JSON.stringify(cm.confirmColor),
    )
    check('点「再想想」不产生任何 toast', spy.toasts.length === 0, JSON.stringify(spy.toasts))
    let store = await readMockBookings(mp)
    check(
      '点「再想想」后预约仍为 PENDING（没有发出取消请求）',
      store.length === 1 && store[0].status === 'PENDING',
      store.length ? String(store[0].status) : 'empty',
    )

    // ---------- 12. 统一反馈：确认框弹不出来时按「未确认」处理 ----------
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'fail')
    cancelBtn = await xpathEl(await mp.currentPage(), CANCEL_BUTTON)
    if (cancelBtn) await cancelBtn.tap()
    await sleep(900)
    spy = await readFeedbackSpy(mp)
    store = await readMockBookings(mp)
    check(
      '确认框弹出失败时不发起取消请求（安全方向）',
      store.length === 1 && store[0].status === 'PENDING',
      store.length ? String(store[0].status) : 'empty',
    )
    check(
      '确认框弹出失败时不给出任何成功提示',
      countOf(spy.toasts, MSG.cancelled) === 0,
      JSON.stringify(spy.toasts),
    )
    detail = await (await mp.currentPage()).data()
    check(
      '确认框弹出失败后页面状态不变',
      detail.statusLabel === '待使用',
      String(detail.statusLabel),
    )

    // ---------- 13. 统一反馈：退出登录的确认框（可逆操作不用危险色） ----------
    await goBackTo(mp, HOME)
    await ensureOnLoginPage(mp)
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'cancel')
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onLogout()
    })
    await sleep(800)
    spy = await readFeedbackSpy(mp)
    check('点「退出登录」弹出二次确认框', spy.modals.length === 1, `modals=${spy.modals.length}`)
    const lm = spy.modals[0] || {}
    check('确认框标题为「退出登录」', lm.title === MSG.logoutTitle, JSON.stringify(lm.title))
    check('确认框正文说明后果', lm.content === MSG.logoutContent, JSON.stringify(lm.content))
    check(
      '确认按钮文案为「退出」',
      lm.confirmText === MSG.logoutConfirm,
      JSON.stringify(lm.confirmText),
    )
    check(
      '可逆操作不用危险色（与取消预约区别对待）',
      String(lm.confirmColor) === '',
      JSON.stringify(lm.confirmColor),
    )
    check(
      '点「取消」后仍是已登录',
      (await readGlobalAuth(mp)).loginState === 'LOGGED_IN',
      (await readGlobalAuth(mp)).loginState,
    )

    // ---------- 14. 统一反馈：toast 的形态与停留时长 ----------
    // 先退出登录，再从登录页真实登录一次，观察成功类 toast 的形态
    await setSpyMode(mp, 'confirm')
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].onLogout()
    })
    await sleep(900)
    spy = await readFeedbackSpy(mp)
    const logoutToast = spy.toasts.find((t) => t.title === MSG.logoutDone)
    check('退出登录给出结果提示', !!logoutToast, JSON.stringify(spy.toasts))
    check(
      '中性结果提示用 none 形态（不带图标）',
      !!logoutToast && logoutToast.icon === 'none',
      logoutToast ? logoutToast.icon : 'n/a',
    )
    check(
      '中性结果提示的停留时长同样统一为 2000ms',
      !!logoutToast && logoutToast.duration === TOAST_DURATION,
      logoutToast ? String(logoutToast.duration) : 'n/a',
    )

    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'none')
    await tapLoginAndWatchLoading(mp)
    await sleep(500)
    spy = await readFeedbackSpy(mp)
    const okToast = spy.toasts.find((t) => t.title === MSG.loginSuccess)
    check('登录成功给出 toast', !!okToast, JSON.stringify(spy.toasts))
    check(
      '成功类 toast 用 success 形态',
      !!okToast && okToast.icon === 'success',
      okToast ? okToast.icon : 'n/a',
    )
    check(
      '成功类 toast 的停留时长统一为 2000ms',
      !!okToast && okToast.duration === TOAST_DURATION,
      okToast ? String(okToast.duration) : 'n/a',
    )
    await waitForRouteSettled(mp, HOME, 15000)

    // ---------- 15. 统一反馈：登录引导的确认框文案 ----------
    await ensureLoggedOut(mp, HOME)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/resource-detail/resource-detail?id=1' }))
    await waitForRouteSettled(mp, RESOURCE_DETAIL)
    await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.pageState === 'success')
    await resetFeedbackSpy(mp)
    await setSpyMode(mp, 'cancel')
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].promptLogin()
    })
    await sleep(800)
    spy = await readFeedbackSpy(mp)
    check('未登录时点预约弹出登录引导', spy.modals.length === 1, `modals=${spy.modals.length}`)
    const gm = spy.modals[0] || {}
    check('登录引导标题为「需要登录」', gm.title === MSG.needLoginTitle, JSON.stringify(gm.title))
    check('登录引导正文说明原因', gm.content === MSG.needLoginContent, JSON.stringify(gm.content))
    check(
      '登录引导确认按钮为「去登录」',
      gm.confirmText === MSG.needLoginConfirm,
      JSON.stringify(gm.confirmText),
    )
    check(
      '点「取消」不跳转登录页',
      (await currentPath(mp)) === RESOURCE_DETAIL,
      String(await currentPath(mp)),
    )

    // ---------- 16. 收尾 ----------
    await uninstallFeedbackSpy(mp)
    await clearAllModes(mp)
    await resetMockBookings(mp)
    await clearLastCategory(mp)
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
    check('测试结束回到首页', (await currentPath(mp)) === HOME, String(await currentPath(mp)))
    check(
      '收尾清掉筛选缓存，不给下一次测试留痕',
      (await readLastCategory(mp)) === null,
      JSON.stringify(await readLastCategory(mp)),
    )
  } catch (e) {
    check('测试执行过程无异常', false, e && e.message ? e.message : String(e))
    console.error(e)
  } finally {
    try {
      await mp.disconnect()
    } catch (e) {
      /* ignore */
    }
  }

  console.log(`\n合计 ${results.length} 项，失败 ${failed} 项`)
  console.log(failed === 0 ? 'E2E_TEST = PASS' : 'E2E_TEST = FAIL')
  process.exit(failed === 0 ? 0 : 1)
})()

