/**
 * CampusReserve Phase 6 端到端测试（创建预约）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase6.js ws://127.0.0.1:9420
 *
 * 覆盖：未登录时的登录门槛、预约成功（含提交中态、成功提示与跳转、预约记录落库）、
 *       提交后时段变为已约满、时间冲突（同一时段重复预约）、客户端对「已过时时段」的预校验、
 *       以及四类服务端失败（参数错误 / 非法时间 / 资源不存在 / 网络异常 / 登录态失效），
 *       最后验证「提交中重复点击不会产生第二次请求」。
 *
 * 与 e2e-phase3/4/5.js 同源的六条实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 只能查页面自身节点，无法进入自定义组件内部，
 *      连 <empty-state> 这类组件标签本身都查不到；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中时「不返回 null」，而是返回 tagName 为 undefined、
 *      尺寸 0x0 的占位对象。判定存在必须同时检查 tagName 与尺寸，见 xpathEl()。
 *   3. mp.reLaunch() 会让 automator 内部抛错，全程避免；改用页面自身的加载方法触发。
 *   4. 导航之间必须留出过渡收尾期（约 1.2 秒），否则模拟器会把路由过渡卡死约 10 秒，
 *      见 waitForRouteSettled()。多级返回用 wx.navigateBack({ delta })，见 goBackTo()。
 *   5. 点击交互后不能只等状态字段变回原值再断言（点击前本就处于原值，会读到上一步的数据）；
 *      必须轮询到「目标字段已变为期望值」。
 *   6. 改动小程序源码后要留出编译时间再跑测试，否则可能读到旧编译产物。
 *
 * 本阶段新增的四条注意点：
 *   1. **预约成功后的 toast 发生在 await 之后**，不能像 Phase 4/5 那样「调用后立刻还原
 *      wx.showToast」——那时提示还没弹出来，截获到的永远是 null。
 *      改成常驻探针：把 wx.showToast / wx.showModal 换成记录器并留在原地，
 *      整段用完再统一还原，见 installFeedbackSpy()。
 *   2. **提交中页面的 submitting 需要「调用后立刻读」**。onSubmit 是 async 方法，
 *      同步部分（含 setData({submitting:true})）在首个 await 之前就跑完了，
 *      因此在同一次 evaluate 里「调用 + 立刻读 data」可稳定捕获到提交中态，
 *      见 callSubmitAndReadState()。不要用固定 sleep 去赌那 600ms 窗口。
 *   3. **开发期预约表落在缓存键 CR_MOCK_BOOKINGS 上**（services/mock-booking-store.ts），
 *      因此测试既能直接读它来核对「预约记录是否真的写进去了」，
 *      也能在开跑前清空它，避免多次运行累积把明天的时段占满。
 *   4. 页面上的时段状态是**加载时的快照**：提交成功后必须重新拉取才会显示为已约满。
 *      断言这一点要轮询「那个时段变成了 BOOKED」，而不是等 slotState 变成 success
 *      ——返回详情页的瞬间 slotState 还是上一次的 success，会读到旧快照。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'
const MOCK_AUTH_MODE_KEY = 'CR_MOCK_AUTH_MODE'
const MOCK_BOOKING_MODE_KEY = 'CR_MOCK_BOOKING_MODE'

/** 与小程序端 services/mock-booking-store.ts 保持一致 */
const MOCK_BOOKINGS_KEY = 'CR_MOCK_BOOKINGS'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'

/** 被测资源：mock 数据源中的固定一条 */
const RESOURCE_ID = 1

/** 时段组件根节点：class 带修饰符，用 contains + not 精确定位，且排除子元素（子元素是 `time-slot__xxx`） */
const SLOT_ROOT = (i) =>
  `(//view[contains(@class,"time-slot") and not(contains(@class,"time-slot__"))])[${i}]`

/**
 * 与小程序端一致的提示文案。
 * 产品文案变动时这里要同步，否则会以「文案不符」的形式失败——这是刻意的：
 * 这些文案是需求 §4.5「失败：显示明确原因」的可见结果，不该被悄悄改掉。
 */
