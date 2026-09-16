/**
 * CampusReserve 小程序 ↔ 真实后端 联通实测（Phase 10）
 *
 * 目的：Phase 10 的验收标准是「小程序核心业务可依赖真实后端运行」。
 * tools/api-test/api-phase10.js 证明了后端接口本身是对的，但那只证明了「后端能跑」；
 * 本脚本证明的是**小程序真的在通过 HTTP 读写这个后端**——两者不能互相替代。
 *
 * 前置条件（缺一不可）：
 *   1) 后端已连 MySQL 启动（默认 http://127.0.0.1:8080）
 *   2) 小程序端 CampusReserve/services/config.ts 的 `USE_MOCK_DATA` 已置为 **false**
 *      （这是临时切换：脚本跑完要改回 true，否则九套 mock 回归会失效）
 *   3) 开发者工具「详情 → 本地设置」勾选「不校验合法域名…」（本地 http 回环地址必需）
 *   4) 自动化模式已启动：cli.bat auto --project "…\CampusReserve" --auto-port 9420
 *   5) 先用 HTTP 为该用户预置一条预约（在「待使用」状态），把 id 作为参数传进来：
 *      node ./e2e-real-backend.js ws://127.0.0.1:9420 12
 *
 * 核心手法：**反证数据来源**
 * 把开发期数据源的模式键 `CR_MOCK_MODE` 置为 `'empty'` 后，若列表仍显示 8 条资源，
 * 那这些数据只可能来自后端——mock 数据源此刻被明确要求返回空。
 * 这比「看到数据就算通」强得多：后者在 mock 忘关时会给出假阳性。
 *
 * 身份一致性：小程序里 `wx.login` 拿到的 code 不是 `dev:` 开头，因此后端把它映射到
 * 固定的开发用户 `dev-user`；HTTP 预置预约时用同一个用户登录（code 传任意非 dev: 值），
 * 于是「小程序里能看到那条预约」同时验证了「服务端按凭证过滤」这件事。
 *
 * 已知限制：本脚本只覆盖核心读写链路。完整的真实后端回归（含各失败分支）属 Phase 11。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'
const presetBookingId = Number(process.argv[3] || 0)

const MOCK_MODE_KEY = 'CR_MOCK_MODE'

const HOME = 'pages/index/index'
const LOGIN = 'pages/login/login'
const LIST = 'pages/resource-list/resource-list'
const RESOURCE_DETAIL = 'pages/resource-detail/resource-detail'
const MY_BOOKINGS = 'pages/my-bookings/my-bookings'
const BOOKING_DETAIL = 'pages/booking-detail/booking-detail'

/** 后端种子数据里的第 1 条资源，用于核对「页面上的名字确实来自数据库」 */
const SEED_RESOURCE_NAME = '图书馆三楼自习室 A'

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

/* ---------------- 路由与查询 ---------------- */

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

/**
 * 等到页面栈顶**不再是** target 为止，返回最终落位。
 *
 * 为什么需要它：登录页在登录成功后会 `setTimeout(() => navigateBack(delta:1), BACK_DELAY)`
 * 自动返回来源页。若在它触发前就压入新页面，这个迟到的返回弹掉的是**新页面**，
 * 栈顶又回到登录页（实测 D 组全部失败就是这么来的）。所以必须等它走完再导航。
 */
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

/**
 * 清空模态探针已记录的内容。
 *
 * 同一个自动化会话里，早先步骤（如 C2 的「退出登录」确认）也会被探针记下来；
 * 断言「最后一次弹窗是取消预约」前必须清空，否则读到的是上一轮的旧记录。
 */
async function clearModalSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    if (app.__e2eSpy) app.__e2eSpy.modals = []
  })
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

async function setStorageValue(mp, key, value) {
  await mp.evaluate((k, v) => wx.setStorageSync(k, v), key, value)
}

async function removeStorageValue(mp, key) {
  await mp.evaluate((k) => wx.removeStorageSync(k), key)
}

