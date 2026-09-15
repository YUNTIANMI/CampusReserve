/**
 * CampusReserve Phase 1 端到端测试（在真实微信开发者工具中运行）
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase1.js ws://127.0.0.1:9420
 *
 * 必须遵守的两条实测结论（否则会误判）：
 *   1. page.$() / page.$$() 只能查页面自身节点，无法进入自定义组件内部，
 *      连 <empty-state> 组件标签本身都查不到；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中时「不返回 null」，而是返回 tagName 为 undefined、
 *      尺寸 0x0 的占位对象。判定存在必须同时检查 tagName 与尺寸，见 xpathEl()。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function currentPath(mp) {
  const page = await mp.currentPage()
  return page ? page.path : null
}

/** 轮询等待路由变为目标值，返回最终路径 */
async function waitForPath(mp, target, timeoutMs = 5000) {
  const t0 = Date.now()
  let p = null
  while (Date.now() - t0 < timeoutMs) {
    p = await currentPath(mp)
    if (p === target) return p
    await sleep(250)
  }
  return p
}

async function stackInfo(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    return { len: pages.length, routes: pages.map((p) => p.route) }
  })
}

/** 返回首页（navigateBack 逐级退，最多 8 次） */
async function goBackTo(mp, targetPath) {
  let path = await currentPath(mp)
  let guard = 0
  while (path !== targetPath && guard < 8) {
    await mp.navigateBack()
    await sleep(800)
    path = await currentPath(mp)
    guard++
  }
  return path
}

/** 退回页面栈栈底，返回栈底路由（栈底即本次启动的入口页） */
async function bottomRoute(mp) {
  let info = await stackInfo(mp)
  let guard = 0
  while (info.len > 1 && guard < 12) {
    await mp.navigateBack()
    await sleep(500)
    info = await stackInfo(mp)
    guard++
  }
  return info.routes[0]
}

/**
 * 查询自定义组件内部节点。
 * automator 的 page.xpath() 未命中时返回占位对象，因此这里以 tagName + 尺寸双重判定。
 */
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

