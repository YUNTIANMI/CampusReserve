/**
 * CampusReserve 小程序 ↔ 真实后端 完整回归（Phase 11）
 *
 * 目的：Phase 11 的验收标准是「小程序切换到真实后端（USE_MOCK_DATA = false）后，
 * 核心业务全链路 + 各失败分支仍正确」。Phase 10 的 e2e-real-backend.js 只证明
 * 「读写链路是通的」（28 项，成功路径 + 一次取消），本脚本把范围扩到完整回归：
 * 覆盖 docs/04_development_plan.md Phase 11 清单的每一类（页面跳转 / 资源加载 /
 * 空数据 / 登录 / 预约 / 取消预约 / 返回刷新），并补齐失败分支。
 *
 * 与 e2e-real-backend.js 的关键区别——**失败分支怎么注入**：
 * 前九套 mock 回归靠 `CR_MOCK_*` 存储键让开发期数据源返回指定错误；但
 * `USE_MOCK_DATA = false` 后这些键全部失效，数据直接走 HTTP 到真实后端。
 * 因此本脚本**不靠任何测试后门**，而是构造真实场景让后端自然地返回业务错误：
 *   - 冲突 409001：先 HTTP 抢掉一个时段，再在页面里点同一时段
 *   - 资源不存在 404001：访问一个不存在的资源 id
 *   - 非法时间 / 参数错误：无法从正常 UI 提交出非法入参（客户端先拦一道），
 *     这两类已由 tools/api-test/api-phase10.js 在接口层充分覆盖（§5.6 校验顺序），
 *     本脚本在页面层验证「客户端预校验拦下非法入参」这一前端职责
 *   - 未授权 401002 / 网络失败：见文末「已知边界」
 *
 * 已知边界（刻意不在本脚本内覆盖，理由见 docs/PROJECT_MEMORY.md Phase 11）：
 *   - **未授权 401002**：前端「遇 401 清登录态 + 引导登录」的页面逻辑已由
 *     mock 回归（e2e-phase6/7/8 的 `unauthorized` 模式）覆盖；后端 401002 各触发条件
 *     （缺 token / 签名非法 / 过期 / 用户不存在）已由 api-phase10.js 覆盖。
 *     在真实后端 E2E 里无法干净构造「有效登录态瞬间失效」而不动内存态（红线 #19）。
 *   - **网络失败**：需要「后端没在监听」，只能停后端，而停进程会中断整个自动化会话。
 *     前端 error 态 + 重试入口已由 mock 回归覆盖；本脚本不做进程级编排。
 *
 * 前置条件（缺一不可）：
 *   1) 后端已连 MySQL 启动（默认 http://127.0.0.1:8088）
 *   2) CampusReserve/services/config.ts 的 `USE_MOCK_DATA` 已置为 **false**
 *   3) 开发者工具「详情 → 本地设置」勾选「不校验合法域名…」
 *   4) 自动化模式已启动：cli.bat auto --project "…\CampusReserve" --auto-port 9420
 *
 * 用法：
 *   node ./e2e-phase11.js ws://127.0.0.1:9420
 *
 * 数据清理：脚本跑完后用 `node ./e2e-phase11-helper.js clean` 清掉测试写入的预约，
 * 避免占用未来几天的时段影响后续运行。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const LIST = 'pages/resource-list/resource-list'
const RESOURCE_DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'
const BOOKING_DETAIL = 'pages/booking-detail/booking-detail'

/** 后端种子数据里的第 1 条资源，用于核对「页面上的名字确实来自数据库」 */
const SEED_RESOURCE_NAME = '图书馆三楼自习室 A'
/** 种子资源总数（data.sql 8 条） */
const SEED_RESOURCE_COUNT = 8

const RESOURCE_CARD_ROOT = (i) =>
  `(//view[contains(@class,"resource-card") and not(contains(@class,"resource-card__"))])[${i}]`

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 路由与查询（复用 e2e-real-backend.js 的同一套手法） ---------------- */

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

const TRANSITION_SETTLE_MS = 1400

async function waitForPath(mp, target, timeoutMs = 12000) {
  const t0 = Date.now()
  let p = null
  while (Date.now() - t0 < timeoutMs) {
    p = await currentPath(mp)
    if (p === target) return p
    await sleep(250)
  }
  return p
}

