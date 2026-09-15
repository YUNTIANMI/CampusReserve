/**
 * CampusReserve Phase 3 端到端测试（资源列表页）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase3.js ws://127.0.0.1:9420
 *
 * 覆盖：分类筛选项渲染与激活态、从首页带 category 进入、切换筛选真实重新请求、
 *       分类筛选真实生效（返回结果类型与筛选一致）、ResourceCard 列表计数与内容、
 *       点击卡片进入详情、success/loading/empty/error 四态、error 重试恢复、
 *       下拉刷新、非法 category 参数归一化、四态下筛选栏常驻可用。
 *
 * 六条实测结论（不遵守会误判）：
 *   1. page.$() / page.$$() 只能查页面自身节点，无法进入自定义组件内部，
 *      连 <resource-card> 这类组件标签本身都查不到；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中时「不返回 null」，而是返回 tagName 为 undefined、
 *      尺寸 0x0 的占位对象。判定存在必须同时检查 tagName 与尺寸，见 xpathEl()。
 *   3. mp.reLaunch() 会让 automator 内部抛错（页面销毁时 getPageMetaByWebviewId 返回 null
 *      却被直接解构），因此全程避免 reLaunch，改用页面自身的加载方法触发。
 *   4. 统计渲染层元素数量的可靠手段是 XPath 位置谓词 `(//x)[n]`：逐个探测到第 n 个不存在为止。
 *      页面实例的 selectAllComponents() **不可用于计数**（evaluate 上下文中恒返回 0）。
 *   5. **点击筛选后不能只等 pageState 变回 success**：点击前页面本就处于 success，
 *      事件又要跨渲染层→AppService 传递，因此「等 success」会立刻命中点击前的旧值，
 *      读到上一个筛选条件的数据（实测因此误报 4 项）。必须轮询到
 *      「category 已变成目标值 且 pageState 为期望值」才算本次切换完成，见 tapFilterAndWait()。
 *   6. **导航之间必须留出过渡收尾期**：`wx.navigateTo` / `wx.navigateBack` 的栈更新很快，
 *      但整段过渡动画约 1.2 秒才 onRouteDone；在过渡未结束时再发导航会把模拟器的路由过渡
 *      卡死约 10 秒（日志实测：点卡片后 0.5 秒就发返回 → detail 的 onRouteDone 迟了 10 秒，
 *      且 `wx.navigateTo` 报 `fail timeout` 并触发页面失败提示）。所有
 *      「导航 → 立刻再导航」都必须走 waitForRouteSettled()。
 *      另：`mp.navigateBack()` 是 `changeRoute('navigateBack')`，**不接受 delta**，
 *      且会在页面销毁瞬间抛 `Uncaught [object Object]`（抛错时导航其实已生效）；
 *      多级返回应改用 `wx.navigateBack({ delta })`，见 goBackTo()。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 的 MOCK_MODE_STORAGE_KEY 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const HOME = 'pages/index/index'
const LIST = 'pages/resource-list/resource-list'
const DETAIL = 'pages/resource-detail/resource-detail'

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
 * 可能与真实状态不同步，导致跳转断言偶发误判。
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

/**
 * 路由过渡的收尾静默期（毫秒）。
 *
 * 实测：栈顶路由变得比调用晚不了多少，但整段过渡动画还要约 1.2 秒才 onRouteDone。
 * **在过渡未结束时再发导航会把它卡死约 10 秒**——日志证据：
 * 点卡片后 0.5 秒就发返回，结果 detail 的 onRouteDone 迟了 10 秒才到，
 * 同时 wx.navigateTo 报 `fail timeout` 并触发页面的失败提示。
 * 因此每次导航后都留出静默期，等过渡真正收尾再继续。
 */
const TRANSITION_SETTLE_MS = 1400