;(async () => {
  let mp
  // 刚执行完 cli auto 时窗口可能仍在编译，连接需要重试
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

    // ---------- 1. 启动页与首页内容 ----------
    const bottom = await bottomRoute(mp)
    check('本次启动的入口页为首页（页面栈栈底）', bottom === 'pages/index/index', String(bottom))
    await goBackTo(mp, 'pages/index/index')
    await sleep(600)

    let page = await mp.currentPage()
    // Phase 2 起首页已是真实页面，Phase 1 的临时「页面入口」调试列表随之移除，
    // 这里改为校验首页已渲染真实的分类入口；首页真实入口的跳转由 e2e-phase2.js 覆盖。
    const entries = await page.$$('.category-item')
    check('首页渲染 4 个分类入口', entries.length === 4, `实际 ${entries.length}`)

    // ---------- 2. 四条核心路由可达性 ----------
    // 首页不再提供调试用入口列表，改为直接导航验证路由本身可用。
    const routes = [
      { label: '资源列表', path: 'pages/resource-list/resource-list' },
      { label: '资源详情', path: 'pages/resource-detail/resource-detail' },
      { label: '我的预约', path: 'pages/my-bookings/my-bookings' },
      { label: '预约详情', path: 'pages/booking-detail/booking-detail' },
    ]
    for (const r of routes) {
      await mp.navigateTo(`/${r.path}`)
      const got = await waitForPath(mp, r.path, 6000)
      check(`路由「${r.label}」可正常打开`, got === r.path, `实际 ${got}`)
      const back = await goBackTo(mp, 'pages/index/index')
      check(`从「${r.label}」返回首页`, back === 'pages/index/index', `实际 ${back}`)
    }

    // ---------- 3. resource-detail 参数接收与非法参数兜底 ----------
    await mp.navigateTo('/pages/resource-detail/resource-detail?id=8')
    await sleep(1500)
    page = await mp.currentPage()
    let data = await page.data()
    check(
      'resource-detail 正确解析 id 参数',
      data.resourceId === 8 && data.hasValidId === true,
      `resourceId=${data.resourceId} hasValidId=${data.hasValidId}`,
    )
    check(
      'resource-detail 合法 id 时不展示错误态',
      (await xpathEl(page, '//view[@class="error-state"]')) === null,
    )
    await goBackTo(mp, 'pages/index/index')

    await mp.navigateTo('/pages/resource-detail/resource-detail')
    await sleep(1500)
    page = await mp.currentPage()
    data = await page.data()
    let errText = await xpathText(page, '//view[@class="error-state"]')
    check(
      'resource-detail 缺少 id 时展示错误态（而非白屏）',
      data.hasValidId === false && errText !== null,
      `hasValidId=${data.hasValidId} errorText=${JSON.stringify(errText)}`,
    )
    await goBackTo(mp, 'pages/index/index')

    // ---------- 4. booking-detail 参数接收与非法参数兜底 ----------
    await mp.navigateTo('/pages/booking-detail/booking-detail?id=5')
    await sleep(1500)
    page = await mp.currentPage()
    data = await page.data()
    check('booking-detail 正确解析 id 参数', data.bookingId === 5 && data.hasValidId === true)

    await mp.navigateTo('/pages/booking-detail/booking-detail')
    await sleep(1500)
    page = await mp.currentPage()
    data = await page.data()
    errText = await xpathText(page, '//view[@class="error-state"]')
    check(
      'booking-detail 缺少 id 时展示错误态',
      data.hasValidId === false && errText !== null,
      `hasValidId=${data.hasValidId}`,
    )
    await goBackTo(mp, 'pages/index/index')

    // ---------- 5. resource-list：参数、四态与三个状态组件 ----------
    await mp.navigateTo('/pages/resource-list/resource-list?category=STUDY_ROOM')
    await sleep(1500)
    page = await mp.currentPage()
    data = await page.data()
    check('resource-list 接收 category 参数', data.category === 'STUDY_ROOM', String(data.category))
    check('默认落到 empty 状态（无无限 loading）', data.pageState === 'empty', String(data.pageState))

    // empty 态组件
    let text = await xpathText(page, '//view[@class="empty-state"]')
    check(
      'empty-state 组件真实渲染且文案正确',
      text !== null && text.indexOf('暂无资源数据') >= 0 && text.indexOf('返回上一页') >= 0,
      JSON.stringify(text),
    )
    const emptyBtn = await xpathEl(page, '//view[@class="empty-state__action"]')
    check('empty-state 渲染操作按钮', emptyBtn !== null)
    const btnSize = emptyBtn ? await emptyBtn.size() : null
    check(
      'empty-state 操作按钮尺寸正常（可点击）',
      btnSize !== null && parseFloat(String(btnSize.width)) > 0 && parseFloat(String(btnSize.height)) > 0,
      JSON.stringify(btnSize),
    )

    // loading 态组件
    await page.setData({ pageState: 'loading' })
    await sleep(800)
    text = await xpathText(page, '//view[@class="loading-state"]')
    check(
      'loading-state 组件真实渲染且文案正确',
      text !== null && text.indexOf('正在加载资源') >= 0,
      JSON.stringify(text),
    )
    check('loading 态下不再渲染 empty-state', (await xpathEl(page, '//view[@class="empty-state"]')) === null)
    check('loading 态下不再渲染 error-state', (await xpathEl(page, '//view[@class="error-state"]')) === null)

    // error 态组件 + retry 事件链路
    await page.setData({ pageState: 'error', errorMessage: '网络连接失败，请检查网络后重试' })
    await sleep(800)
    text = await xpathText(page, '//view[@class="error-state"]')
    check(
      'error-state 组件渲染错误信息',
      text !== null && text.indexOf('网络连接失败，请检查网络后重试') >= 0,
      JSON.stringify(text),
    )
    check(
      'error 态下不再渲染 loading-state',
      (await xpathEl(page, '//view[@class="loading-state"]')) === null,
    )
    const retryBtn = await xpathEl(page, '//view[@class="error-state__action"]')
    check('error-state 渲染重试按钮', retryBtn !== null)
    if (retryBtn) {
      await retryBtn.tap()
      await sleep(1500)
      page = await mp.currentPage()
      data = await page.data()
      check(
        '点击重试触发 retry 事件并重新加载（回到 empty）',
        data.pageState === 'empty',
        `pageState=${data.pageState}`,
      )
    }

    // empty 态操作按钮 → 事件链路 → 返回上一页
    const backBtn = await xpathEl(page, '//view[@class="empty-state__action"]')
    check('empty-state 操作按钮可点击', backBtn !== null)
    if (backBtn) {
      await backBtn.tap()
      const after = await waitForPath(mp, 'pages/index/index', 5000)
      check(
        '点击 empty-state 操作按钮触发 action 事件并返回上一页',
        after === 'pages/index/index',
        `实际 ${after}`,
      )
    }

    await goBackTo(mp, 'pages/index/index')

    // ---------- 6. my-bookings 页签切换 ----------
    await mp.navigateTo('/pages/my-bookings/my-bookings')
    await sleep(1500)
    page = await mp.currentPage()
    data = await page.data()
    check('my-bookings 默认页签为 PENDING', data.activeStatus === 'PENDING', String(data.activeStatus))
    check('my-bookings 默认空状态文案', data.emptyText === '暂无待使用的预约', String(data.emptyText))

    let tabs = await page.$$('.tabs__item')
    check('my-bookings 渲染 3 个状态页签', tabs.length === 3, `实际 ${tabs.length}`)

    if (tabs.length === 3) {
      await tabs[1].tap()
      await sleep(1000)
      page = await mp.currentPage()
      data = await page.data()
      check(
        '切换页签到「已完成」生效',
        data.activeStatus === 'COMPLETED' && data.emptyText === '暂无已完成的预约',
        `activeStatus=${data.activeStatus} emptyText=${data.emptyText}`,
      )
      const active = await page.$('.tabs__item--active')
      const activeText = active ? await active.text() : ''
      check('激活页签样式生效', activeText.indexOf('已完成') >= 0, activeText)

      tabs = await page.$$('.tabs__item')
      await tabs[2].tap()
      await sleep(1000)
      page = await mp.currentPage()
      data = await page.data()
      check(
        '切换页签到「已取消」生效',
        data.activeStatus === 'CANCELLED' && data.emptyText === '暂无已取消的预约',
        `activeStatus=${data.activeStatus} emptyText=${data.emptyText}`,
      )
    }

    await goBackTo(mp, 'pages/index/index')
    const finalPath = await currentPath(mp)
    check('测试结束回到首页', finalPath === 'pages/index/index', String(finalPath))
  } catch (e) {
    check('测试执行过程无异常', false, e.message)
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