async function waitForRouteSettled(mp, target, timeoutMs = 15000) {
  const path = await waitForPath(mp, target, timeoutMs)
  if (path === target) {
    await sleep(TRANSITION_SETTLE_MS)
  }
  return path
}

/** 轮询当前页 data，直到 predicate 成立；返回最后一次读到的数据 */
async function waitForPageData(mp, path, predicate, timeoutMs = 15000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === path) {
      const data = await page.data()
      last = data
      if (predicate(data)) return { data, hit: true }
    }
    await sleep(250)
  }
  return { data: last, hit: false }
}

/** 等到页面栈顶不再是 target 为止（登录页成功后会自动 navigateBack，见第 39 条红线） */
async function waitUntilNotPath(mp, target, timeoutMs = 8000) {
  const t0 = Date.now()
  let p = null
  while (Date.now() - t0 < timeoutMs) {
    p = await currentPath(mp)
    if (p && p !== target) return p
    await sleep(200)
  }
  return p
}

/** xpath 未命中会返回占位对象，故以 tagName + 尺寸双重判定 */
async function xpathEl(page, xpath) {
  const el = await page.xpath(xpath)
  if (!el) return null
  const size = await el.size().catch(() => null)
  const w = size ? parseFloat(String(size.width)) : 0
  const h = size ? parseFloat(String(size.height)) : 0
  if (typeof el.tagName !== 'string' || !el.tagName || !(w > 0) || !(h > 0)) return null
  return el
}

/* ---------------- 反馈探针（复用 modal / toast 记录器） ---------------- */

async function installModalSpy(mp, mode) {
  return mp.evaluate((m) => {
    const app = getApp()
    const previous = app.__e2eSpy
    if (previous && previous.originalModal) {
      try {
        wx.showModal = previous.originalModal
      } catch (e) {
        /* ignore */
      }
    }
    const spy = { modals: [], toasts: [], mode: m, originalModal: wx.showModal, originalToast: wx.showToast }
    app.__e2eSpy = spy
    wx.showModal = function (options) {
      spy.modals.push({
        title: (options && options.title) || '',
        content: (options && options.content) || '',
        confirmText: (options && options.confirmText) || '',
        cancelText: (options && options.cancelText) || '',
      })
      if (spy.mode === 'none') return
      if (options && typeof options.success === 'function') {
        options.success(
          spy.mode === 'confirm' ? { confirm: true, cancel: false } : { confirm: false, cancel: true },
        )
      }
    }
    wx.showToast = function (options) {
      spy.toasts.push({
        title: (options && options.title) || '',
        icon: (options && options.icon) || 'none',
      })
      if (options && typeof options.success === 'function') options.success({})
    }
    return true
  }, mode)
}

async function readModalSpy(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    return app.__e2eSpy
      ? { modals: app.__e2eSpy.modals || [], toasts: app.__e2eSpy.toasts || [] }
      : { modals: [], toasts: [] }
  })
}

async function clearModalSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    if (app.__e2eSpy) {
      app.__e2eSpy.modals = []
      app.__e2eSpy.toasts = []
    }
  })
}

async function uninstallModalSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    const spy = app.__e2eSpy
    if (spy) {
      try {
        wx.showModal = spy.originalModal
        wx.showToast = spy.originalToast
      } catch (e) {
        /* ignore */
      }
      delete app.__e2eSpy
    }
  })
}

/* ---------------- 导航与登录态 ---------------- */

async function resetToHome(mp) {
  try {
    await mp.evaluate(() => wx.reLaunch({ url: '/pages/index/index' }))
  } catch (e) {
    /* 工具层抛出时导航通常已生效 */
  }
  const path = await waitForRouteSettled(mp, HOME, 15000)
  if (path !== HOME) {
    const state = await probeReLaunch(mp)
    if (state === 'pending') {
      throw new Error(
        `模拟器路由过渡已冻结（wx.reLaunch 回调停在 pending）→ 请先 \`cli.bat close\` 再重新执行 start-automation.js`,
      )
    }
  }
  return path
}

