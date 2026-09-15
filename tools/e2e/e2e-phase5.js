/**
 * CampusReserve Phase 5 端到端测试（用户登录）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase5.js ws://127.0.0.1:9420
 *
 * 覆盖：未登录时首页用户区与我的预约页的登录引导、登录入口、微信一键登录流程（含 loading）、
 *       登录状态保存（缓存 + globalData）、用户信息展示、登录失败与重试、已登录 / 未登录
 *       两种预约前分支、退出登录，以及冷启动时的登录态恢复（含缓存不完整时的兜底）。
 *
 * 与 e2e-phase3.js / e2e-phase4.js 同源的六条实测结论（不遵守会误判）：
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
 * 本阶段新增的五条注意点：
 *   1. **store/auth.ts 里的内存态才是登录态的真源**，只往 storage 写缓存不会让它变化——
 *      因此「建立登录态」必须走真实的登录页流程，直接写缓存是无效的。
 *      只有验证「冷启动恢复」时才反过来：先写缓存，再触发一次 onLaunch。
 *   2. **toast 与 modal 都由客户端渲染**，自动化层拿不到，必须临时替换 wx.showToast /
 *      wx.showModal 才能断言「点击有没有反馈、反馈内容是什么」。
 *   3. 登录成功后页面会延迟约 600ms 才返回，等待返回必须用轮询而不是固定 sleep。
 *   4. **不要在已处于登录页时再次 navigateTo 登录页**，否则页面栈变成
 *      [来源页, 登录页, 登录页]，登录后的 navigateBack 只退到第一个登录页，
 *      「返回来源页」永远等不到。进登录页统一用 ensureOnLoginPage()。
 *   5. 详情页断言「存在可预约时段」前必须先切到明天：mock 按技术设计 §11 把当天已过时的
 *      时段标为 DISABLED，傍晚之后运行测试时当天时段会全部过期，见 switchToTomorrow()。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'
const MOCK_AUTH_MODE_KEY = 'CR_MOCK_AUTH_MODE'

/** 与小程序端 store/auth.ts 保持一致 */
const AUTH_TOKEN_KEY = 'CR_AUTH_TOKEN'
const AUTH_USER_KEY = 'CR_USER_INFO'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'

/** 被测资源：mock 数据源中的固定一条 */
const RESOURCE_ID = 1

/** 与小程序端 services/mock-auth.ts 保持一致 */
const MOCK_NICKNAME = '校园用户'
const MOCK_USER_ID = 1001

/** 时段组件根节点：class 带修饰符，用 contains + not 精确定位，且排除子元素（子元素是 `time-slot__xxx`） */
const SLOT_ROOT = (i) =>
  `(//view[contains(@class,"time-slot") and not(contains(@class,"time-slot__"))])[${i}]`

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function readPageData(mp, path) {
  const page = await mp.currentPage()
  if (!page || page.path !== path) return null
  return page.data()
}

/** 在 appservice 内调用当前页面方法（不用 callMethod：async 方法的 Promise 无法序列化） */
async function callPageMethod(mp, name) {
  return mp.evaluate((method) => {
    const pages = getCurrentPages()
    pages[pages.length - 1][method]()
  }, name)
}

/* ---------------- 开发期数据源注入 ---------------- */

async function setStorageValue(mp, key, value) {
  await mp.evaluate((k, v) => wx.setStorageSync(k, v), key, value)
}

async function removeStorageValue(mp, key) {
  await mp.evaluate((k) => wx.removeStorageSync(k), key)
}

