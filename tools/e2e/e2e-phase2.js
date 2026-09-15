/**
 * CampusReserve Phase 2 端到端测试（首页）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase2.js ws://127.0.0.1:9420
 *
 * 覆盖：顶部区域、分类入口、热门/推荐资源、ResourceCard 组件真实渲染、
 *       卡片与入口的跳转链路、success/loading/empty/error 四态、error 重试恢复、下拉刷新。
 *
 * 四条实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 只能查页面自身节点，无法进入自定义组件内部，
 *      连 <resource-card> 这类组件标签本身都查不到；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中时「不返回 null」，而是返回 tagName 为 undefined、
 *      尺寸 0x0 的占位对象。判定存在必须同时检查 tagName 与尺寸，见 xpathEl()。
 *   3. mp.reLaunch() 会让 automator 内部抛错（页面销毁时 getPageMetaByWebviewId 返回 null
 *      却被直接解构），因此全程避免 reLaunch，改用页面自身的加载方法触发。
 *   4. 统计渲染层元素数量的可靠手段是 XPath 位置谓词 `(//x)[n]`：逐个探测到第 n 个不存在为止。
 *      页面实例的 selectAllComponents() **不可用于计数** —— 在 automator 的 evaluate 上下文中
 *      它恒返回 0（连 `.hero__action` 这类普通 view 也是 0），实测无效。
 *      XPath 还支持嵌套谓词，可用于精确定位「包含某段文字的卡片」，见本文件用法。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 的 MOCK_MODE_STORAGE_KEY 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const HOME = 'pages/index/index'

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
 *
 * 直接读 appservice 的真实页面栈，而不是用 mp.currentPage()：
 * 后者依赖 automator 内部维护的 pageStack，在页面刚切换（尤其刚 navigateBack）时
 * 可能与真实状态不同步，导致跳转断言偶发误判（实测「点击分类入口」一例即因此误报）。
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

/** 轮询等待路由变为目标值，返回最终路径 */
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

/** 轮询等待首页进入目标状态，返回最终状态 */
async function waitForState(mp, expect, timeoutMs = 10000) {
  const t0 = Date.now()
  let state = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === HOME) {
      const data = await page.data()
      state = data.pageState
      if (state === expect) return state
    }
    await sleep(250)
  }
  return state
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
  while (info.len > 1 && guard < 12) {
    await mp.navigateBack()
    await sleep(500)
    info = await stackInfo(mp)
    guard++
  }
  return info.routes[0]
}

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

/**
 * 在 appservice 内调用当前页面方法。
 *
 * 刻意不用 page.callMethod()：首页的加载方法是 async，
 * callMethod 会尝试序列化其返回的 Promise，容易报错；evaluate 里直接调用则只执行不返回。
 */
async function callPageMethod(mp, name) {
  return mp.evaluate((method) => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current[method]()
  }, name)
}

/**
 * 触发首页重新加载。
 * 同一次 evaluate 内「先调用再读状态」，中间没有往返间隙，可稳定捕获 loading 瞬时态。
 */
async function loadHomeAndReadState(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current.loadResources()
    return current.data.pageState
  })
}

/**
 * 让首页重新拉取一次数据并等待指定状态。
 *
 * 注意：这里刻意不使用 mp.reLaunch()（原因见文件头第 3 条），
 * 改用页面自身的加载方法触发，效果等价且稳定。
 */
async function reloadHome(mp, expect = 'success') {
  if ((await currentPath(mp)) !== HOME) {
    await goBackTo(mp, HOME)
    await sleep(500)
  }
  await loadHomeAndReadState(mp)
  return waitForState(mp, expect)
}

/**
 * 查询自定义组件内部节点。
 * automator 的 page.xpath() 未命中时返回占位对象，因此以 tagName + 尺寸双重判定。
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

/**
 * 统计某类元素在渲染层中的数量。
 *
 * 用 XPath 位置谓词逐个探测：第 n 个命中说明至少有 n 个，第一个未命中即为总数。
 * 注意每个元素都要过 xpathEl 的 tagName + 尺寸双重校验，否则第 n+1 个的占位对象会被误判为存在。
 */