const MSG = {
  conflict: '该时间段已被预约，请选择其他时段',
  resourceMissing: '该资源不存在或已下架',
  paramError: '预约参数有误，请重新选择',
  invalidTimeServer: '该时间段不符合预约规则，请重新选择',
  invalidTimeClient: '该时间段已过时，请选择其他时段',
  network: '网络连接失败，请检查网络后重试',
  unauthorized: '登录状态已失效，请重新登录',
  submitSuccess: '预约成功',
  submitLoading: '提交中…',
  loginLoading: '登录中…',
  needLogin: '需要登录',
}

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 本机时区的今天，格式 YYYY-MM-DD（与小程序端 utils/date.ts 的 formatDate 语义一致） */
function todayString() {
  const d = new Date()
  const p = (n) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 取当前栈顶页面路由。
 * 直接读 appservice 的真实页面栈，而不是 mp.currentPage()（后者在刚切换页面时可能不同步）。
 */
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

/** 路由过渡的收尾静默期，理由见文件头第 4 条 */
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

/** 退回页面栈栈底（即本次启动的入口页） */
async function bottomRoute(mp) {
  let info = await stackInfo(mp)
  let guard = 0
  while (info.len > 1 && guard < 8) {
    try {
      await mp.evaluate((d) => wx.navigateBack({ delta: d }), info.len - 1)
    } catch (e) {
      /* 工具层抛错时导航通常已生效，靠轮询确认 */
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

/** 查询自定义组件内部节点；page.xpath() 未命中返回占位对象，故以 tagName + 尺寸双重判定 */
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

async function setBookingMode(mp, mode) {
  await setStorageValue(mp, MOCK_BOOKING_MODE_KEY, mode)
}
async function clearBookingMode(mp) {
  await removeStorageValue(mp, MOCK_BOOKING_MODE_KEY)
}
async function setMockMode(mp, mode) {
  await setStorageValue(mp, MOCK_MODE_KEY, mode)
}
async function clearMockMode(mp) {
  await removeStorageValue(mp, MOCK_MODE_KEY)
}
async function clearAvailMode(mp) {
  await removeStorageValue(mp, MOCK_AVAIL_MODE_KEY)
}
async function clearAuthMode(mp) {
  await removeStorageValue(mp, MOCK_AUTH_MODE_KEY)
}

/** 清空开发期预约表，让每次运行都从干净状态开始 */
async function resetMockBookings(mp) {
  await removeStorageValue(mp, MOCK_BOOKINGS_KEY)
}

/**
 * 直接读开发期预约表。
 * 它落在缓存里（services/mock-booking-store.ts），所以测试能核对「记录是否真的写进去了」，
 * 而不必只靠「再提交一次会冲突」间接推断。
 */
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

/** 清掉本次运行引入的全部开发期开关 */
async function clearAllModes(mp) {
  await clearMockMode(mp)
  await clearAvailMode(mp)
  await clearAuthMode(mp)
  await clearBookingMode(mp)
}

/* ---------------- 登录态读写 ---------------- */

/**
 * 读 App 的全局登录态。
 * app.globalData 是 store 内存态的镜像，是自动化侧最权威的读取点。
 */
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

/* ---------------- 登录流程 ---------------- */

async function openLogin(mp) {
  await mp.evaluate(() => wx.navigateTo({ url: '/pages/login/login' }))
  return waitForRouteSettled(mp, LOGIN, 15000)
}

/**
 * 确保当前正处于登录页。
 *
 * 已经站在登录页时**不能**再 navigateTo 一次：重复 push 会让页面栈变成
 * [来源页, 登录页, 登录页]，登录成功后的 navigateBack 只会退到第一个登录页，
 * 「返回来源页」的断言就永远等不到目标（Phase 5 实测踩到）。
 */
async function ensureOnLoginPage(mp) {
  const path = await currentPath(mp)
  if (path === LOGIN) {
    return LOGIN
  }
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

/**
 * 点击登录按钮并观察按钮文案，确认「登录中…」loading 态真的渲染出来了。
 */
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
    if (text !== null && seen.indexOf(text) < 0) {
      seen.push(text)
    }
    if (text === MSG.loginLoading) {
      sawLoading = true
    }
    if (text === null) break
    if (sawLoading && text === '微信一键登录') break
    await sleep(60)
  }

  return { tapped: true, sawLoading, seen }
}

/**
 * 通过真实登录流程建立登录态。
 *
 * 为什么不直接写缓存：store/auth.ts 的内存态才是真源，只写 storage 不会同步它，
 * 页面依然视为未登录。走一遍登录页与真实用户路径完全一致。
 */
async function loginViaPage(mp, backTo, timeoutMs = 20000) {
  await ensureOnLoginPage(mp)
  const watch = await tapLoginAndWatchLoading(mp)
  const back = await waitForRouteSettled(mp, backTo, timeoutMs)
  return { watch, back }
}

/**
 * 通过登录页退出登录。
 * 退出前有二次确认弹窗，而弹窗由客户端渲染、自动化点不到，所以临时替换 wx.showModal
 * 让它自动确认；替换后立即还原（若探针已装上，还原回来的就是探针版本）。
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

/** 确保处于未登录：上一次运行可能留下登录态 */
async function ensureLoggedOut(mp, backTo) {
  const auth = await readGlobalAuth(mp)
  if (auth.loginState === 'LOGGED_IN') {
    await logoutViaPage(mp, backTo)
  }
}

/* ---------------- 反馈探针（toast / modal） ---------------- */

/**
 * 装上常驻反馈探针。
 *
 * 为什么不能像 Phase 4/5 那样「调用后立刻还原」：预约成功的 toast 发生在
 * `await createBooking(...)` 之后（约 600ms），同步的 finally 早就还原完了，
 * 截获到的永远是 null。这里改成把探针留在原地，整段用完再统一还原。
 *
 * `autoConfirm` 控制 modal 是否自动点确认：预约流程的「需要登录」引导
 * 正是靠 showModal 的 success 回调跳转登录页，需要时把它置为 true。
 */
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

/** 统计探针记录里某条文案出现的次数 */
function countOf(list, text) {
  return (list || []).filter((item) => item === text).length
}

/* ---------------- 详情页辅助 ---------------- */

async function openDetail(mp, id) {
  await mp.evaluate(
    (rid) => wx.navigateTo({ url: `/pages/resource-detail/resource-detail?id=${rid}` }),
    id,
  )
  return waitForRouteSettled(mp, DETAIL)
}

/** 第一个可预约时段的下标（1 基，便于直接拼 XPath）；没有则返回 0 */
function firstAvailableIndex(slots) {
  const idx = (slots || []).findIndex((s) => s.status === 'AVAILABLE')
  return idx < 0 ? 0 : idx + 1
}

/**
 * 点击第 index 个日期并等待该日期的时间段加载完成。
 *
 * 判定必须同时满足「selectedDate 已变为目标值」与「slotState 为期望值」：
 * 只等 slotState 会命中点击前的旧值（见文件头第 5 条）。
 */
async function tapDateAndWait(mp, index, expectDate, expectState = 'success', timeoutMs = 12000) {
  const page = await mp.currentPage()
  const els = await page.$$('.date-bar__item')
  if (!els[index]) return { tapped: false, data: null }
  await els[index].tap()
  const data = await waitForPageData(
    mp,
    DETAIL,
    (d) => d.selectedDate === expectDate && d.slotState === expectState,
    timeoutMs,
  )
  return { tapped: true, data }
}

/**
 * 打开一个「干净」的详情页并选好一个可预约时段。
 *
 * 为什么要先回首页再进详情页：本文件里有几段用例会把详情页带到
 * empty 态（资源不存在）或让它自己刷新时段，继续在同一个页面实例上做下一段，
 * 状态会互相干扰。统一从首页重新进入，每段用例的起点才是确定的。
 *
 * 为什么要切到明天：mock 按技术设计 §11 把「当天已过时」的时段标为 DISABLED，
 * 傍晚之后运行测试时当天时段会全部过期，可预约时段数为 0。
 */
async function openFreshDetailWithSlot(mp, resourceId = RESOURCE_ID) {
  await goBackTo(mp, HOME)
  const path = await openDetail(mp, resourceId)
  if (path !== DETAIL) {
    return { ok: false, reason: `未能进入详情页（${path}）`, detail: null, slotIdx: 0 }
  }

  let detail = await waitForPageData(
    mp,
    DETAIL,
    (d) => d.pageState === 'success' && d.slotState === 'success',
  )
  if (!detail || detail.pageState !== 'success') {
    return { ok: false, reason: '详情页未加载成功', detail, slotIdx: 0 }
  }

  if (detail.dateOptions && detail.dateOptions.length > 1) {
    const tomorrow = detail.dateOptions[1].value
    if (detail.selectedDate !== tomorrow) {
      const res = await tapDateAndWait(mp, 1, tomorrow)
      detail = res.data || detail
    }
  }

  const slotIdx = firstAvailableIndex(detail ? detail.slots : [])
  if (slotIdx <= 0) {
    return { ok: false, reason: '该日期没有可预约时段', detail, slotIdx }
  }

  await tapSlotByXPathIndex(mp, slotIdx)
  detail = await waitForPageData(mp, DETAIL, (d) => !!d.selectedSlot)
  if (!detail || !detail.selectedSlot) {
    return { ok: false, reason: '未能选中时段', detail, slotIdx }
  }

  return { ok: true, reason: '', detail, slotIdx }
}

/** 取渲染层中第 n 个时段（n 从 1 开始）并点击（必须点组件根节点，见 README 第 14 条） */
async function tapSlotByXPathIndex(mp, n) {
  const page = await mp.currentPage()
  const el = await xpathEl(page, SLOT_ROOT(n))
  if (!el) return false
  await el.tap()
  await sleep(400)
  return true
}

/**
 * 触发详情页 onSubmit，并**在同一次 evaluate 内立刻读回按钮状态**。
 *
 * onSubmit 是 async 方法，同步部分（含 `setData({ submitting: true })`）在首个 await
 * 之前就执行完了，因此这里的读值能稳定命中「提交中」那一瞬间，
 * 不需要用固定 sleep 去赌 600ms 的窗口（见文件头新增注意点 2）。
 */
async function callSubmitAndReadState(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    let thrown = null
    try {
      current.onSubmit()
    } catch (e) {
      thrown = `ERROR:${e && e.message ? e.message : e}`
    }
    return {
      thrown,
      submitting: current.data.submitting,
      submitText: current.data.submitText,
      canSubmit: current.data.canSubmit,
      submitError: current.data.submitError,
    }
  })
}

/** 连续触发两次 onSubmit，验证第二次被 submitting 挡住（不会产生第二个请求） */
async function callSubmitTwiceAndReadState(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current.onSubmit()
    const afterFirst = {
      submitting: current.data.submitting,
      submitText: current.data.submitText,
      canSubmit: current.data.canSubmit,
    }
    current.onSubmit()
    const afterSecond = {
      submitting: current.data.submitting,
      submitText: current.data.submitText,
      canSubmit: current.data.canSubmit,
    }
    return { afterFirst, afterSecond }
  })
}