async function setMockMode(mp, mode) {
  await setStorageValue(mp, MOCK_MODE_KEY, mode)
}
async function clearMockMode(mp) {
  await removeStorageValue(mp, MOCK_MODE_KEY)
}
async function setAvailMode(mp, mode) {
  await setStorageValue(mp, MOCK_AVAIL_MODE_KEY, mode)
}
async function clearAvailMode(mp) {
  await removeStorageValue(mp, MOCK_AVAIL_MODE_KEY)
}
async function setAuthMode(mp, mode) {
  await setStorageValue(mp, MOCK_AUTH_MODE_KEY, mode)
}
async function clearAuthMode(mp) {
  await removeStorageValue(mp, MOCK_AUTH_MODE_KEY)
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

/** 读缓存中的登录信息 */
async function readAuthStorage(mp) {
  return mp.evaluate((tk, uk) => {
    let token = null
    let user = null
    try {
      const t = wx.getStorageSync(tk)
      token = t === '' || t === undefined || t === null ? null : t
    } catch (e) {
      token = null
    }
    try {
      const u = wx.getStorageSync(uk)
      user = u === '' || u === undefined || u === null ? null : u
    } catch (e) {
      user = null
    }
    return { token, user }
  }, AUTH_TOKEN_KEY, AUTH_USER_KEY)
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
 * 「返回来源页」的断言就永远等不到目标（Phase 5 实测踩到，连带 1 项失败）。
 */
async function ensureOnLoginPage(mp) {
  const path = await currentPath(mp)
  if (path === LOGIN) {
    return LOGIN
  }
  return openLogin(mp)
}

/** 读登录页主按钮文案（未登录时是登录按钮，已登录时该按钮不存在） */
async function readLoginButtonText(mp) {
  const page = await mp.currentPage()
  if (!page || page.path !== LOGIN) return null
  const btn = await page.$('.cr-btn--primary')
  if (!btn) return null
  const text = await btn.text()
  return (text || '').trim()
}

/**
 * 点击登录按钮并观察按钮文案。
 *
 * 返回观察到的文案集合：只要中途出现过 `登录中…`，就说明 loading 态真的渲染出来了
 * （mock 数据源有 400ms 延迟，窗口足够；用轮询而不是固定 sleep 才不会漏掉）。
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
    if (text === '登录中…') {
      sawLoading = true
    }
    // 登录成功会离开登录页，按钮随之查不到（readLoginButtonText 返回 null）；
    // 失败时按钮文案退回初始值。两种情况都说明本次点击的流程已经走完。
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
 * 让它自动确认；替换后立即还原。
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

/* ---------------- 详情页辅助 ---------------- */

async function openDetail(mp, id) {
  await mp.evaluate((rid) => wx.navigateTo({ url: `/pages/resource-detail/resource-detail?id=${rid}` }), id)
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
 * 切到「明天」并返回切换后的详情页 data。
 *
 * 为什么必须切：mock 数据源按技术设计 §11 把「当天已过时」的时段标为 DISABLED，
 * 傍晚之后跑测试，当天的时段会全部过期，可预约时段数为 0。
 * 所以凡是要断言「存在可预约时段」的地方，都要先切到明天。
 */
async function switchToTomorrow(mp, detail) {
  if (!detail || !detail.dateOptions || detail.dateOptions.length < 2) return detail
  const tomorrow = detail.dateOptions[1].value
  const res = await tapDateAndWait(mp, 1, tomorrow)
  return res.data || detail
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
 * 调用详情页 onSubmit 并截获 toast / modal。
 *
 * toast 与 modal 都由客户端渲染，自动化层读不到，所以临时替换 wx.showToast 与 wx.showModal
 * 记录它们的标题，测完立即还原。`confirm` 为 true 时会模拟用户点了确认按钮
 * （onSubmit 里正是靠 showModal 的 success 回调跳转登录页）。
 */
async function callSubmitAndReadFeedback(mp, confirm) {
  return mp.evaluate((shouldConfirm) => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    let toast = null
    let modalTitle = null
    const originalToast = wx.showToast
    const originalModal = wx.showModal
    try {
      wx.showToast = function (options) {
        toast = (options && options.title) || ''
      }
      wx.showModal = function (options) {
        modalTitle = (options && options.title) || ''
        if (shouldConfirm && options && typeof options.success === 'function') {
          options.success({ confirm: true, cancel: false })
        }
      }
      current.onSubmit()
    } catch (e) {
      toast = `ERROR:${e && e.message ? e.message : e}`
    } finally {
      try {
        wx.showToast = originalToast
      } catch (e) {
        /* ignore */
      }
      try {
        wx.showModal = originalModal
      } catch (e) {
        /* ignore */
      }
    }
    return {
      toast,
      modalTitle,
      canSubmit: current.data.canSubmit,
      submitText: current.data.submitText,
    }
  }, !!confirm)
}

/**
 * 模拟冷启动：重新执行一次 App 的 onLaunch，验证「启动时从缓存恢复登录态」这条路径。
 *
 * 自动化层无法真正重启小程序（miniprogram-automator 没有 restart API，本项目也约定
 * 不使用 mp.reLaunch），因此手动调用 onLaunch——它与真实冷启动执行的是同一段代码，
 * 是本机条件下最贴近的验证方式。
 */
async function simulateColdStart(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    app.onLaunch()
    const g = (app && app.globalData) || {}
    return {
      loginState: g.loginState || 'UNKNOWN',
      userInfo: g.userInfo || null,
    }
  })
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
    await clearMockMode(mp)
    await clearAvailMode(mp)
    await clearAuthMode(mp)
    await ensureLoggedOut(mp, HOME)
    let auth = await readGlobalAuth(mp)
    check('起点为未登录状态', auth.loginState === 'LOGGED_OUT', String(auth.loginState))

    // ---------- 1. 未登录时首页用户区 ----------
    let home = await waitForPageData(mp, HOME, (d) => d.loginState === 'LOGGED_OUT')
    check('首页 data.loginState 为 LOGGED_OUT', !!home && home.loginState === 'LOGGED_OUT', home ? String(home.loginState) : 'null')
    check('首页用户区主文案为「未登录」', !!home && home.userName === '未登录', home ? String(home.userName) : 'null')
    check(
      '首页用户区副文案为「登录后可预约场地」',
      !!home && home.userHint === '登录后可预约场地',
      home ? String(home.userHint) : 'null',
    )

    let page = await mp.currentPage()
    const userBar = await xpathEl(page, '//view[@class="user-bar"]')
    check('首页渲染出用户区', userBar !== null)
    const userBarName = await xpathText(page, '//view[@class="user-bar__name"]')
    check('渲染层用户区名称为「未登录」', userBarName === '未登录', String(userBarName))

    // ---------- 2. 我的预约页：未登录引导 ----------
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/my-bookings/my-bookings' }))
    let bookingsPath = await waitForRouteSettled(mp, MY_BOOKINGS, 15000)
    check('可进入我的预约页', bookingsPath === MY_BOOKINGS, String(bookingsPath))

    let bookings = await waitForPageData(mp, MY_BOOKINGS, (d) => d.loginState === 'LOGGED_OUT')
    check(
      '我的预约页 data.loginState 为 LOGGED_OUT',
      !!bookings && bookings.loginState === 'LOGGED_OUT',
      bookings ? String(bookings.loginState) : 'null',
    )

    page = await mp.currentPage()
    const tabs = await page.$$('.tabs__item')
    check('未登录时仍渲染 3 个状态页签', tabs.length === 3, `实际 ${tabs.length}`)

    const guideText = await xpathText(page, '//text[@class="empty-state__text"]')
    check(
      '未登录时展示登录引导文案',
      guideText === '登录后查看我的预约',
      String(guideText),
    )

    const guideAction = await xpathEl(page, '//view[@class="empty-state__action"]')
    const guideActionText = guideAction ? (await guideAction.text()) : null
    check('登录引导带「去登录」操作按钮', guideActionText === '去登录', String(guideActionText))

    if (guideAction) {
      await guideAction.tap()
      const toLogin = await waitForRouteSettled(mp, LOGIN, 15000)
      check('点击「去登录」进入登录页', toLogin === LOGIN, String(toLogin))
    } else {
      check('点击「去登录」进入登录页', false, '未找到操作按钮')
    }

    // ---------- 3. 登录页：未登录展示 ----------
    let loginData = await waitForPageData(mp, LOGIN, (d) => d.loginState === 'LOGGED_OUT')
    check(
      '登录页 data.loginState 为 LOGGED_OUT',
      !!loginData && loginData.loginState === 'LOGGED_OUT',
      loginData ? String(loginData.loginState) : 'null',
    )

    page = await mp.currentPage()
    const introTitle = await xpathText(page, '//view[@class="login-intro__title"]')
    check('登录页展示登录说明标题', introTitle === '登录 CampusReserve', String(introTitle))
    let loginBtnText = await readLoginButtonText(mp)
    check('登录按钮文案为「微信一键登录」', loginBtnText === '微信一键登录', String(loginBtnText))

    // ---------- 4. 微信一键登录流程 ----------
    const watch = await tapLoginAndWatchLoading(mp)
    check('点击登录按钮后出现「登录中…」loading 态', watch.sawLoading, watch.seen.join(' -> '))

    const backAfterLogin = await waitForRouteSettled(mp, MY_BOOKINGS, 20000)
    check('登录成功后自动返回来源页（我的预约）', backAfterLogin === MY_BOOKINGS, String(backAfterLogin))

    bookings = await waitForPageData(mp, MY_BOOKINGS, (d) => d.loginState === 'LOGGED_IN')
    check(
      '登录后我的预约页 data.loginState 为 LOGGED_IN',
      !!bookings && bookings.loginState === 'LOGGED_IN',
      bookings ? String(bookings.loginState) : 'null',
    )

    page = await mp.currentPage()
    const guideGone = await xpathEl(page, '//text[contains(text(),"登录后查看我的预约")]')
    check('已登录时我的预约页不再显示登录引导', guideGone === null)

    // ---------- 5. 登录状态保存 ----------
    auth = await readGlobalAuth(mp)
    check('app.globalData.loginState 为 LOGGED_IN', auth.loginState === 'LOGGED_IN', String(auth.loginState))
    check(
      'globalData 中带有用户信息',
      !!auth.userInfo && auth.userInfo.id === MOCK_USER_ID && auth.userInfo.nickname === MOCK_NICKNAME,
      auth.userInfo ? `${auth.userInfo.id}/${auth.userInfo.nickname}` : 'null',
    )

    const storage = await readAuthStorage(mp)
    check('登录凭证已写入缓存', typeof storage.token === 'string' && storage.token.length > 0, String(storage.token))
    check(
      '用户信息已写入缓存',
      !!storage.user &&
        storage.user.id === MOCK_USER_ID &&
        storage.user.nickname === MOCK_NICKNAME,
      storage.user ? `${storage.user.id}/${storage.user.nickname}` : 'null',
    )

    // ---------- 6. 已登录时首页用户区 ----------
    await goBackTo(mp, HOME)
    home = await waitForPageData(mp, HOME, (d) => d.loginState === 'LOGGED_IN')
    check('返回首页后 data.loginState 为 LOGGED_IN', !!home && home.loginState === 'LOGGED_IN', home ? String(home.loginState) : 'null')
    check(
      `首页用户区主文案为昵称「${MOCK_NICKNAME}」`,
      !!home && home.userName === MOCK_NICKNAME,
      home ? String(home.userName) : 'null',
    )
    check(
      '首页用户区副文案为「已登录，可预约场地」',
      !!home && home.userHint === '已登录，可预约场地',
      home ? String(home.userHint) : 'null',
    )
    check('首页用户区头像占位为昵称首字', !!home && home.avatarText === MOCK_NICKNAME.slice(0, 1), home ? String(home.avatarText) : 'null')

    page = await mp.currentPage()
    const nameAfterLogin = await xpathText(page, '//view[@class="user-bar__name"]')
    check(`渲染层用户区名称为「${MOCK_NICKNAME}」`, nameAfterLogin === MOCK_NICKNAME, String(nameAfterLogin))

    // ---------- 7. 已登录时登录页的用户信息展示 ----------
    const userBarAfterLogin = await xpathEl(page, '//view[@class="user-bar"]')
    if (userBarAfterLogin) {
      await userBarAfterLogin.tap()
    }
    const loginPath = await waitForRouteSettled(mp, LOGIN, 15000)
    check('点击首页用户区进入登录页（登录入口）', loginPath === LOGIN, String(loginPath))

    loginData = await waitForPageData(mp, LOGIN, (d) => d.loginState === 'LOGGED_IN')
    check(
      '已登录时登录页 data.loginState 为 LOGGED_IN',
      !!loginData && loginData.loginState === 'LOGGED_IN',
      loginData ? String(loginData.loginState) : 'null',
    )

    page = await mp.currentPage()
    const profileName = await xpathText(page, '//view[@class="profile__name"]')
    check('登录页展示用户昵称', profileName === MOCK_NICKNAME, String(profileName))
    const profileId = await xpathText(page, '//view[@class="profile__id"]')
    check(
      '登录页展示用户 ID',
      typeof profileId === 'string' && profileId.indexOf(String(MOCK_USER_ID)) >= 0,
      String(profileId),
    )
    const logoutEntry = await xpathEl(page, '//view[contains(@class,"logout")]')
    check('已登录时提供「退出登录」入口', logoutEntry !== null)
    const logoutText = logoutEntry ? (await logoutEntry.text()) : null
    check('「退出登录」入口文案正确', logoutText === '退出登录', String(logoutText))

    await goBackTo(mp, HOME)

    // ---------- 8. 资源详情页：已登录时可直接预约 ----------
    let detailPath = await openDetail(mp, RESOURCE_ID)
    check('可进入资源详情页', detailPath === DETAIL, String(detailPath))

    let detail = await waitForPageData(mp, DETAIL, (d) => d.pageState === 'success' && d.slotState === 'success')
    check('资源详情与时间段加载成功', !!detail && detail.slotState === 'success', detail ? String(detail.slotState) : 'null')

    // 当天已过时的时段会被 mock 标为 DISABLED（技术设计 §11），先切到明天再找可预约时段
    detail = await switchToTomorrow(mp, detail)
    const slotIdx = firstAvailableIndex(detail ? detail.slots : [])
    check('详情页存在可预约时段', slotIdx > 0, `idx=${slotIdx}`)

    if (slotIdx > 0) {
      await tapSlotByXPathIndex(mp, slotIdx)
      detail = await waitForPageData(mp, DETAIL, (d) => !!d.selectedSlot)
      check('已选中一个可预约时段', !!detail && !!detail.selectedSlot, detail && detail.selectedSlot ? String(detail.selectedSlot.startTime) : 'null')

      // Phase 6 起，已登录点预约会真正提交（提交本身与各类失败分支由 e2e-phase6.js 覆盖）。
      // 本阶段的关注点只是「已登录不再被登录门槛拦住」，因此断言它确实进入了提交流程：
      // 提交成功会跳转到我的预约页；若仍被门槛拦住，页面会停在原地弹「需要登录」。
      const gate = await callSubmitAndReadFeedback(mp, false)
      check(
        '已登录时点预约不再弹出「需要登录」引导',
        gate.modalTitle !== '需要登录',
        String(gate.modalTitle),
      )
      const submitted = await waitForRouteSettled(mp, MY_BOOKINGS, 15000)
      check('已登录时可以提交预约（Phase 6 起为真实提交）', submitted === MY_BOOKINGS, String(submitted))
    }

    await goBackTo(mp, HOME)

    // ---------- 9. 退出登录 ----------
    const afterLogout = await logoutViaPage(mp, HOME)
    check('退出登录后返回首页', afterLogout === HOME, String(afterLogout))

    auth = await readGlobalAuth(mp)
    check('退出后 globalData.loginState 为 LOGGED_OUT', auth.loginState === 'LOGGED_OUT', String(auth.loginState))

    const clearedStorage = await readAuthStorage(mp)
    check('退出后缓存中的登录凭证已清空', clearedStorage.token === null, String(clearedStorage.token))
    check('退出后缓存中的用户信息已清空', clearedStorage.user === null, JSON.stringify(clearedStorage.user))

    home = await waitForPageData(mp, HOME, (d) => d.loginState === 'LOGGED_OUT')
    check('退出后首页用户区恢复为「未登录」', !!home && home.userName === '未登录', home ? String(home.userName) : 'null')

    // ---------- 10. 未登录时预约流程的登录引导 ----------
    detailPath = await openDetail(mp, RESOURCE_ID)
    detail = await waitForPageData(mp, DETAIL, (d) => d.pageState === 'success' && d.slotState === 'success')
    // 同上：切到明天，保证未登录分支也能拿到可预约时段
    detail = await switchToTomorrow(mp, detail)
    const slotIdx2 = firstAvailableIndex(detail ? detail.slots : [])
    check('未登录时也能正常查看时间段', slotIdx2 > 0, `idx=${slotIdx2}`)

    if (slotIdx2 > 0) {
      await tapSlotByXPathIndex(mp, slotIdx2)
      detail = await waitForPageData(mp, DETAIL, (d) => !!d.selectedSlot)
      check('未登录时也能选中时段（按钮状态与登录无关）', !!detail && !!detail.selectedSlot)

      const gate = await callSubmitAndReadFeedback(mp, true)
      check('未登录时点预约弹出登录引导', gate.modalTitle === '需要登录', String(gate.modalTitle))

      const gatedPath = await waitForRouteSettled(mp, LOGIN, 15000)
      check('确认后进入登录页', gatedPath === LOGIN, String(gatedPath))
    } else {
      check('未登录时点预约弹出登录引导', false, '没有可用时段')
      check('确认后进入登录页', false, '没有可用时段')
    }

    // 登录后返回详情页，验证已选时段被保留（navigateBack 复用原页面实例）
    const detailLogin = await loginViaPage(mp, DETAIL, 20000)
    check('从预约流程登录后返回资源详情页', detailLogin.back === DETAIL, String(detailLogin.back))
    const keptSlot = await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      return current.data.selectedSlot ? current.data.selectedSlot.startTime : null
    })
    check('从登录页返回后已选时段仍在（页面实例未被销毁）', !!keptSlot, String(keptSlot))

    // ---------- 11. 登录失败处理 ----------
    // 先回首页：logoutViaPage 的返回目标必须与「进入登录页时所在的页面」一致，
    // 此处刚离开详情页，若直接调用会把导航关系搅乱。
    await goBackTo(mp, HOME)
    await logoutViaPage(mp, HOME)
    await setAuthMode(mp, 'error')

    await openLogin(mp)
    const failWatch = await tapLoginAndWatchLoading(mp, 8000)
    check('注入失败模式后登录按钮仍可点击', failWatch.tapped)

    const stillOnLogin = await currentPath(mp)
    check('登录失败时停留在登录页', stillOnLogin === LOGIN, String(stillOnLogin))

    loginData = await waitForPageData(mp, LOGIN, (d) => !!d.errorMessage, 10000)
    check(
      '登录失败时展示错误提示',
      !!loginData && typeof loginData.errorMessage === 'string' && loginData.errorMessage.length > 0,
      loginData ? String(loginData.errorMessage) : 'null',
    )
    page = await mp.currentPage()
    const errorText = await xpathText(page, '//text[@class="login-error__text"]')
    check(
      '渲染层出现失败提示文案',
      typeof errorText === 'string' && errorText.length > 0,
      String(errorText),
    )

    const retryBtnText = await readLoginButtonText(mp)
    check('登录失败后按钮恢复为「微信一键登录」（可重试）', retryBtnText === '微信一键登录', String(retryBtnText))

    // 清除失败模式后重试应成功
    await clearAuthMode(mp)
    const retry = await loginViaPage(mp, HOME, 20000)
    check('清除失败模式后重试登录成功', retry.back === HOME, String(retry.back))

    auth = await readGlobalAuth(mp)
    check('重试后处于已登录状态', auth.loginState === 'LOGGED_IN', String(auth.loginState))

    // ---------- 12. 冷启动时的登录态恢复 ----------
    await removeStorageValue(mp, AUTH_TOKEN_KEY)
    await removeStorageValue(mp, AUTH_USER_KEY)
    await setStorageValue(mp, AUTH_TOKEN_KEY, 'e2e-token')
    await setStorageValue(mp, AUTH_USER_KEY, { id: MOCK_USER_ID, nickname: MOCK_NICKNAME })

    let cold = await simulateColdStart(mp)
    check('冷启动能从缓存恢复为已登录', cold.loginState === 'LOGGED_IN', String(cold.loginState))
    check(
      '冷启动恢复后带出用户信息',
      !!cold.userInfo && cold.userInfo.nickname === MOCK_NICKNAME,
      cold.userInfo ? String(cold.userInfo.nickname) : 'null',
    )

    // 缓存不完整（只有凭证、没有用户信息）时必须回到未登录，并清掉残留
    await removeStorageValue(mp, AUTH_USER_KEY)
    cold = await simulateColdStart(mp)
    check('缓存不完整时冷启动回到未登录', cold.loginState === 'LOGGED_OUT', String(cold.loginState))

    const residual = await readAuthStorage(mp)
    check('缓存不完整时残留凭证被清掉', residual.token === null, String(residual.token))

    // ---------- 13. 清理 ----------
    await goBackTo(mp, HOME)
    await ensureLoggedOut(mp, HOME)
    await clearMockMode(mp)
    await clearAvailMode(mp)
    await clearAuthMode(mp)

    const finalAuth = await readGlobalAuth(mp)
    check('清理后回到未登录状态', finalAuth.loginState === 'LOGGED_OUT', String(finalAuth.loginState))

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