/**
 * 等路由落到目标页并等过渡收尾。
 *
 * 用途说明见 TRANSITION_SETTLE_MS。**任何「导航 → 立刻再导航」的写法都必须走本方法**，
 * 否则会把模拟器的路由过渡卡住（这也是本文件曾经误报「返回冲过目标页」的根因）。
 */
async function waitForRouteSettled(mp, target, timeoutMs = 15000) {
  const path = await waitForPath(mp, target, timeoutMs)
  if (path === target) {
    await sleep(TRANSITION_SETTLE_MS)
  }
  return path
}

/**
 * 轮询读取资源列表页数据，直到命中 predicate 为止；超时返回最后一次读到的数据。
 * 每次都用 mp.currentPage() 重新取页面，避免持有过期句柄。
 */
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

/** 轮询等待资源列表页进入目标状态，返回最终状态 */
async function waitForListState(mp, expect, timeoutMs = 12000) {
  const data = await waitForListData(mp, (d) => d.pageState === expect, timeoutMs)
  return data ? data.pageState : null
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
  while (info.len > 1 && guard < 6) {
    try {
      await mp.evaluate((d) => wx.navigateBack({ delta: d }), info.len - 1)
    } catch (e) {
      /* 工具层抛错时导航通常已生效，靠下面的轮询确认 */
    }
    await sleep(1200)
    info = await stackInfo(mp)
    guard++
  }
  // 最后一次返回同样要等过渡收尾，否则后续导航会被卡住
  await sleep(TRANSITION_SETTLE_MS)
  return info.routes[0]
}

/**
 * 返回页面栈中的指定页（按真实栈计算 delta，一次性返回到位）。
 *
 * 刻意不走 mp.navigateBack()，两个实测原因：
 *   1. automator 的实现是 `changeRoute('navigateBack')`，**不接受 delta**，且会在页面销毁
 *      瞬间抛 `Uncaught [object Object]`（实测：抛错时导航其实已经生效，属工具层问题）；
 *   2. `wx.navigateBack` **返回 success 是即时的，页面栈要到约 2 秒后才真正更新**
 *      （实测日志：连续三次 navigateBack 都报 success，三个页面才在 2 秒后集中 onUnload）。
 *      因此「读栈 → 判断 → 继续」会在过渡窗口里连发多次返回，直接冲过目标页——
 *      实测把「回资源列表」冲成了「回首页」。这里改为单次带 delta 的返回 + 轮询落位确认。
 */
async function goBackTo(mp, targetPath, notes) {
  // 先让可能仍在进行的路由过渡结束，避免在动画窗口内读栈
  await sleep(300)
  const info = await stackInfo(mp)
  const idx = info.routes.lastIndexOf(targetPath)
  if (idx < 0) {
    return info.routes.length ? info.routes[info.routes.length - 1] : null
  }

  const delta = info.routes.length - 1 - idx
  if (delta <= 0) {
    return targetPath
  }

  try {
    await mp.evaluate((d) => wx.navigateBack({ delta: d }), delta)
  } catch (e) {
    if (notes) notes.push(e && e.message ? e.message : String(e))
  }
  return waitForRouteSettled(mp, targetPath, 15000)
}

/**
 * 在 appservice 内调用当前页面方法。
 * 刻意不用 page.callMethod()：页面加载方法是 async，callMethod 会尝试序列化其返回的
 * Promise 容易报错；evaluate 里直接调用则只执行不返回。
 */
async function callPageMethod(mp, name) {
  return mp.evaluate((method) => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current[method]()
  }, name)
}

/**
 * 触发资源列表重新加载，并读回瞬时状态。
 * 同一次 evaluate 内「先调用再读状态」，中间没有往返间隙，可稳定捕获 loading 态
 * （若分两次往返，600ms 的加载窗口早过了）。
 */
async function loadListAndReadState(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    current.loadResources()
    return current.data.pageState
  })
}