/** 安装模态框探针：取消预约的确认框在模拟器里点不到，只能让探针代答 */
async function installModalSpy(mp, mode) {
  return mp.evaluate((m) => {
    const app = getApp()
    const previous = app.__e2eSpy
    // 若上一轮脚本没走到收尾就中断了，这里要先把被换掉的原始 API 还原回来，
    // 否则 originalModal 会保存成「上一个探针」，收尾时还原的仍然是探针而不是真实 API。
    if (previous && previous.originalModal) {
      try {
        wx.showModal = previous.originalModal
      } catch (e) {
        /* ignore */
      }
    }
    const spy = { modals: [], mode: m, originalModal: wx.showModal }
    app.__e2eSpy = spy
    wx.showModal = function (options) {
      spy.modals.push({
        title: (options && options.title) || '',
        content: (options && options.content) || '',
      })
      if (spy.mode === 'none') return
      if (options && typeof options.success === 'function') {
        options.success(
          spy.mode === 'confirm' ? { confirm: true, cancel: false } : { confirm: false, cancel: true },
        )
      }
    }
    return true
  }, mode)
}

async function readModalSpy(mp) {
  return mp.evaluate(() => {
    const app = getApp()
    return app.__e2eSpy ? { modals: app.__e2eSpy.modals } : { modals: [] }
  })
}

async function uninstallModalSpy(mp) {
  await mp.evaluate(() => {
    const app = getApp()
    const spy = app.__e2eSpy
    if (spy) {
      try {
        wx.showModal = spy.originalModal
      } catch (e) {
        /* ignore */
      }
      delete app.__e2eSpy
    }
  })
}

/**
 * 重置到首页。
 *
 * 为什么不用 navigateBack 回栈底：自动化会话跨脚本存活，上一轮可能把**登录页**留成了
 * 页面栈的栈底（它的「成功后延迟返回」会把新压入的页面弹掉）。栈底只有一页时
 * navigateBack 无能为力，下一次 navigateTo 也会被那个迟到的返回顶掉。
 * 因此这里直接用 `wx.reLaunch` 重建页面栈——
 * 注意必须是 **appservice 里的 wx.reLaunch**，automator 包装的 `mp.reLaunch()` 有已知缺陷
 * （抛 `Cannot destructure property 'rawPath'`），见 tools/e2e/README.md。
 */
async function resetToHome(mp) {
  try {
    await mp.evaluate(() => wx.reLaunch({ url: '/pages/index/index' }))
  } catch (e) {
    /* 工具层抛出时导航通常已生效，交给下面的落位轮询确认 */
  }
  const path = await waitForRouteSettled(mp, HOME, 15000)
  if (path !== HOME) {
    // 区分两种失败：页面栈真的错了，还是模拟器的路由过渡已经冻死（后者只能重启会话）。
    // `wx.reLaunch` 的回调长时间停在 pending 就是冻结的判据——见 tools/e2e/README.md。
    const state = await probeReLaunch(mp)
    if (state === 'pending') {
      throw new Error(
        `模拟器路由过渡已冻结（wx.reLaunch 回调停在 pending），页面栈 ${JSON.stringify(
          await mp.evaluate(() => getCurrentPages().map((p) => p.route)),
        )} → 请先 \`cli.bat close\` 再重新执行 start-automation.js 重建自动化会话`,
      )
    }
  }
  return path
}