async function probeReLaunch(mp) {
  try {
    await mp.evaluate(() => {
      wx.__e2eProbe = 'pending'
      wx.reLaunch({
        url: '/pages/index/index',
        success: () => {
          wx.__e2eProbe = 'ok'
        },
        fail: (e) => {
          wx.__e2eProbe = 'fail:' + (e && e.errMsg)
        },
      })
    })
    await sleep(2500)
    return await mp.evaluate(() => wx.__e2eProbe)
  } catch (e) {
    return 'fail:' + (e && e.message ? e.message : String(e))
  }
}

async function navigateTo(mp, url) {
  try {
    await mp.navigateTo(url)
  } catch (e) {
    /* 工具层偶发抛错时导航通常已生效 */
  }
}

/** 在 appservice 内调页面方法前判方法存在（红线 #33） */
async function callPageMethod(mp, methodName) {
  return mp.evaluate((name) => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (current && typeof current[name] === 'function') {
      current[name]()
      return true
    }
    return false
  }, methodName)
}

/** 读取当前页面的 data */
async function currentPageData(mp) {
  const page = await mp.currentPage()
  return page ? page.data() : null
}

/**
 * 确保处于登出状态。
 *
 * 登录态真源是 store/auth.ts 的内存态，跨自动化会话存活（红线 #19）。
 * 上一轮脚本可能留下了 LOGGED_IN，C 组要验证「未登录引导」，必须先清掉它。
 * 通过登录页的 onLogout 走真实登出流程（confirm 探针已就位，会自动点确认）。
 */