async function countCardsByXPath(page, xpathOf, max = 20) {
  let n = 0
  for (let i = 1; i <= max; i++) {
    const el = await xpathEl(page, xpathOf(i))
    if (!el) break
    n++
  }
  return n
}

/** 注入开发期数据源模式；不重载页面，仅改变下一次请求的结果 */
async function setMockMode(mp, mode) {
  await mp.evaluate((key, value) => wx.setStorageSync(key, value), MOCK_MODE_KEY, mode)
}

/** 清除开发期数据源模式，恢复为默认的 success */
async function clearMockMode(mp) {
  await mp.evaluate((key) => wx.removeStorageSync(key), MOCK_MODE_KEY)
}

/** 在首页找一个文案包含 label 的分类入口并点击 */
async function tapCategory(mp, label) {
  const page = await mp.currentPage()
  const items = await page.$$('.category-item')
  for (const item of items) {
    const text = await item.text()
    if (text && text.indexOf(label) >= 0) {
      await item.tap()
      return true
    }
  }
  return false
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

    // 退回本次启动的入口页（首页），并清掉可能残留的数据源模式
    const bottom = await bottomRoute(mp)
    check('本次启动的入口页为首页（页面栈栈底）', bottom === HOME, String(bottom))
    await clearMockMode(mp)
    let state = await reloadHome(mp, 'success')
    await sleep(500)

    // ---------- 1. 顶部区域 ----------
    let page = await mp.currentPage()
    let text = await xpathText(page, '//view[@class="hero__title"]')
    check('顶部区域渲染项目名', text === 'CampusReserve', JSON.stringify(text))
    text = await xpathText(page, '//view[@class="hero__desc"]')
    check('顶部区域渲染副标题', text === '校园场地预约', JSON.stringify(text))
    text = await xpathText(page, '//view[@class="hero__action"]')
    check(
      '顶部区域渲染「我的预约」入口',
      text !== null && text.indexOf('我的预约') >= 0,
      JSON.stringify(text),
    )

    // ---------- 2. 分类入口 ----------
    const categoryItems = await page.$$('.category-item')
    check('渲染 4 个分类入口', categoryItems.length === 4, `实际 ${categoryItems.length}`)

    const categoryTexts = []
    for (const item of categoryItems) {
      categoryTexts.push((await item.text()) || '')
    }
    for (const label of ['自习室', '研讨室', '摄影棚', '球场']) {
      check(
        `分类入口包含「${label}」`,
        categoryTexts.some((t) => t.indexOf(label) >= 0),
        categoryTexts.join(' | '),
      )
    }

    // ---------- 3. 资源数据与热门 / 推荐划分 ----------
    check('首页加载完成状态为 success', state === 'success', String(state))
    let data = await page.data()
    check('热门资源 4 条', data.hotResources.length === 4, `实际 ${data.hotResources.length}`)
    check(
      '推荐资源 4 条',
      data.recommendResources.length === 4,
      `实际 ${data.recommendResources.length}`,
    )
    check(
      '热门与推荐无重复资源',
      data.hotResources.every((r) => !data.recommendResources.some((x) => x.id === r.id)),
    )

    // ---------- 4. ResourceCard 组件真实渲染 ----------
    const cardCount = await countCardsByXPath(
      page,
      (i) => `(//view[@class="resource-card"])[${i}]`,
      12,
    )
    check('首页渲染 8 张资源卡片（热门 4 + 推荐 4）', cardCount === 8, `实际 ${cardCount}`)

    // 区块标题
    const titles = []
    for (const t of await page.$$('.cr-section__title')) {
      titles.push((await t.text()) || '')
    }
    check(
      '渲染「资源分类 / 热门资源 / 推荐资源」区块标题',
      titles.indexOf('资源分类') >= 0 && titles.indexOf('热门资源') >= 0 && titles.indexOf('推荐资源') >= 0,
      titles.join(' | '),
    )

    const cardEl = await xpathEl(page, '//view[@class="resource-card"]')
    check('ResourceCard 组件真实渲染（xpath 穿透 + 尺寸校验）', cardEl !== null)
    if (cardEl) {
      const size = await cardEl.size()
      check(
        'ResourceCard 尺寸正常',
        parseFloat(String(size.width)) > 0 && parseFloat(String(size.height)) > 0,
        JSON.stringify(size),
      )
      const cardText = await cardEl.text()
      const hot = data.hotResources[0]
      check(
        'ResourceCard 展示名称 / 类型 / 容量 / 地点',
        cardText.indexOf(hot.name) >= 0 &&
          cardText.indexOf('自习室') >= 0 &&
          cardText.indexOf(`可容纳 ${hot.capacity} 人`) >= 0 &&
          cardText.indexOf(hot.location) >= 0,
        JSON.stringify(cardText),
      )
    }

    const tagText = await xpathText(page, '//text[@class="resource-card__tag"]')
    check('ResourceCard 类型标签渲染中文名', tagText === '自习室', JSON.stringify(tagText))

    // 推荐区（第 5 张起）确实渲染了对应资源，而不只是热门区有内容
    const recCardEl = await xpathEl(page, '(//view[@class="resource-card"])[5]')
    check('推荐区渲染第 5 张卡片', recCardEl !== null)
    if (recCardEl) {
      const recText = await recCardEl.text()
      const rec = data.recommendResources[0]
      check(
        '推荐区首张卡片对应推荐资源第一条',
        recText.indexOf(rec.name) >= 0 && recText.indexOf(`可容纳 ${rec.capacity} 人`) >= 0,
        JSON.stringify(recText),
      )
    }

    // 用嵌套谓词直接按资源名定位卡片，验证渲染内容与数据源一一对应
    const namedCardEl = await xpathEl(
      page,
      `//view[@class="resource-card"][.//view[contains(text(),"${data.recommendResources[3].name}")]]`,
    )
    check(
      '按资源名可精确定位到最后一张推荐卡片',
      namedCardEl !== null,
      data.recommendResources[3].name,
    )

    // ---------- 5. 点击资源卡进入详情 ----------
    if (cardEl) {
      const hotId = (await page.data()).hotResources[0].id
      await cardEl.tap()
      const detailPath = await waitForPath(mp, 'pages/resource-detail/resource-detail', 6000)
      check(
        '点击 ResourceCard 跳转到资源详情',
        detailPath === 'pages/resource-detail/resource-detail',
        String(detailPath),
      )
      const detail = await mp.currentPage()
      const detailData = await detail.data()
      check(
        '资源详情页接收到正确的资源 id',
        detailData.resourceId === hotId && detailData.hasValidId === true,
        `resourceId=${detailData.resourceId} 期望=${hotId}`,
      )
      await goBackTo(mp, HOME)
      await sleep(500)
    }

    // ---------- 6. 分类入口跳转（带 category 参数） ----------
    check('点击分类入口「研讨室」', await tapCategory(mp, '研讨室'))
    const listPath = await waitForPath(mp, 'pages/resource-list/resource-list', 6000)
    check('分类入口跳转到资源列表', listPath === 'pages/resource-list/resource-list', String(listPath))
    const listPage = await mp.currentPage()
    const listData = await listPage.data()
    check(
      '资源列表接收到分类参数',
      listData.category === 'SEMINAR_ROOM',
      `category=${listData.category}`,
    )
    await goBackTo(mp, HOME)
    await sleep(500)

    // ---------- 7. 顶部「我的预约」入口 ----------
    page = await mp.currentPage()
    const myBookings = await page.$('.hero__action')
    check('顶部「我的预约」入口可点击', myBookings !== null)
    if (myBookings) {
      await myBookings.tap()
      const bookingsPath = await waitForPath(mp, 'pages/my-bookings/my-bookings', 6000)
      check(
        '顶部入口跳转到我的预约',
        bookingsPath === 'pages/my-bookings/my-bookings',
        String(bookingsPath),
      )
      await goBackTo(mp, HOME)
      await sleep(500)
    }

    // ---------- 8. loading 态 ----------
    page = await mp.currentPage()
    const loadingState = await loadHomeAndReadState(mp)
    check('触发加载后立即进入 loading 态', loadingState === 'loading', String(loadingState))
    const loadingText = await xpathText(page, '//view[@class="loading-state"]')
    check(
      'loading 态渲染 loading-state 组件',
      loadingText !== null && loadingText.indexOf('正在加载资源') >= 0,
      JSON.stringify(loadingText),
    )
    check('loading 态下不渲染 error-state', (await xpathEl(page, '//view[@class="error-state"]')) === null)
    state = await waitForState(mp, 'success')
    check('加载完成后回到 success', state === 'success', String(state))

    // ---------- 9. 下拉刷新 ----------
    // 真实下拉手势 automator 无法模拟，直接触发页面回调验证其逻辑；
    // 判定标准是「数据源变化能反映到页面」，以此证明刷新真的重新发起了请求，而非空转。
    await setMockMode(mp, 'empty')
    await callPageMethod(mp, 'onPullDownRefresh')
    state = await waitForState(mp, 'empty')
    check('下拉刷新重新拉取数据（数据源变空后落到 empty）', state === 'empty', String(state))

    await setMockMode(mp, 'success')
    await callPageMethod(mp, 'onPullDownRefresh')
    state = await waitForState(mp, 'success')
    data = await (await mp.currentPage()).data()
    check(
      '再次下拉刷新恢复 success 且数据完整',
      state === 'success' && data.hotResources.length === 4 && data.recommendResources.length === 4,
      `state=${state} hot=${data.hotResources.length} rec=${data.recommendResources.length}`,
    )

    // ---------- 10. empty 态 ----------
    await setMockMode(mp, 'empty')
    state = await reloadHome(mp, 'empty')
    check('数据为空时落到 empty 态', state === 'empty', String(state))
    page = await mp.currentPage()
    data = await page.data()
    check('empty 态清空资源列表', data.hotResources.length === 0 && data.recommendResources.length === 0)
    text = await xpathText(page, '//view[@class="empty-state"]')
    check(
      'empty-state 组件真实渲染且文案正确',
      text !== null && text.indexOf('暂无资源') >= 0 && text.indexOf('重新加载') >= 0,
      JSON.stringify(text),
    )
    check('empty 态下分类入口仍可用（不整页替换）', (await page.$$('.category-item')).length === 4)

    // ---------- 11. error 态与重试恢复 ----------
    await setMockMode(mp, 'error')
    state = await reloadHome(mp, 'error')
    check('接口失败时落到 error 态', state === 'error', String(state))
    page = await mp.currentPage()
    data = await page.data()
    check(
      'error 态写入错误提示',
      typeof data.errorMessage === 'string' && data.errorMessage.length > 0,
      JSON.stringify(data.errorMessage),
    )
    const errMessage = data.errorMessage
    text = await xpathText(page, '//view[@class="error-state"]')
    check(
      'error-state 组件展示失败原因',
      text !== null && errMessage && text.indexOf(errMessage) >= 0,
      JSON.stringify(text),
    )
    check('error 态下不渲染 loading-state', (await xpathEl(page, '//view[@class="loading-state"]')) === null)

    // 恢复数据源但保持页面处于 error 态，验证 retry 事件链路真的重新拉取
    await setMockMode(mp, 'success')
    const retryBtn = await xpathEl(page, '//view[@class="error-state__action"]')
    check('error-state 渲染重试按钮', retryBtn !== null)
    if (retryBtn) {
      await retryBtn.tap()
      state = await waitForState(mp, 'success', 10000)
      data = await (await mp.currentPage()).data()
      check(
        '点击重试后重新加载并恢复 success',
        state === 'success' && data.hotResources.length === 4,
        `state=${state} hot=${data.hotResources.length}`,
      )
    }

    // ---------- 12. 收尾：恢复默认数据源 ----------
    await clearMockMode(mp)
    state = await reloadHome(mp, 'success')
    check('收尾恢复默认数据源后首页正常', state === 'success', String(state))
    const finalPath = await currentPath(mp)
    check('测试结束停在首页', finalPath === HOME, String(finalPath))
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