/** 直接把某个时段塞成「已选中」，用于绕过渲染层构造提交场景 */
async function forceSelectSlot(mp, slot) {
  await mp.evaluate((s) => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current.setData({ selectedSlot: s, submitError: '' })
    current.applySubmitState()
  }, slot)
  await sleep(200)
}

/** 等待详情页出现提交失败的页面内提示，返回此时的 data */
async function waitForSubmitError(mp, timeoutMs = 10000) {
  return waitForPageData(
    mp,
    DETAIL,
    (d) => typeof d.submitError === 'string' && d.submitError.length > 0,
    timeoutMs,
  )
}

/** 取某个时段在当前页面 data 中的状态 */
function slotStatus(detail, startTime) {
  const hit = ((detail && detail.slots) || []).find((s) => s.startTime === startTime)
  return hit ? hit.status : null
}

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

    // ---------- 1. 未登录：点预约被登录门槛拦住（异常：未登录） ----------
    await resetFeedbackSpy(mp)
    let prepared = await openFreshDetailWithSlot(mp)
    check('未登录时也能进入详情页并选中时段', prepared.ok, prepared.reason)

    if (prepared.ok) {
      const gate = await callSubmitAndReadState(mp)
      check('未登录时点预约不会进入提交中态', gate.submitting === false, String(gate.submitting))
      const feedback = await readFeedbackSpy(mp)
      check(
        '未登录时点预约弹出「需要登录」引导',
        countOf(feedback.modals, MSG.needLogin) === 1,
        JSON.stringify(feedback.modals),
      )
      const stillDetail = await currentPath(mp)
      check('未确认登录时停留在详情页', stillDetail === DETAIL, String(stillDetail))
      check('未登录时点预约未产生任何预约记录', (await readMockBookings(mp)).length === 0)
    } else {
      check('未登录时点预约弹出「需要登录」引导', false, prepared.reason)
      check('未登录时点预约未产生任何预约记录', false, prepared.reason)
    }

    // ---------- 2. 登录 ----------
    await goBackTo(mp, HOME)
    const login = await loginViaPage(mp, HOME)
    check('通过登录页完成登录并返回首页', login.back === HOME, String(login.back))
    auth = await readGlobalAuth(mp)
    check('已处于登录状态', auth.loginState === 'LOGGED_IN', String(auth.loginState))

    // ---------- 3. 预约成功（核心路径） ----------
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('已登录时可以选中一个可预约时段', prepared.ok, prepared.reason)

    let succeededSlot = null
    let resourceName = ''
    if (prepared.ok) {
      resourceName = prepared.detail.resource ? prepared.detail.resource.name : ''
      const slot = prepared.detail.selectedSlot
      succeededSlot = { startTime: slot.startTime, endTime: slot.endTime, status: 'AVAILABLE' }

      const bookingDate = prepared.detail.selectedDate
      check(
        '提交按钮文案为「预约 HH:mm-HH:mm」',
        prepared.detail.submitText === `预约 ${slot.startTime}-${slot.endTime}`,
        String(prepared.detail.submitText),
      )
      check('提交按钮可点击', prepared.detail.canSubmit === true, String(prepared.detail.canSubmit))

      const submit = await callSubmitAndReadState(mp)
      check(
        '点击提交后进入「提交中…」态',
        submit.submitting === true && submit.submitText === MSG.submitLoading,
        JSON.stringify(submit),
      )
      check('提交中按钮不可再点（防重复预约）', submit.canSubmit === false, String(submit.canSubmit))

      const redirected = await waitForRouteSettled(mp, MY_BOOKINGS, 15000)
      check('预约成功后跳转到我的预约页', redirected === MY_BOOKINGS, String(redirected))

      const feedback = await readFeedbackSpy(mp)
      check(
        '预约成功后给出成功提示',
        countOf(feedback.toasts, MSG.submitSuccess) === 1,
        JSON.stringify(feedback.toasts),
      )
      check(
        '预约成功后没有出现失败提示',
        countOf(feedback.toasts, MSG.conflict) === 0,
        JSON.stringify(feedback.toasts),
      )

      // 直接核对开发期预约表：记录确实写进去了，且字段完整
      const bookings = await readMockBookings(mp)
      check('预约记录已写入开发期预约表', bookings.length === 1, `共 ${bookings.length} 条`)
      const saved = bookings[0] || {}
      check(
        '预约记录的资源与时段与提交一致',
        saved.resourceId === RESOURCE_ID &&
          saved.date === bookingDate &&
          saved.startTime === succeededSlot.startTime &&
          saved.endTime === succeededSlot.endTime,
        JSON.stringify({
          resourceId: saved.resourceId,
          date: saved.date,
          startTime: saved.startTime,
          endTime: saved.endTime,
        }),
      )
      check('预约记录带资源名称与地点', saved.resourceName === resourceName && !!saved.location, `${saved.resourceName} / ${saved.location}`)
      check('新预约状态为 PENDING（待使用）', saved.status === 'PENDING', String(saved.status))
      check(
        '预约记录带创建时间（YYYY-MM-DD HH:mm:ss）',
        typeof saved.createdAt === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(saved.createdAt),
        String(saved.createdAt),
      )
    } else {
      check('点击提交后进入「提交中…」态', false, prepared.reason)
      check('预约成功后跳转到我的预约页', false, prepared.reason)
      check('预约记录已写入开发期预约表', false, prepared.reason)
    }

    // ---------- 4. 提交成功后返回详情页：该时段已变为已约满 ----------
    if (prepared.ok && succeededSlot) {
      const backPath = await goBackTo(mp, DETAIL)
      check('可以从我的预约页返回资源详情页', backPath === DETAIL, String(backPath))

      // 返回时页面会重新拉时段（pendingSlotRefresh）。注意不能只等 slotState 变成 success——
      // 到达瞬间它还是上一次的 success，会读到旧快照（见文件头新增注意点 4）。
      const refreshed = await waitForPageData(
        mp,
        DETAIL,
        (d) => d.slotState === 'success' && slotStatus(d, succeededSlot.startTime) === 'BOOKED',
        15000,
      )
      check(
        '返回详情页后该时段已显示为「已约满」',
        slotStatus(refreshed, succeededSlot.startTime) === 'BOOKED',
        String(slotStatus(refreshed, succeededSlot.startTime)),
      )
      check(
        '返回详情页后已选时段被清空',
        !!refreshed && refreshed.selectedSlot === null,
        refreshed ? JSON.stringify(refreshed.selectedSlot) : 'null',
      )
    } else {
      check('返回详情页后该时段已显示为「已约满」', false, '第 3 段未成功预约')
    }

    // ---------- 5. 时间冲突：同一时段重复预约被拒 ----------
    if (succeededSlot) {
      await resetFeedbackSpy(mp)
      // 绕过渲染层直接选中那个已经被约走的时段，模拟「提交时它已不可用」
      await forceSelectSlot(mp, succeededSlot)
      const submit = await callSubmitAndReadState(mp)
      check('重复提交同一时段会进入提交中态', submit.submitting === true, String(submit.submitting))

      const conflicted = await waitForSubmitError(mp, 10000)
      check(
        '重复预约同一时段被服务端拒绝并给出原因',
        !!conflicted && conflicted.submitError === MSG.conflict,
        conflicted ? String(conflicted.submitError) : 'null',
      )

      const feedback = await readFeedbackSpy(mp)
      check(
        '冲突时同时给出 toast 提示',
        countOf(feedback.toasts, MSG.conflict) === 1,
        JSON.stringify(feedback.toasts),
      )

      const page = await mp.currentPage()
      const errorText = await xpathText(page, '//view[@class="submit__error"]')
      check('冲突原因展示在页面上（不只靠会消失的 toast）', errorText === MSG.conflict, String(errorText))

      // 冲突后页面会重新拉取时段（否则那一格还显示为可预约，用户会反复点必然失败的按钮）。
      // 这一步是异步的：读到 submitError 时 slotState 恰好是 loading，必须轮询到刷新收尾，
      // 不能像前面那样直接读一次（首跑即因此误报 1 项）。
      const afterConflict = await waitForPageData(
        mp,
        DETAIL,
        (d) => d.slotState === 'success' && d.selectedSlot === null,
        12000,
      )
      check(
        '冲突后时段被重新拉取且已选时段被清空',
        !!afterConflict && afterConflict.slotState === 'success' && afterConflict.selectedSlot === null,
        afterConflict ? `${afterConflict.slotState}/${JSON.stringify(afterConflict.selectedSlot)}` : 'null',
      )
      check('冲突不会写入新的预约记录', (await readMockBookings(mp)).length === 1)
    } else {
      check('重复预约同一时段被服务端拒绝并给出原因', false, '第 3 段未成功预约')
    }

    // ---------- 6. 客户端预校验：已过时时段被本地拦住 ----------
    // 先把预约数据源打成网络失败：若请求真的发出去，页面上会变成网络错误文案。
    // 最终看到的仍是「已过时」，即可证明这次提交根本没发请求。
    await setBookingMode(mp, 'error')
    await resetFeedbackSpy(mp)
    await mp.evaluate((today) => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      current.setData({
        selectedDate: today,
        selectedSlot: { startTime: '00:00', endTime: '01:00', status: 'AVAILABLE' },
        submitError: '',
      })
      current.applySubmitState()
    }, todayString())
    await sleep(200)

    const stale = await callSubmitAndReadState(mp)
    check('已过时时段不会进入提交中态（客户端直接拦下）', stale.submitting === false, String(stale.submitting))
    check(
      '已过时时段提交时提示「该时间段已过时」',
      stale.submitError === MSG.invalidTimeClient,
      String(stale.submitError),
    )

    const staleFeedback = await readFeedbackSpy(mp)
    check(
      '已过时时段未发出请求（没有出现网络错误文案）',
      countOf(staleFeedback.toasts, MSG.network) === 0 &&
        countOf(staleFeedback.toasts, MSG.invalidTimeClient) === 1,
      JSON.stringify(staleFeedback.toasts),
    )
    await clearBookingMode(mp)

    // ---------- 7. 服务端失败：参数错误 ----------
    await setBookingMode(mp, 'param-error')
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('参数错误用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      await callSubmitAndReadState(mp)
      let failedData = await waitForSubmitError(mp)
      check(
        '服务端参数错误时提示「预约参数有误」',
        !!failedData && failedData.submitError === MSG.paramError,
        failedData ? String(failedData.submitError) : 'null',
      )
      check(
        '参数错误不会清掉已选时段（改完可直接重试）',
        !!failedData && !!failedData.selectedSlot && failedData.canSubmit === true,
        failedData ? `slot=${!!failedData.selectedSlot} canSubmit=${failedData.canSubmit}` : 'null',
      )
    } else {
      check('服务端参数错误时提示「预约参数有误」', false, prepared.reason)
    }

    // ---------- 8. 服务端失败：非法时间 ----------
    await setBookingMode(mp, 'invalid-time')
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('非法时间用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      await callSubmitAndReadState(mp)
      const failedData = await waitForSubmitError(mp)
      check(
        '服务端判定非法时间时给出对应原因',
        !!failedData && failedData.submitError === MSG.invalidTimeServer,
        failedData ? String(failedData.submitError) : 'null',
      )
    } else {
      check('服务端判定非法时间时给出对应原因', false, prepared.reason)
    }

    // ---------- 9. 服务端失败：资源不存在 ----------
    await setBookingMode(mp, 'resource-missing')
    await resetFeedbackSpy(mp)
    // 注意顺序：必须先把时段准备好，再来打空详情接口——
    // 否则详情页一进来就落到空态，根本没有可选时段可用于提交。
    prepared = await openFreshDetailWithSlot(mp)
    check('资源不存在用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      // 让详情接口也查无此资源，构造「提交时才发现资源已下架」的真实场景：
      // 服务端拒绝（404001）后页面重新加载详情，这次确实查不到，于是落到空态。
      await setMockMode(mp, 'empty')
      await callSubmitAndReadState(mp)
      const emptyData = await waitForPageData(mp, DETAIL, (d) => d.pageState === 'empty', 12000)
      check(
        '提交时资源不存在会让页面落到空态',
        !!emptyData && emptyData.pageState === 'empty',
        emptyData ? String(emptyData.pageState) : 'null',
      )
      const page = await mp.currentPage()
      const emptyText = await xpathText(page, '//text[@class="empty-state__text"]')
      check('空态提示为「资源不存在」', emptyText === '资源不存在', String(emptyText))
      check(
        '资源不存在的失败原因同样是明确的',
        !!emptyData && emptyData.submitError === MSG.resourceMissing,
        emptyData ? String(emptyData.submitError) : 'null',
      )
    } else {
      check('提交时资源不存在会让页面落到空态', false, prepared.reason)
    }
    await clearMockMode(mp)
    await clearBookingMode(mp)

    // ---------- 10. 服务端失败：网络异常 ----------
    await setBookingMode(mp, 'error')
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('网络异常用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      await callSubmitAndReadState(mp)
      const failedData = await waitForSubmitError(mp)
      check(
        '网络异常时提示「网络连接失败」',
        !!failedData && failedData.submitError === MSG.network,
        failedData ? String(failedData.submitError) : 'null',
      )
      check(
        '网络异常时停留在详情页且保留已选时段（可原样重试）',
        !!failedData && !!failedData.selectedSlot && failedData.canSubmit === true,
        failedData ? `slot=${!!failedData.selectedSlot} canSubmit=${failedData.canSubmit}` : 'null',
      )
    } else {
      check('网络异常时提示「网络连接失败」', false, prepared.reason)
    }
    await clearBookingMode(mp)

    // ---------- 11. 服务端失败：登录态失效 ----------
    await setBookingMode(mp, 'unauthorized')
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('登录态失效用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      await callSubmitAndReadState(mp)
      const failedData = await waitForSubmitError(mp)
      check(
        '登录态失效时提示「登录状态已失效」',
        !!failedData && failedData.submitError === MSG.unauthorized,
        failedData ? String(failedData.submitError) : 'null',
      )

      const afterFail = await readGlobalAuth(mp)
      check(
        '登录态失效后本地登录态被清掉（避免反复碰壁）',
        afterFail.loginState === 'LOGGED_OUT',
        String(afterFail.loginState),
      )

      const feedback = await readFeedbackSpy(mp)
      check(
        '登录态失效时给出「需要登录」引导',
        countOf(feedback.modals, MSG.needLogin) === 1,
        JSON.stringify(feedback.modals),
      )
    } else {
      check('登录态失效时提示「登录状态已失效」', false, prepared.reason)
    }
    await clearBookingMode(mp)

    // 重新登录，供后续用例使用
    await goBackTo(mp, HOME)
    const relogin = await loginViaPage(mp, HOME)
    check('登录态失效后可以重新登录', relogin.back === HOME, String(relogin.back))

    // ---------- 12. 提交中重复点击不会产生第二次请求 ----------
    await resetFeedbackSpy(mp)
    prepared = await openFreshDetailWithSlot(mp)
    check('防重复提交用例：准备好可提交的时段', prepared.ok, prepared.reason)
    if (prepared.ok) {
      const twice = await callSubmitTwiceAndReadState(mp)
      check(
        '第一次点击后进入提交中态',
        twice.afterFirst.submitting === true && twice.afterFirst.submitText === MSG.submitLoading,
        JSON.stringify(twice.afterFirst),
      )
      check(
        '提交中再点一次仍是同一个提交，不会重置状态',
        twice.afterSecond.submitting === true &&
          twice.afterSecond.submitText === MSG.submitLoading &&
          twice.afterSecond.canSubmit === false,
        JSON.stringify(twice.afterSecond),
      )

      const redirected = await waitForRouteSettled(mp, MY_BOOKINGS, 15000)
      check('防重复提交用例同样完成跳转', redirected === MY_BOOKINGS, String(redirected))

      const feedback = await readFeedbackSpy(mp)
      check(
        '只产生一次成功（第二次点击没有发出请求）',
        countOf(feedback.toasts, MSG.submitSuccess) === 1,
        JSON.stringify(feedback.toasts),
      )
      check(
        '第二次点击没有触发冲突（否则说明请求确实发出去了）',
        countOf(feedback.toasts, MSG.conflict) === 0,
        JSON.stringify(feedback.toasts),
      )

      const bookings = await readMockBookings(mp)
      check('重复点击后预约表只多出一条记录', bookings.length === 2, `共 ${bookings.length} 条`)
    } else {
      check('第一次点击后进入提交中态', false, prepared.reason)
      check('只产生一次成功（第二次点击没有发出请求）', false, prepared.reason)
    }

    // ---------- 13. 清理 ----------
    await uninstallFeedbackSpy(mp)
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
    await clearAllModes(mp)
    await resetMockBookings(mp)

    const finalAuth = await readGlobalAuth(mp)
    check('清理后回到未登录状态', finalAuth.loginState === 'LOGGED_OUT', String(finalAuth.loginState))
    check('清理后开发期预约表为空', (await readMockBookings(mp)).length === 0)

    console.log('')
    console.log(`通过 ${results.length - failed}/${results.length}`)
    console.log(failed === 0 ? 'E2E_TEST = PASS' : 'E2E_TEST = FAIL')
    process.exit(failed === 0 ? 0 : 1)
  } catch (e) {
    console.error('测试中断：', e && e.stack ? e.stack : e)
    console.log('')
    console.log(`通过 ${results.length - failed}/${results.length}`)
    console.log('E2E_TEST = FAIL')
    process.exit(1)
  }
})()