async function ensureLoggedOut(mp) {
  const isIn = await mp.evaluate(() => {
    const app = getApp()
    return !!(app && app.globalData && app.globalData.loginState === 'LOGGED_IN')
  })
  if (!isIn) return
  // 进登录页，触发 onLogout 退出
  await navigateTo(mp, `/${LOGIN}`)
  await waitForRouteSettled(mp, LOGIN)
  await mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (current && typeof current.onLogout === 'function') current.onLogout()
  })
  await sleep(2500)
  // 退出后回到首页
  await resetToHome(mp)
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint })

  try {
    console.log(`== 小程序 ↔ 真实后端 完整回归（Phase 11）==\nws=${wsEndpoint}\n`)

    await installModalSpy(mp, 'confirm')

    // 清场：重建页面栈，避免上一轮把登录页留成栈底
    check('准备：已重置到首页', (await resetToHome(mp)) === HOME, String(await currentPath(mp)))

    // ---------- A. 页面跳转 + 资源加载（首页 / 列表 / 详情） ----------
    const homeRes = await waitForPageData(mp, HOME, (d) => d.pageState === 'success' && d.hotResources && d.hotResources.length > 0)
    check('A1 首页加载成功（数据来自真实后端）',
      homeRes.hit && homeRes.data.pageState === 'success',
      `state=${homeRes.data && homeRes.data.pageState} hot=${homeRes.data && homeRes.data.hotResources && homeRes.data.hotResources.length}`)
    check('A2 首页拿到 4 条热门资源（前端从 8 条里切前 4）',
      !!(homeRes.data.hotResources && homeRes.data.hotResources.length === 4),
      String(homeRes.data.hotResources && homeRes.data.hotResources.length))
    check('A3 首页热门首条名与数据库种子一致',
      !!(homeRes.data.hotResources && homeRes.data.hotResources[0].name === SEED_RESOURCE_NAME),
      homeRes.data.hotResources && homeRes.data.hotResources[0].name)

    await navigateTo(mp, `/${LIST}`)
    check('A4 进入资源列表页', (await waitForRouteSettled(mp, LIST)) === LIST, String(await currentPath(mp)))

    const listRes = await waitForPageData(mp, LIST, (d) => d.pageState === 'success' && d.resources && d.resources.length > 0)
    check('A5 列表加载成功',
      listRes.hit && listRes.data.pageState === 'success',
      `state=${listRes.data && listRes.data.pageState}`)
    check('A6 列表拿到后端种子数据的 8 条资源',
      !!(listRes.data.resources && listRes.data.resources.length === SEED_RESOURCE_COUNT),
      String(listRes.data.resources && listRes.data.resources.length))

    const listPage = await mp.currentPage()
    let rendered = 0
    for (let i = 1; i <= SEED_RESOURCE_COUNT + 1; i++) {
      if (await xpathEl(listPage, RESOURCE_CARD_ROOT(i))) rendered += 1
    }
    check('A7 渲染层真的画出 8 张资源卡片', rendered === SEED_RESOURCE_COUNT, `rendered=${rendered}`)

    // 返回首页（用于后续导航），再进详情
    await mp.evaluate(() => wx.navigateBack({ delta: 1 }))
    await waitForRouteSettled(mp, HOME, 15000)

    await navigateTo(mp, `/${RESOURCE_DETAIL}?id=1`)
    check('B1 进入资源详情页', (await waitForRouteSettled(mp, RESOURCE_DETAIL)) === RESOURCE_DETAIL,
      String(await currentPath(mp)))

    const detailRes = await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.pageState === 'success' && d.slots && d.slots.length > 0)
    check('B2 详情加载成功', detailRes.hit && detailRes.data.pageState === 'success',
      `state=${detailRes.data && detailRes.data.pageState}`)
    check('B3 详情资源名与数据库种子一致',
      !!(detailRes.data.resource && detailRes.data.resource.name === SEED_RESOURCE_NAME),
      detailRes.data.resource && detailRes.data.resource.name)
    check('B4 可用时间段来自后端 /availability（6 段）',
      !!(detailRes.data.slots && detailRes.data.slots.length === 6),
      String(detailRes.data.slots && detailRes.data.slots.length))

    // ---------- C. 空数据（资源不存在 → empty 态；我的预约空态） ----------
    // 先确保登出，避免上一轮脚本留下的登录态让「未登录引导」断言落空
    await ensureLoggedOut(mp)

    await navigateTo(mp, `/${RESOURCE_DETAIL}?id=99999`)
    check('C1 进入「不存在的资源」详情页', (await waitForRouteSettled(mp, RESOURCE_DETAIL)) === RESOURCE_DETAIL,
      String(await currentPath(mp)))
    const emptyDetail = await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.pageState === 'empty')
    check('C2 资源不存在落到 empty 态（不是 error 态）',
      emptyDetail.hit && emptyDetail.data.pageState === 'empty',
      `state=${emptyDetail.data && emptyDetail.data.pageState}`)

    // 回到首页，进「我的预约」看空态（未登录时是登录引导，不是空态——先验证未登录引导）
    await resetToHome(mp)
    await navigateTo(mp, `/${MY_BOOKINGS}`)
    check('C3 进入我的预约页（未登录）', (await waitForRouteSettled(mp, MY_BOOKINGS)) === MY_BOOKINGS,
      String(await currentPath(mp)))
    const notLogged = await waitForPageData(mp, MY_BOOKINGS, (d) => d.loginState === 'LOGGED_OUT')
    check('C4 未登录时我的预约落到登录引导（不发请求）',
      notLogged.hit && notLogged.data.loginState === 'LOGGED_OUT',
      `state=${notLogged.data && notLogged.data.loginState}`)

    // ---------- D. 登录（真实 POST /api/auth/login） ----------
    await navigateTo(mp, `/${LOGIN}`)
    check('D1 进入登录页', (await waitForRouteSettled(mp, LOGIN)) === LOGIN, String(await currentPath(mp)))

    const loginPage = await mp.currentPage()
    const loginStateBefore = (await loginPage.data()).loginState
    if (loginStateBefore === 'LOGGED_IN') {
      await mp.evaluate(() => {
        const pages = getCurrentPages()
        const current = pages[pages.length - 1]
        if (current && typeof current.onLogout === 'function') current.onLogout()
      })
      await sleep(2500)
    }
    const before = await loginPage.data()
    check('D2 登录前处于未登录态', before.loginState === 'LOGGED_OUT', String(before.loginState))

    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && typeof current.onLogin === 'function') current.onLogin()
    })
    const afterLogin = await waitForPageData(mp, LOGIN, (d) => d.loginState === 'LOGGED_IN')
    check('D3 一键登录成功（真实 wx.login + POST /api/auth/login）',
      afterLogin.hit && afterLogin.data.loginState === 'LOGGED_IN',
      `state=${afterLogin.data && afterLogin.data.loginState} err=${afterLogin.data && afterLogin.data.errorMessage}`)

    // 等登录页自己那个「成功后延迟返回」走完（红线 #39）
    const afterLoginPath = await waitUntilNotPath(mp, LOGIN)
    check('D4 登录成功后登录页已自行离开', afterLoginPath !== LOGIN, String(afterLoginPath))
    await sleep(TRANSITION_SETTLE_MS)

    // ---------- E. 预约：成功 + 客户端预校验 ----------
    // 回到首页 → 详情页选明天时段提交
    await resetToHome(mp)
    await navigateTo(mp, `/${RESOURCE_DETAIL}?id=1`)
    await waitForRouteSettled(mp, RESOURCE_DETAIL)
    const detailReady = await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.pageState === 'success' && d.slots && d.slots.length > 0)
    check('E1 详情页就绪（含时段）', detailReady.hit, `state=${detailReady.data && detailReady.data.pageState}`)

    // 切到明天（避开「当天已过时时段为 0」的红线 #24）
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && current.data && current.data.dateOptions && current.data.dateOptions.length > 1) {
        const tomorrow = current.data.dateOptions[1].value
        if (typeof current.onTapDate === 'function') {
          current.onTapDate({ currentTarget: { dataset: { value: tomorrow } } })
        }
      }
    })
    const tomorrowReady = await waitForPageData(mp, RESOURCE_DETAIL,
      (d) => d.slots && d.slots.length > 0 && d.slots.some((s) => s.status === 'AVAILABLE'))
    check('E2 切到明天后有可预约时段',
      tomorrowReady.hit,
      JSON.stringify(tomorrowReady.data && tomorrowReady.data.slots && tomorrowReady.data.slots.map((s) => s.status)))

    // 选第一个 AVAILABLE 时段
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && current.data && current.data.slots) {
        const slot = current.data.slots.find((s) => s.status === 'AVAILABLE')
        if (slot && typeof current.onTapSlot === 'function') {
          current.onTapSlot({ detail: { slot } })
        }
      }
    })
    const selected = await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.canSubmit === true)
    check('E3 选中时段后按钮可提交', selected.hit, `canSubmit=${selected.data && selected.data.canSubmit}`)

    // 记录选中的时段，用于后续断言冲突
    const selectedSlot = selected.data && selected.data.selectedSlot
    const selectedDate = selected.data && selected.data.selectedDate

    // 提交
    await clearModalSpy(mp)
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && typeof current.onSubmit === 'function') current.onSubmit()
    })
    // 成功会 toast「预约成功」并延迟跳转到「我的预约」
    const afterSubmit = await waitForPageData(mp, MY_BOOKINGS, (d) => d.pageState === 'success')
    check('E4 预约成功后跳转到我的预约页', afterSubmit.hit, `state=${afterSubmit.data && afterSubmit.data.pageState}`)

    const spyAfterSubmit = await readModalSpy(mp)
    check('E5 预约成功提示「预约成功」',
      spyAfterSubmit.toasts.some((t) => /预约成功/.test(t.title)),
      JSON.stringify(spyAfterSubmit.toasts))

    // 我的预约里应能读到刚建的那条（PENDING）
    const mineRes = await waitForPageData(mp, MY_BOOKINGS, (d) => d.pageState === 'success' && d.allBookings && d.allBookings.length > 0)
    check('E6 我的预约里出现刚创建的预约（PENDING）',
      mineRes.hit && mineRes.data.allBookings.some((b) => b.status === 'PENDING' && b.resourceName === SEED_RESOURCE_NAME),
      JSON.stringify(mineRes.data && mineRes.data.allBookings && mineRes.data.allBookings.map((b) => `${b.id}:${b.status}`)))

    // 记录刚创建的预约 id（用于取消分支）
    const createdBooking = mineRes.data.allBookings.find((b) => b.status === 'PENDING')

    // ---------- F. 冲突分支（409001） ----------
    // 回到详情页，同一资源同一时段（已被自己刚约掉），再提交应报冲突
    await resetToHome(mp)
    await navigateTo(mp, `/${RESOURCE_DETAIL}?id=1`)
    await waitForRouteSettled(mp, RESOURCE_DETAIL)
    const detail2 = await waitForPageData(mp, RESOURCE_DETAIL, (d) => d.pageState === 'success' && d.slots && d.slots.length > 0)
    check('F1 冲突场景：详情页就绪', detail2.hit)

    // 切到明天，找同一个刚约掉的时段（应显示 BOOKED）
    await mp.evaluate((date) => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && typeof current.onTapDate === 'function') {
        current.onTapDate({ currentTarget: { dataset: { value: date } } })
      }
    }, selectedDate)
    const conflictSlots = await waitForPageData(mp, RESOURCE_DETAIL,
      (d) => d.slots && d.slots.length > 0 && d.slots.some((s) => s.startTime === (selectedSlot && selectedSlot.startTime) && s.status === 'BOOKED'))
    check('F2 刚约掉的时段已显示为 BOOKED（真实后端回读占用）',
      conflictSlots.hit,
      JSON.stringify(conflictSlots.data && conflictSlots.data.slots && conflictSlots.data.slots.map((s) => `${s.startTime}:${s.status}`)))

    // ---------- G. 取消预约：成功 ----------
    if (createdBooking && createdBooking.id) {
      // 从「我的预约」进详情：这样取消后 navigateBack 才回到「我的预约」，
      // 触发它的 onShow 重新拉取，覆盖「返回刷新」这一项。
      await resetToHome(mp)
      await navigateTo(mp, `/${MY_BOOKINGS}`)
      check('G1 进入我的预约页', (await waitForRouteSettled(mp, MY_BOOKINGS)) === MY_BOOKINGS,
        String(await currentPath(mp)))
      await waitForPageData(mp, MY_BOOKINGS, (d) => d.pageState === 'success' && d.allBookings && d.allBookings.length > 0)

      await navigateTo(mp, `/${BOOKING_DETAIL}?id=${createdBooking.id}`)
      check('G1b 从我的预约进入预约详情页', (await waitForRouteSettled(mp, BOOKING_DETAIL)) === BOOKING_DETAIL,
        String(await currentPath(mp)))
      await sleep(1500)

      const cancelReady = await waitForPageData(mp, BOOKING_DETAIL,
        (d) => d && d.pageState === 'success' && d.canCancel === true)
      check('G2 预约详情已加载且可取消', cancelReady.hit, JSON.stringify({
        state: cancelReady.data && cancelReady.data.pageState,
        canCancel: cancelReady.data && cancelReady.data.canCancel,
      }))

      await clearModalSpy(mp)
      await mp.evaluate(() => {
        const pages = getCurrentPages()
        const current = pages[pages.length - 1]
        if (current && typeof current.onCancel === 'function') current.onCancel()
      })
      await sleep(3000)

      const spyCancel = await readModalSpy(mp)
      check('G3 取消前弹出二次确认', spyCancel.modals.length >= 1 && /取消/.test(spyCancel.modals[spyCancel.modals.length - 1].title || ''),
        JSON.stringify(spyCancel.modals))

      // 取消成功：详情页状态应变为 CANCELLED
      const afterCancel = await waitForPageData(mp, BOOKING_DETAIL, (d) => d.pageState === 'success' && d.status === 'CANCELLED')
      check('G4 取消后详情页状态变为 CANCELLED',
        afterCancel.hit, `status=${afterCancel.data && afterCancel.data.status}`)
      check('G5 取消成功提示「已取消」',
        (await readModalSpy(mp)).toasts.some((t) => /已取消/.test(t.title)),
        JSON.stringify((await readModalSpy(mp)).toasts))

      // 返回「我的预约」，onShow 应重新拉取（返回刷新）
      await mp.evaluate(() => wx.navigateBack({ delta: 1 }))
      const refreshed = await waitForPageData(mp, MY_BOOKINGS,
        (d) => d && d.allBookings && d.allBookings.some((b) => b.id === createdBooking.id && b.status === 'CANCELLED'))
      check('G6 返回我的预约后 onShow 刷新，状态已同步 CANCELLED（返回刷新）',
        refreshed.hit,
        JSON.stringify(refreshed.data && refreshed.data.allBookings && refreshed.data.allBookings.map((b) => `${b.id}:${b.status}`)))
    } else {
      check('G 组：未能取到刚创建的预约 id，取消分支跳过', false, 'createdBooking 为空')
    }

    // ---------- H. 收尾 ----------
    await uninstallModalSpy(mp)
    check('H1 收尾清理反馈探针', true)
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