/**
 * 让资源列表重新拉取一次数据并等待指定状态。
 * 刻意不使用 mp.reLaunch()（原因见文件头第 3 条），改用页面自身的加载方法触发。
 * 因为加载方法在同一次 evaluate 内已把状态置为 loading，这里不会命中「点击前的旧状态」。
 */
async function reloadList(mp, expect = 'success') {
  if ((await currentPath(mp)) !== LIST) {
    await mp.navigateTo(`/${LIST}`)
    await waitForPath(mp, LIST)
    await sleep(600)
  }
  await loadListAndReadState(mp)
  return waitForListState(mp, expect)
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
 * 统计某类元素在渲染层中的数量（XPath 位置谓词逐个探测）。
 * 每个元素都要过 xpathEl 的 tagName + 尺寸双重校验，否则第 n+1 个的占位对象会被误判为存在。
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

/** 读筛选栏全部项：文案 + class（用于判定激活项） */
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
 *
 * 判定条件必须同时满足「category 已变为目标值」与「pageState 为期望值」：
 * 只等 pageState 会命中点击前的旧值（见文件头第 5 条）。
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

/** 在首页找一个文案包含 label 的分类入口并点击 */
async function tapHomeCategory(mp, label) {
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
    await sleep(300)

    // ---------- 1. 从首页分类入口进入列表（带 category） ----------
    check('点击首页分类入口「自习室」', await tapHomeCategory(mp, '自习室'))
    const listPath = await waitForRouteSettled(mp, LIST)
    check('分类入口跳转到资源列表', listPath === LIST, String(listPath))

    let data = await waitForListData(
      mp,
      (d) => d.category === 'STUDY_ROOM' && d.pageState === 'success',
    )
    check(
      '列表页接收并归一化 category 参数',
      !!data && data.category === 'STUDY_ROOM',
      `category=${data ? data.category : 'null'}`,
    )

    // ---------- 2. 筛选栏渲染与激活态 ----------
    let page = await mp.currentPage()
    let items = await filterItems(page)
    check('筛选栏渲染 5 个筛选项（全部 + 4 类）', items.length === 5, `实际 ${items.length}`)
    check('筛选栏首项为「全部」', items.length > 0 && items[0].text === '全部', items.map((it) => it.text).join(' | '))
    check(
      '筛选栏包含 4 个资源类型',
      ['自习室', '研讨室', '摄影棚', '球场'].every((label) => items.some((it) => it.text === label)),
      items.map((it) => it.text).join(' | '),
    )
    check('从分类入口进入时对应筛选项为激活态', (await activeFilterLabel(page)) === '自习室')

    // ---------- 3. 分类筛选真实生效 ----------
    check('列表加载完成状态为 success', data.pageState === 'success', String(data.pageState))
    check('「自习室」筛选返回 2 条资源', data.resources.length === 2, `实际 ${data.resources.length}`)
    check(
      '返回结果全部为筛选类型（筛选真实下推到数据源，而非本地过滤）',
      data.resources.length > 0 && data.resources.every((r) => r.type === 'STUDY_ROOM'),
      data.resources.map((r) => r.type).join(','),
    )

    // ---------- 4. ResourceCard 列表计数与内容 ----------
    let cardCount = await countCardsByXPath(page, (i) => `(//view[@class="resource-card"])[${i}]`, 12)
    check(
      '渲染的卡片数与数据条数一致',
      cardCount === data.resources.length,
      `卡片=${cardCount} 数据=${data.resources.length}`,
    )

    const first = data.resources[0]
    const cardEl = await xpathEl(page, '//view[@class="resource-card"]')
    check('ResourceCard 组件真实渲染（xpath 穿透 + 尺寸校验）', cardEl !== null)
    if (cardEl) {
      const cardText = await cardEl.text()
      check(
        'ResourceCard 展示名称 / 类型 / 容量 / 地点',
        cardText.indexOf(first.name) >= 0 &&
          cardText.indexOf('自习室') >= 0 &&
          cardText.indexOf(`可容纳 ${first.capacity} 人`) >= 0 &&
          cardText.indexOf(first.location) >= 0,
        JSON.stringify(cardText),
      )
    }

    // ---------- 5. 切换到「全部」 ----------
    let res = await tapFilterAndWait(mp, '全部', '')
    check('点击筛选项「全部」', res.tapped)
    data = res.data
    check(
      '「全部」生效：筛选值为空串且结果覆盖 4 个类型',
      !!data &&
        data.category === '' &&
        ['STUDY_ROOM', 'SEMINAR_ROOM', 'STUDIO', 'COURT'].every((t) =>
          data.resources.some((r) => r.type === t),
        ),
      data
        ? `n=${data.resources.length} types=${Array.from(new Set(data.resources.map((r) => r.type))).join(',')}`
        : 'null',
    )
    check('「全部」返回 8 条资源', !!data && data.resources.length === 8, data ? `实际 ${data.resources.length}` : 'null')
    page = await mp.currentPage()
    check('切换到「全部」后激活态更新', (await activeFilterLabel(page)) === '全部', String(await activeFilterLabel(page)))
    cardCount = await countCardsByXPath(page, (i) => `(//view[@class="resource-card"])[${i}]`, 12)
    check('「全部」时渲染 8 张卡片', cardCount === 8, `实际 ${cardCount}`)

    // 重复点击当前筛选项应幂等：不重新发起请求，因此不会闪回 loading
    check('重复点击当前筛选项', await tapFilter(mp, '全部'))
    await sleep(300)
    data = await (await mp.currentPage()).data()
    check(
      '重复点击当前筛选项不重复请求（保持 success，不闪 loading）',
      data.pageState === 'success',
      `pageState=${data.pageState}`,
    )

    // ---------- 6. 逐一切换到其他分类 ----------
    const cases = [
      { label: '研讨室', type: 'SEMINAR_ROOM' },
      { label: '摄影棚', type: 'STUDIO' },
      { label: '球场', type: 'COURT' },
    ]
    for (const c of cases) {
      res = await tapFilterAndWait(mp, c.label, c.type)
      check(`点击筛选项「${c.label}」`, res.tapped)
      const d = res.data
      check(
        `「${c.label}」筛选生效（category 与结果类型一致且非空）`,
        !!d &&
          d.category === c.type &&
          d.resources.length > 0 &&
          d.resources.every((r) => r.type === c.type),
        d ? `category=${d.category} n=${d.resources.length} types=${d.resources.map((r) => r.type).join(',')}` : 'null',
      )
      page = await mp.currentPage()
      check(`「${c.label}」筛选项为激活态`, (await activeFilterLabel(page)) === c.label)
    }

    // ---------- 7. 点击卡片进入详情 ----------
    // 必须重新读当前页面数据：外层残留的 data 还是「全部」那次的结果，
    // 而页面此时展示的是最后一个筛选（球场），直接用会断言到错误的 id。
    const currentList = await waitForListData(
      mp,
      (d) => d.pageState === 'success' && d.resources.length > 0,
    )
    const target = currentList.resources[0]
    const tapCard = await xpathEl(page, '//view[@class="resource-card"]')
    check('列表页卡片可点击', tapCard !== null)
    const backNotes = []
    if (tapCard) {
      await tapCard.tap()
      const detailPath = await waitForRouteSettled(mp, DETAIL)
      check('点击列表卡片跳转到资源详情', detailPath === DETAIL, String(detailPath))
      const detailData = await (await mp.currentPage()).data()
      check(
        '详情页接收到正确的资源 id',
        detailData.resourceId === target.id && detailData.hasValidId === true,
        `resourceId=${detailData.resourceId} 期望=${target.id}`,
      )
      await goBackTo(mp, LIST, backNotes)
      const afterBack = await currentPath(mp)
      check('从详情页返回资源列表', afterBack === LIST, String(afterBack))
      const afterInfo = await stackInfo(mp)
      check(
        '返回后页面栈深度为 2（点击卡片未重复跳转）',
        afterInfo.len === 2,
        JSON.stringify(afterInfo.routes),
      )
      await sleep(600)
    }
    check('返回过程未出现 automator 工具层异常', backNotes.length === 0, backNotes.join(' | '))

    // ---------- 8. loading 态 ----------
    check('返回后停留页为资源列表', (await currentPath(mp)) === LIST, String(await currentPath(mp)))
    page = await mp.currentPage()
    const loadingState = await loadListAndReadState(mp)
    check('触发加载后立即进入 loading 态', loadingState === 'loading', String(loadingState))
    const loadingText = await xpathText(page, '//view[@class="loading-state"]')
    check(
      'loading 态渲染 loading-state 组件',
      loadingText !== null && loadingText.indexOf('正在加载资源') >= 0,
      JSON.stringify(loadingText),
    )
    check('loading 态下不渲染 error-state', (await xpathEl(page, '//view[@class="error-state"]')) === null)
    check('loading 态下筛选栏仍在（不整页替换）', (await filterItems(page)).length === 5)
    const settled = await waitForListData(mp, (d) => d.pageState === 'success')
    check('加载完成后回到 success', !!settled && settled.pageState === 'success', settled ? settled.pageState : 'null')

    // ---------- 9. 下拉刷新 ----------
    // 真实下拉手势 automator 无法模拟，直接触发页面回调验证其逻辑；
    // 判定标准是「数据源变化能反映到页面」，以此证明刷新真的重新发起请求而非空转。
    await setMockMode(mp, 'empty')
    await callPageMethod(mp, 'onPullDownRefresh')
    let state = await waitForListState(mp, 'empty')
    check('下拉刷新重新拉取数据（数据源变空后落到 empty）', state === 'empty', String(state))

    // ---------- 10. empty 态：「全部」与「某分类」文案分流 ----------
    // 上一节结束时筛选条件停留在「球场」，需先切回「全部」才能验证全量空态文案
    res = await tapFilterAndWait(mp, '全部', '', 'empty')
    check('空数据源下切回筛选项「全部」', res.tapped)
    data = res.data
    check('「全部」为空时文案为「暂无资源」', !!data && data.emptyText === '暂无资源', data ? JSON.stringify(data.emptyText) : 'null')
    check('empty 态清空资源列表', !!data && data.resources.length === 0, data ? `实际 ${data.resources.length}` : 'null')
    page = await mp.currentPage()
    const emptyText = await xpathText(page, '//view[@class="empty-state"]')
    check(
      'empty-state 组件真实渲染且含重新加载入口',
      emptyText !== null && emptyText.indexOf('暂无资源') >= 0 && emptyText.indexOf('重新加载') >= 0,
      JSON.stringify(emptyText),
    )
    check('empty 态下筛选栏仍可用', (await filterItems(page)).length === 5)

    // 切到具体分类：文案应变化，且不再给出注定无效的「重新加载」按钮
    res = await tapFilterAndWait(mp, '自习室', 'STUDY_ROOM', 'empty')
    check('点击筛选项「自习室」', res.tapped)
    data = res.data
    check(
      '分类为空时文案切换为「暂无自习室」并引导换分类',
      !!data && data.emptyText === '暂无自习室' && data.emptyActionText === '',
      data ? `emptyText=${JSON.stringify(data.emptyText)} actionText=${JSON.stringify(data.emptyActionText)}` : 'null',
    )
    page = await mp.currentPage()
    check(
      '分类为空时不渲染注定无效的操作按钮',
      (await xpathEl(page, '//view[@class="empty-state__action"]')) === null,
    )

    // ---------- 11. 恢复数据源并验证刷新链路 ----------
    await setMockMode(mp, 'success')
    await callPageMethod(mp, 'onPullDownRefresh')
    data = await waitForListData(mp, (d) => d.pageState === 'success')
    check(
      '再次下拉刷新恢复 success 且筛选条件保持',
      !!data && data.category === 'STUDY_ROOM' && data.resources.length === 2,
      data ? `state=${data.pageState} category=${data.category} n=${data.resources.length}` : 'null',
    )

    // ---------- 12. error 态与重试恢复 ----------
    await setMockMode(mp, 'error')
    state = await reloadList(mp, 'error')
    check('接口失败时落到 error 态', state === 'error', String(state))
    page = await mp.currentPage()
    data = await page.data()
    check(
      'error 态写入错误提示',
      typeof data.errorMessage === 'string' && data.errorMessage.length > 0,
      JSON.stringify(data.errorMessage),
    )
    const errMessage = data.errorMessage
    const errText = await xpathText(page, '//view[@class="error-state"]')
    check(
      'error-state 组件展示失败原因',
      errText !== null && errMessage && errText.indexOf(errMessage) >= 0,
      JSON.stringify(errText),
    )
    check('error 态下不渲染 loading-state', (await xpathEl(page, '//view[@class="loading-state"]')) === null)
    check('error 态下筛选栏仍可用', (await filterItems(page)).length === 5)

    // 恢复数据源但让页面停留在 error 态，验证 retry 事件链路真的重新拉取
    await setMockMode(mp, 'success')
    const retryBtn = await xpathEl(page, '//view[@class="error-state__action"]')
    check('error-state 渲染重试按钮', retryBtn !== null)
    if (retryBtn) {
      await retryBtn.tap()
      data = await waitForListData(mp, (d) => d.pageState === 'success')
      check(
        '点击重试后重新加载并恢复 success',
        !!data && data.resources.length === 2,
        data ? `state=${data.pageState} n=${data.resources.length}` : 'null',
      )
    }

    // ---------- 13. 非法 category 参数归一化 ----------
    // 列表页的筛选条件不满足不构成「无事可做」，应降级为「全部」而不是错误态
    const beforeInfo = await stackInfo(mp)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/resource-list/resource-list?category=NOT_A_TYPE' }))
    await waitForRouteSettled(mp, LIST)
    // 目标路由与当前相同，所以要额外等新实例真正入栈（栈深度 +1），
    // 否则 waitForListData 会读到旧实例（category 仍是 STUDY_ROOM）而误判
    const t13 = Date.now()
    let stackNow = await stackInfo(mp)
    while (stackNow.len <= beforeInfo.len && Date.now() - t13 < 12000) {
      await sleep(300)
      stackNow = await stackInfo(mp)
    }
    check('非法参数以新页面实例打开', stackNow.len === beforeInfo.len + 1, JSON.stringify(stackNow.routes))

    data = await waitForListData(
      mp,
      (d) => d.category === '' && d.pageState === 'success' && d.resources.length === 8,
    )
    check(
      '非法 category 参数被归一化为「全部」',
      !!data && data.category === '',
      `category=${data ? JSON.stringify(data.category) : 'null'}`,
    )
    check(
      '非法参数不导致错误态，且展示全部资源',
      !!data && data.pageState === 'success' && data.resources.length === 8,
      data ? `pageState=${data.pageState} n=${data.resources.length}` : 'null',
    )
    page = await mp.currentPage()
    check('非法参数下激活项为「全部」', (await activeFilterLabel(page)) === '全部', String(await activeFilterLabel(page)))

    // ---------- 14. 收尾 ----------
    await clearMockMode(mp)
    state = await reloadList(mp, 'success')
    check('收尾恢复默认数据源后列表正常', state === 'success', String(state))
    await goBackTo(mp, HOME, backNotes)
    const finalPath = await currentPath(mp)
    check('测试结束回到首页', finalPath === HOME, String(finalPath))
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