/** 触发一次带回调记录的 reLaunch，返回 'ok' | 'fail:…' | 'pending' */
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
    /* 工具层偶发抛错时导航通常已生效，交给下面的落位轮询确认 */
  }
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint })

  try {
    console.log(`== 小程序 ↔ 真实后端 联通实测 ==\nws=${wsEndpoint}  预置预约 id=${presetBookingId}\n`)
    check('前置：已传入 HTTP 预置的预约 id', presetBookingId > 0, String(presetBookingId))

    await installModalSpy(mp, 'confirm')

    // 清场：上一轮可能把页面栈留在登录页（甚至把它变成栈底），且它的延迟返回定时器
    // 可能还在飞。直接 reLaunch 重建页面栈，比 navigateBack 可靠。
    check('准备：已重置到首页', (await resetToHome(mp)) === HOME, String(await currentPath(mp)))

    // 反证的前提：让开发期数据源一律返回空
    await removeStorageValue(mp, MOCK_MODE_KEY)
    await setStorageValue(mp, MOCK_MODE_KEY, 'empty')
    const modeNow = await mp.evaluate((k) => wx.getStorageSync(k), MOCK_MODE_KEY)
    check('准备：开发期数据源已置为 empty（本轮数据只可能来自后端）', modeNow === 'empty', String(modeNow))

    // ---------- A. 资源列表：数据只能来自后端 ----------
    await navigateTo(mp, `/${LIST}`)
    check('A1 进入资源列表页', (await waitForRouteSettled(mp, LIST)) === LIST, String(await currentPath(mp)))

    const listRes = await waitForPageData(mp, LIST, (d) => d.pageState === 'success' && d.resources && d.resources.length > 0)
    check('A2 列表加载成功（mock 被要求返回空，页面却是 success）',
      listRes.hit && listRes.data.pageState === 'success',
      `state=${listRes.data && listRes.data.pageState} len=${listRes.data && listRes.data.resources && listRes.data.resources.length}`)
    check('A3 列表拿到后端种子数据的 8 条资源',
      !!(listRes.data.resources && listRes.data.resources.length === 8),
      String(listRes.data.resources && listRes.data.resources.length))
    check('A4 首条资源名与数据库种子一致',
      !!(listRes.data.resources && listRes.data.resources[0].name === SEED_RESOURCE_NAME),
      listRes.data.resources && listRes.data.resources[0].name)

    const page = await mp.currentPage()
    let rendered = 0
    for (let i = 1; i <= 9; i++) {
      if (await xpathEl(page, RESOURCE_CARD_ROOT(i))) rendered += 1
    }
    check('A5 渲染层真的画出 8 张资源卡片', rendered === 8, `rendered=${rendered}`)

    // ---------- B. 资源详情与可用时间段 ----------
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
    check('B5 时段状态取值合法（三态之一）',
      !!detailRes.data.slots.every((s) => ['AVAILABLE', 'BOOKED', 'DISABLED'].indexOf(s.status) >= 0),
      JSON.stringify(detailRes.data.slots.map((s) => s.status)))

    // ---------- C. 登录：走真实 POST /api/auth/login ----------
    await navigateTo(mp, `/${LOGIN}`)
    check('C1 进入登录页', (await waitForRouteSettled(mp, LOGIN)) === LOGIN, String(await currentPath(mp)))

    const loginPage = await mp.currentPage()
    const loginStateBefore = (await loginPage.data()).loginState
    if (loginStateBefore === 'LOGGED_IN') {
      // 上一次会话可能残留登录态，先退出，保证「登录 → 拿 token」这一步真的被执行
      await mp.evaluate(() => {
        const pages = getCurrentPages()
        const current = pages[pages.length - 1]
        if (current && typeof current.onLogout === 'function') current.onLogout()
      })
      await sleep(2500)
    }
    const before = await loginPage.data()
    check('C2 登录前处于未登录态', before.loginState === 'LOGGED_OUT', String(before.loginState))

    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && typeof current.onLogin === 'function') current.onLogin()
    })
    const afterLogin = await waitForPageData(mp, LOGIN, (d) => d.loginState === 'LOGGED_IN')
    check('C3 一键登录成功（真实 wx.login + POST /api/auth/login）',
      afterLogin.hit && afterLogin.data.loginState === 'LOGGED_IN',
      `state=${afterLogin.data && afterLogin.data.loginState} err=${afterLogin.data && afterLogin.data.errorMessage}`)

    // 等登录页自己那个「成功后延迟返回」走完（见 waitUntilNotPath 注释）。
    // 不等就直接进入 D 组：新页面会被这个迟到的 navigateBack 弹掉。
    const afterLoginPath = await waitUntilNotPath(mp, LOGIN)
    check('C4 登录成功后登录页已自行离开（迟到的返回不会顶掉下一页）',
      afterLoginPath !== LOGIN, String(afterLoginPath))
    await sleep(TRANSITION_SETTLE_MS)

    // ---------- D. 我的预约：读后端预置的那条 ----------
    await navigateTo(mp, `/${MY_BOOKINGS}`)
    check('D1 进入我的预约页', (await waitForRouteSettled(mp, MY_BOOKINGS)) === MY_BOOKINGS,
      String(await currentPath(mp)))

    const mineRes = await waitForPageData(mp, MY_BOOKINGS,
      (d) => d && d.pageState === 'success' && d.allBookings && d.allBookings.length > 0)
    const mineData = mineRes.data || {}
    check('D2 我的预约加载成功（不是错误态）', mineRes.hit && mineData.pageState === 'success',
      `state=${mineData.pageState} err=${mineData.errorMessage}`)

    const preset = mineData.allBookings && mineData.allBookings.find((b) => b.id === presetBookingId)
    check('D3 HTTP 预置的预约出现在列表里（小程序读到了后端数据、且按凭证归属）', !!preset,
      JSON.stringify(mineData.allBookings && mineData.allBookings.map((b) => b.id)))
    check('D4 列表里的资源名来自后端（连接 resource 表）',
      !!(preset && preset.resourceName === SEED_RESOURCE_NAME),
      preset && preset.resourceName)
    check('D5 该预约初始状态为 PENDING', !!(preset && preset.status === 'PENDING'), preset && preset.status)

    // ---------- E. 取消预约：写回后端 ----------
    await navigateTo(mp, `/${BOOKING_DETAIL}?id=${presetBookingId}`)
    check('E1 进入预约详情页', (await waitForRouteSettled(mp, BOOKING_DETAIL)) === BOOKING_DETAIL,
      String(await currentPath(mp)))
    await sleep(1500)

    // `onCancel` 的守卫里含 `!this.data.canCancel` → 详情必须先加载完，否则调用会被静默忽略
    const cancelReady = await waitForPageData(mp, BOOKING_DETAIL,
      (d) => d && d.pageState === 'success' && d.canCancel === true)
    check('E1b 预约详情已加载且处于可取消状态', cancelReady.hit, JSON.stringify({
      state: cancelReady.data && cancelReady.data.pageState,
      canCancel: cancelReady.data && cancelReady.data.canCancel,
    }))

    // 清掉前面步骤（C2 退出登录确认）留下的旧弹窗记录，否则 E2 读到的是别人
    await clearModalSpy(mp)

    await mp.evaluate(() => {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && typeof current.onCancel === 'function') current.onCancel()
    })
    await sleep(3000)

    const spy = await readModalSpy(mp)
    check('E2 取消前弹出二次确认（不可逆操作必须确认）',
      spy.modals.length >= 1 && /取消/.test(spy.modals[spy.modals.length - 1].title || ''),
      JSON.stringify(spy.modals))

    // 返回「我的预约」，onShow 会重新拉一次后端数据
    await mp.evaluate(() => wx.navigateBack({ delta: 1 }))
    const afterCancel = await waitForPageData(mp, MY_BOOKINGS,
      (d) => d && d.allBookings && d.allBookings.some((b) => b.id === presetBookingId && b.status === 'CANCELLED'))
    const cancelData = afterCancel.data || {}
    const cancelled = cancelData.allBookings && cancelData.allBookings.find((b) => b.id === presetBookingId)
    check('E3 取消后重新拉取，状态已变为 CANCELLED（写路径打通）',
      !!(cancelled && cancelled.status === 'CANCELLED'), cancelled && cancelled.status)
    check('E4 取消后不再出现在「待使用」页签',
      !!(cancelData.list && cancelData.list.every((b) => b.id !== presetBookingId)),
      JSON.stringify(cancelData.list && cancelData.list.map((b) => b.id)))

    // ---------- F. 收尾 ----------
    await uninstallModalSpy(mp)
    await removeStorageValue(mp, MOCK_MODE_KEY)
    check('F1 收尾清掉 CR_MOCK_MODE，不给后续测试留痕',
      (await mp.evaluate((k) => wx.getStorageSync(k), MOCK_MODE_KEY)) === '',
      String(await mp.evaluate((k) => wx.getStorageSync(k), MOCK_MODE_KEY)))
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
