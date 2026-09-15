/**
 * CampusReserve Phase 4 端到端测试（资源详情与时间选择）—— 在真实微信开发者工具中运行
 *
 * 用法：
 *   1) 先启动自动化模式：
 *      cli.bat auto --project "E:\WORK\CampusReserve\CampusReserve" --auto-port 9420
 *   2) 再执行：
 *      node e2e-phase4.js ws://127.0.0.1:9420
 *
 * 覆盖：资源信息渲染（图片占位 / 名称 / 类型 / 容量 / 地点 / 描述）、日期条 7 天与激活态、
 *       默认日期时段三态与「已过时判定」、切换日期真实重新请求、选择与取消选择时段、
 *       不可预约时段不可选、跨日期清空选择、预约按钮状态与点击反馈、
 *       时间段区四种状态（success / empty / error / full）、资源信息区 error 与「资源不存在」、
 *       非法 id 参数兜底。
 *
 * 六条实测结论（不遵守会误判），与 e2e-phase3.js 同源：
 *   1. page.$() / page.$$() 只能查页面自身节点，无法进入自定义组件内部，
 *      连 <time-slot> / <empty-state> 这类组件标签本身都查不到；组件内部断言必须走 page.xpath()。
 *   2. page.xpath() 未命中时「不返回 null」，而是返回 tagName 为 undefined、
 *      尺寸 0x0 的占位对象。判定存在必须同时检查 tagName 与尺寸，见 xpathEl()。
 *   3. mp.reLaunch() 会让 automator 内部抛错，全程避免；改用页面自身的加载方法触发。
 *   4. 统计渲染层元素数量用 XPath 位置谓词 `(//x)[n]` 逐个探测；页面实例的
 *      selectAllComponents() 不可用于计数（evaluate 上下文中恒返回 0）。
 *   5. 导航之间必须留出过渡收尾期（约 1.2 秒），否则模拟器会把路由过渡卡死约 10 秒，
 *      见 waitForRouteSettled()。多级返回用 wx.navigateBack({ delta })，见 goBackTo()。
 *   6. 点击交互后不能只等状态字段变回原值再断言（点击前本就处于原值，会读到上一步的数据）；
 *      必须轮询到「目标字段已变为期望值 且 状态为期望值」。
 *
 * 另有三条本阶段新增的注意点（时段卡片是自定义组件，不遵守会误判）：
 *   1. 时段组件根节点的 class 带修饰符（`time-slot--disabled` / `time-slot--selected`），
 *      空插值还会留下多余空格，**不要用 @class 精确匹配定位时段**。用
 *      `contains(@class,"time-slot") and not(contains(@class,"time-slot__"))`：
 *      `not(...)` 用来排除子元素 `time-slot__label` / `time-slot__status`。
 *   2. **点击必须落在组件根节点上**。automator 的 `element.tap()` 只把事件派发给该节点，
 *      不是「按坐标点一下」；点在页面自己的外层包裹节点（如 `.slots__item`）上，
 *      组件内部的 bindtap 不会触发，表现为「点了没反应」——
 *      实测因此误报 8 项（选中状态、按钮状态、摘要文案全部随之失败）。
 *   3. **`text()` 不穿透组件边界聚合内容**。页面节点里放着组件时，读页面节点的 text()
 *      得到空串（内容在组件自己的树里）。要读组件内文案，必须查组件根节点或组件内节点。
 *      这也是 e2e-phase3.js 里 `resource-card` 能取到整条文案的原因——它查的正是组件根节点。
 */
const automator = require('miniprogram-automator')

const wsEndpoint = process.argv[2] || 'ws://127.0.0.1:9420'

/** 与小程序端 services/config.ts 保持一致 */
const MOCK_MODE_KEY = 'CR_MOCK_MODE'
const MOCK_AVAIL_MODE_KEY = 'CR_MOCK_AVAIL_MODE'

const HOME = 'pages/index/index'
const DETAIL = 'pages/resource-detail/resource-detail'

/** 被测资源：mock 数据源中的固定一条 */
const RESOURCE_ID = 1

/** 日期条展示天数，与页面 DATE_RANGE_DAYS 一致 */
const DATE_RANGE_DAYS = 7

/** 时段槽位数量，与 mock 的 MOCK_SLOT_TEMPLATE 一致 */
const SLOT_COUNT = 6

const VALID_SLOT_STATUS = ['AVAILABLE', 'BOOKED', 'DISABLED']
const VALID_STATUS_LABELS = ['可预约', '已约满', '不可预约']

/** 时段组件根节点：class 带修饰符，用 contains + not 精确定位，且排除子元素（子元素是 `time-slot__xxx`） */
const SLOT_ROOT = (i) =>
  `(//view[contains(@class,"time-slot") and not(contains(@class,"time-slot__"))])[${i}]`
/** 选中态标记；contains 匹配不会命中子元素（子元素 class 无 `--` 修饰符） */
const SELECTED_MARK = '//view[contains(@class,"time-slot--selected")]'
const DISABLED_MARK = (i) => `(//view[contains(@class,"time-slot--disabled")])[${i}]`

const results = []
let failed = 0

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** `HH:mm` → 当天分钟数；格式非法返回 -1 */
function toMinutes(value) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(value || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1
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

/** 路由过渡的收尾静默期，理由见文件头第 5 条 */
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

/** 统计元素数量（XPath 位置谓词逐个探测） */
async function countByXPath(page, xpathOf, max = 20) {
  let n = 0
  for (let i = 1; i <= max; i++) {
    const el = await xpathEl(page, xpathOf(i))
    if (!el) break
    n++
  }
  return n
}

/** 轮询读取详情页数据，直到命中 predicate；超时返回最后一次读到的数据 */
async function waitForDetailData(mp, predicate, timeoutMs = 12000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === DETAIL) {
      const data = await page.data()
      last = data
      if (predicate(data)) return data
    }
    await sleep(250)
  }
  return last
}

async function waitForDetailState(mp, expect, timeoutMs = 12000) {
  const data = await waitForDetailData(mp, (d) => d.slotState === expect, timeoutMs)
  return data ? data.slotState : null
}

/**
 * 轮询 automator 的 currentPage，直到它的 data 命中 predicate。
 *
 * 用于「同一路由的新页面实例」场景（例如用不同 id 再次打开详情页）：
 * 此时路由名不变，仅靠 waitForPath 无法区分新旧实例，而 automator 的 currentPage
 * 在页面栈刚变化时可能仍指向旧实例。用 data 作为判定条件可以等它切换过来。
 */
async function waitForTopPageData(mp, predicate, timeoutMs = 12000) {
  const t0 = Date.now()
  let lastData = null
  let lastPage = null
  while (Date.now() - t0 < timeoutMs) {
    const page = await mp.currentPage()
    if (page && page.path === DETAIL) {
      const data = await page.data()
      lastData = data
      lastPage = page
      if (predicate(data)) {
        return { page, data }
      }
    }
    await sleep(250)
  }
  return { page: lastPage, data: lastData }
}

/** 在 appservice 内调用当前页面方法（不用 callMethod：async 方法的 Promise 无法序列化） */
async function callPageMethod(mp, name) {
  return mp.evaluate((method) => {
    const pages = getCurrentPages()
    pages[pages.length - 1][method]()
  }, name)
}

/** 进入资源详情页 */
async function openDetail(mp, id) {
  await mp.evaluate((rid) => wx.navigateTo({ url: `/pages/resource-detail/resource-detail?id=${rid}` }), id)
  return waitForRouteSettled(mp, DETAIL)
}

/** 读日期条：文案 + class（用于判定激活项） */
async function dateItems(page) {
  const els = await page.$$('.date-bar__item')
  const out = []
  for (const el of els) {
    out.push({
      text: ((await el.text()) || '').trim(),
      cls: (await el.attribute('class')) || '',
    })
  }
  return out
}

async function activeDateIndex(page) {
  const items = await dateItems(page)
  return items.findIndex((it) => it.cls.indexOf('date-bar__item--active') >= 0)
}

/**
 * 点击第 index 个日期并等待该日期的时间段加载完成。
 *
 * 判定条件必须同时满足「selectedDate 已变为目标值」与「slotState 为期望值」：
 * 只等 slotState 会命中点击前的旧值（见文件头第 6 条）。
 */
async function tapDateAndWait(mp, index, expectDate, expectState = 'success', timeoutMs = 12000) {
  const page = await mp.currentPage()
  const els = await page.$$('.date-bar__item')
  if (!els[index]) return { tapped: false, data: null }
  await els[index].tap()
  const data = await waitForDetailData(
    mp,
    (d) => d.selectedDate === expectDate && d.slotState === expectState,
    timeoutMs,
  )
  return { tapped: true, data }
}

/** 取渲染层中第 n 个时段（n 从 1 开始）并点击 */
async function tapSlotByXPathIndex(mp, n) {
  const page = await mp.currentPage()
  const el = await xpathEl(page, SLOT_ROOT(n))
  if (!el) return false
  await el.tap()
  await sleep(400)
  return true
}

/** 注入 / 清除开发期数据源模式 */
async function setMockMode(mp, mode) {
  await mp.evaluate((key, value) => wx.setStorageSync(key, value), MOCK_MODE_KEY, mode)
}
async function clearMockMode(mp) {
  await mp.evaluate((key) => wx.removeStorageSync(key), MOCK_MODE_KEY)
}
async function setAvailMode(mp, mode) {
  await mp.evaluate((key, value) => wx.setStorageSync(key, value), MOCK_AVAIL_MODE_KEY, mode)
}
async function clearAvailMode(mp) {
  await mp.evaluate((key) => wx.removeStorageSync(key), MOCK_AVAIL_MODE_KEY)
}

/**
 * 调用页面 onSubmit 并截获 showToast / showModal。
 *
 * 小程序 toast 与 modal 都由客户端渲染，自动化层拿不到；这里在 appservice 内临时替换
 * `wx.showToast` / `wx.showModal`，用「是否弹出提示、提示内容是什么」来断言按钮的点击反馈，
 * 测完立即还原。**不触发 modal 的 success 回调**——否则确认后会跳到登录页，打乱后续流程。
 * 返回值 patched=false 表示替换失败（此时捕获结果不可信，断言会给出说明）。
 *
 * 为什么要同时看两者：Phase 5 起未登录用户点预约会先弹「需要登录」引导（属正确的产品行为），
 * 只有已登录才会走「功能即将开放」的 toast，单看 toast 会把正常行为误判为「点击无反馈」。
 */
async function callSubmitAndReadFeedback(mp) {
  return mp.evaluate(() => {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    let toast = null
    let modalTitle = null
    let patched = false
    const originalToast = wx.showToast
    const originalModal = wx.showModal
    try {
      wx.showToast = function (options) {
        toast = (options && options.title) || ''
      }
      wx.showModal = function (options) {
        modalTitle = (options && options.title) || ''
      }
      patched = wx.showToast !== originalToast && wx.showModal !== originalModal
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
      patched,
      canSubmit: current.data.canSubmit,
      submitText: current.data.submitText,
    }
  })
}

/** 时段状态统计，供多处断言复用 */
function slotStats(slots) {
  const stats = { AVAILABLE: 0, BOOKED: 0, DISABLED: 0, invalid: 0 }
  for (const slot of slots || []) {
    if (VALID_SLOT_STATUS.indexOf(slot.status) >= 0) {
      stats[slot.status]++
    } else {
      stats.invalid++
    }
  }
  return stats
}

/** 第一个可预约时段的下标（1 基，便于直接拼 XPath）；没有则返回 0 */
function firstAvailableIndex(slots) {
  const idx = (slots || []).findIndex((s) => s.status === 'AVAILABLE')
  return idx < 0 ? 0 : idx + 1
}

/** 第一个不可预约（BOOKED / DISABLED）时段的下标（1 基）；没有则返回 0 */
function firstUnavailableIndex(slots) {
  const idx = (slots || []).findIndex((s) => s.status !== 'AVAILABLE')
  return idx < 0 ? 0 : idx + 1
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
    await sleep(300)

    // ---------- 1. 进入资源详情 ----------
    const detailPath = await openDetail(mp, RESOURCE_ID)
    check('可进入资源详情页', detailPath === DETAIL, String(detailPath))

    let data = await waitForDetailData(mp, (d) => d.pageState === 'success' && d.slotState === 'success')
    check('资源详情加载成功', !!data && data.pageState === 'success', data ? String(data.pageState) : 'null')
    check(
      '详情页接收到正确的资源 id',
      !!data && data.resourceId === RESOURCE_ID && data.hasValidId === true,
      data ? `resourceId=${data.resourceId}` : 'null',
    )

    let page = await mp.currentPage()

    // ---------- 2. 图片展示与资源信息 ----------
    // mock 数据源刻意不提供 imageUrl（避免测试依赖网络图片），故此处展示类型占位块；
    // 有图分支与占位分支同时在 WXML 中，占位块的渲染证明图片区域已就位。
    const placeholder = await xpathText(page, '//view[@class="detail-hero__placeholder"]')
    check(
      '无图片时渲染类型占位块（非空白块）',
      placeholder !== null && placeholder === data.typeLabel && placeholder.length > 0,
      JSON.stringify(placeholder),
    )
    check(
      '占位块展示的类型与资源类型一致',
      !!(data.resource && data.typeLabel && data.resource.type) &&
        data.typeLabel === '自习室' &&
        data.resource.type === 'STUDY_ROOM',
      data.resource ? `type=${data.resource.type} label=${data.typeLabel}` : 'null',
    )

    const infoText = await xpathText(page, '//view[@class="cr-section info"]')
    check(
      '资源信息展示名称 / 类型 / 容量 / 地点 / 描述',
      !!data.resource &&
        infoText !== null &&
        infoText.indexOf(data.resource.name) >= 0 &&
        infoText.indexOf(data.typeLabel) >= 0 &&
        infoText.indexOf(`可容纳 ${data.resource.capacity} 人`) >= 0 &&
        infoText.indexOf(data.resource.location) >= 0 &&
        infoText.indexOf(data.resource.description) >= 0,
      JSON.stringify(infoText),
    )

    // ---------- 3. 日期条 ----------
    let items = await dateItems(page)
    check(`日期条渲染 ${DATE_RANGE_DAYS} 天`, items.length === DATE_RANGE_DAYS, `实际 ${items.length}`)
    check(
      '日期条首项为今天',
      !!data.dateOptions && data.dateOptions.length === DATE_RANGE_DAYS && data.dateOptions[0].isToday === true,
      data.dateOptions ? JSON.stringify(data.dateOptions[0]) : 'null',
    )
    check('默认选中今天', data.selectedDate === data.dateOptions[0].value, String(data.selectedDate))
    check('默认日期为激活态', (await activeDateIndex(page)) === 0, String(await activeDateIndex(page)))

    // ---------- 4. 默认日期的时间段与三态 ----------
    check(`默认日期渲染 ${SLOT_COUNT} 个时段`, data.slots.length === SLOT_COUNT, `实际 ${data.slots.length}`)
    check(
      '渲染层时段个数与数据一致（TimeSlot 组件真实渲染）',
      (await countByXPath(page, SLOT_ROOT, 12)) === data.slots.length,
      `渲染 ${await countByXPath(page, SLOT_ROOT, 12)} 数据 ${data.slots.length}`,
    )

    let stats = slotStats(data.slots)
    check(
      '所有时段状态取值合法',
      stats.invalid === 0,
      `AVAILABLE=${stats.AVAILABLE} BOOKED=${stats.BOOKED} DISABLED=${stats.DISABLED} invalid=${stats.invalid}`,
    )

    const firstSlotText = await xpathText(page, SLOT_ROOT(1))
    check(
      '时段卡片展示时段文案与状态文案',
      firstSlotText !== null &&
        firstSlotText.indexOf(data.slots[0].startTime) >= 0 &&
        VALID_STATUS_LABELS.some((label) => firstSlotText.indexOf(label) >= 0),
      JSON.stringify(firstSlotText),
    )

    // 已过时判定：今天是今天，则开始时间不晚于当前时间的时段必须为 DISABLED。
    // 时段开始时间与「现在」相差 2 分钟以内的跳过（加载耗时可能跨过判定边界）。
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const clockMismatch = data.slots.filter((slot) => {
      const start = toMinutes(slot.startTime)
      if (start < 0 || Math.abs(start - nowMinutes) <= 2) return false
      return (slot.status === 'DISABLED') !== (start <= nowMinutes)
    })
    check(
      '今天的时段按当前时间判定「不可预约」（开始时间已过即不可约）',
      clockMismatch.length === 0,
      clockMismatch.map((s) => `${s.startTime}=${s.status}`).join(', ') || `now=${nowMinutes}min`,
    )

    const renderedDisabled = await countByXPath(page, DISABLED_MARK, 12)
    check(
      '不可用时段在渲染层带不可用样式',
      renderedDisabled === stats.BOOKED + stats.DISABLED,
      `渲染 ${renderedDisabled} 数据 ${stats.BOOKED + stats.DISABLED}`,
    )

    // 提示文案与「是否存在可预约时段」双向绑定
    const hasAvailable = stats.AVAILABLE > 0
    check(
      '无可预约时段时给出提示，有时段可约时不提示',
      (data.slotHint || '') === (hasAvailable ? '' : data.slotHint) &&
        (hasAvailable ? data.slotHint === '' : data.slotHint.length > 0),
      `hint=${JSON.stringify(data.slotHint)} available=${stats.AVAILABLE}`,
    )

    // ---------- 5. 切换日期 ----------
    const todayValue = data.dateOptions[0].value
    const tomorrowValue = data.dateOptions[1].value
    let     res = await tapDateAndWait(mp, 1, tomorrowValue)
    check('点击日期条第 2 天', res.tapped)
    data = res.data
    page = await mp.currentPage()
    check(
      '切换日期后重新请求该日期的时间段（selectedDate 更新且落到 success）',
      !!data && data.selectedDate === tomorrowValue && data.slotState === 'success',
      data ? `date=${data.selectedDate} state=${data.slotState}` : 'null',
    )
    check('切换日期后日期条激活项跟随', (await activeDateIndex(page)) === 1, String(await activeDateIndex(page)))
    check(
      '切换到明天后时段数不变',
      data.slots.length === SLOT_COUNT,
      `实际 ${data.slots.length}`,
    )

    stats = slotStats(data.slots)
    check('明天的时段没有「已过时」项', stats.DISABLED === 0, `DISABLED=${stats.DISABLED}`)
    check(
      '明天同时存在可预约与已约满时段（三态可被观察到）',
      stats.AVAILABLE > 0 && stats.BOOKED > 0,
      `AVAILABLE=${stats.AVAILABLE} BOOKED=${stats.BOOKED}`,
    )
    check('明天有可预约时段时不显示提示', data.slotHint === '', JSON.stringify(data.slotHint))

    // ---------- 6. 选择与取消选择 ----------
    let availIdx = firstAvailableIndex(data.slots)
    check('明天存在可选时段用于选择测试', availIdx > 0, `下标=${availIdx}`)
    const targetSlot = data.slots[availIdx - 1]

    check('点击一个可预约时段', await tapSlotByXPathIndex(mp, availIdx))
    data = await waitForDetailData(mp, (d) => d.selectedSlot !== null)
    check(
      '选中时段被记录（页面持有选择状态）',
      !!data && !!data.selectedSlot &&
        data.selectedSlot.startTime === targetSlot.startTime &&
        data.selectedSlot.endTime === targetSlot.endTime,
      data && data.selectedSlot ? `${data.selectedSlot.startTime}-${data.selectedSlot.endTime}` : 'null',
    )
    check('选中后预约按钮可点击', data.canSubmit === true, String(data.canSubmit))
    check(
      '预约按钮文案包含已选时段',
      data.submitText === `预约 ${targetSlot.startTime}-${targetSlot.endTime}`,
      JSON.stringify(data.submitText),
    )
    page = await mp.currentPage()
    check('选中时段在渲染层带选中样式', (await xpathEl(page, SELECTED_MARK)) !== null)
    const selectedText = await xpathText(page, SLOT_ROOT(availIdx))
    check(
      '选中时段展示状态文案「可预约」',
      selectedText !== null && selectedText.indexOf('可预约') >= 0,
      JSON.stringify(selectedText),
    )
    const summaryText = await xpathText(page, '//view[@class="submit__summary"]')
    check(
      '预约区展示已选时段摘要',
      summaryText !== null && summaryText.indexOf(`${targetSlot.startTime}-${targetSlot.endTime}`) >= 0,
      JSON.stringify(summaryText),
    )

    // 再次点击同一时段 = 取消选择
    check('再次点击同一时段', await tapSlotByXPathIndex(mp, availIdx))
    data = await waitForDetailData(mp, (d) => d.selectedSlot === null)
    check('再次点击同一时段取消选择', !!data && data.selectedSlot === null, data && data.selectedSlot ? 'still selected' : 'null')
    check('取消选择后按钮回到禁用', data.canSubmit === false, String(data.canSubmit))
    check('取消选择后按钮文案回到初始', data.submitText === '请选择时间段', JSON.stringify(data.submitText))
    page = await mp.currentPage()
    check('取消选择后渲染层无选中样式', (await xpathEl(page, SELECTED_MARK)) === null)

    // 不可预约的时段不可选
    const badIdx = firstUnavailableIndex(data.slots)
    check('存在不可预约时段用于负向测试', badIdx > 0, `下标=${badIdx}`)
    if (badIdx > 0) {
      check('点击一个不可预约时段', await tapSlotByXPathIndex(mp, badIdx))
      data = await waitForDetailData(mp, (d) => d.slotState === 'success')
      check(
        '点击已约满 / 不可预约时段不被选中（需求 §4.4 只能选 AVAILABLE）',
        !!data && data.selectedSlot === null && data.canSubmit === false,
        data ? `selected=${data.selectedSlot ? 'yes' : 'null'} canSubmit=${data.canSubmit}` : 'null',
      )
    }

    // 重新选上，供后续按钮测试使用
    check('重新选择一个可预约时段', await tapSlotByXPathIndex(mp, availIdx))
    data = await waitForDetailData(mp, (d) => d.selectedSlot !== null)
    check('重新选择后按钮可点击', !!data && data.canSubmit === true, data ? String(data.canSubmit) : 'null')

    // ---------- 7. 预约按钮点击反馈 ----------
    // 未选择时不弹提示（按钮处于禁用态时不应有任何反馈）
    await mp.evaluate(() => {
      const pages = getCurrentPages()
      pages[pages.length - 1].setData({ selectedSlot: null })
      pages[pages.length - 1].applySubmitState()
    })
    await sleep(400)
    let toast = await callSubmitAndReadFeedback(mp)
    check(
      '未选时段时按钮禁用且点击无反馈',
      toast.patched && toast.canSubmit === false && toast.toast === null && toast.modalTitle === null,
      JSON.stringify(toast),
    )

    // 选中后按钮进入可点击态并给出正确文案
    // （点击后的业务行为——未登录时的登录引导、已登录时的真实提交——属于 Phase 5 / Phase 6，
    //  分别见 e2e-phase5.js / e2e-phase6.js，本阶段只负责按钮状态本身）
    check('再选一个可预约时段', await tapSlotByXPathIndex(mp, availIdx))
    data = await waitForDetailData(mp, (d) => d.selectedSlot !== null)
    check('按钮重新变为可点击', !!data && data.canSubmit === true, data ? String(data.canSubmit) : 'null')
    check(
      '选中后按钮文案为「预约 HH:mm-HH:mm」',
      !!data &&
        typeof data.submitText === 'string' &&
        /^预约 \d{2}:\d{2}-\d{2}:\d{2}$/.test(data.submitText),
      data ? String(data.submitText) : 'null',
    )

    // ---------- 8. 跨日期清空选择 ----------
    check('回去再切到明天之前，先选中的时段存在', data.selectedSlot !== null)
    res = await tapDateAndWait(mp, 0, todayValue)
    check('切换到今天（不假定今天一定有时段可约）', res.tapped)
    res = await tapDateAndWait(mp, 1, tomorrowValue)
    data = res.data
    check(
      '切换日期后已选时段被清空（避免提交出用户未选择的组合）',
      !!data && data.selectedSlot === null && data.canSubmit === false,
      data ? `selected=${data.selectedSlot ? 'yes' : 'null'} canSubmit=${data.canSubmit}` : 'null',
    )

    // ---------- 9. 全部约满（full）：按钮保持禁用 ----------
    await setAvailMode(mp, 'full')
    res = await tapDateAndWait(mp, 2, data.dateOptions[2].value)
    data = res.data
    stats = slotStats(data.slots)
    check(
      '全部约满时仍展示全部时段（不落到空态）',
      !!data && data.slotState === 'success' && data.slots.length === SLOT_COUNT && stats.BOOKED === SLOT_COUNT,
      data ? `state=${data.slotState} n=${data.slots.length} booked=${stats.BOOKED}` : 'null',
    )
    check('全部约满时预约按钮保持禁用', data.canSubmit === false, String(data.canSubmit))
    check(
      '全部约满时给出提示',
      typeof data.slotHint === 'string' && data.slotHint.length > 0,
      JSON.stringify(data.slotHint),
    )
    page = await mp.currentPage()
    check(
      '全部约满时渲染层无可选样式',
      (await countByXPath(page, DISABLED_MARK, 12)) === SLOT_COUNT,
      String(await countByXPath(page, DISABLED_MARK, 12)),
    )
    check('点击约满的时段仍不被选中', await tapSlotByXPathIndex(mp, 1))
    data = await waitForDetailData(mp, (d) => d.slotState === 'success')
    check('全部约满时点击后仍未选中', data.selectedSlot === null && data.canSubmit === false, JSON.stringify({
      selected: !!data.selectedSlot,
      canSubmit: data.canSubmit,
    }))

    // ---------- 10. 该日期无时段（none） ----------
    await setAvailMode(mp, 'none')
    res = await tapDateAndWait(mp, 3, data.dateOptions[3].value, 'empty')
    data = res.data
    check(
      '该日期无时段时落到时间段空态',
      !!data && data.slotState === 'empty' && data.slots.length === 0,
      data ? `state=${data.slotState} n=${data.slots.length}` : 'null',
    )
    page = await mp.currentPage()
    const emptyText = await xpathText(page, '//view[@class="empty-state"]')
    check(
      '时间段空态渲染 empty-state 并说明请换日期',
      emptyText !== null && emptyText.indexOf('请选择其他日期') >= 0,
      JSON.stringify(emptyText),
    )
    check('时间段空态下不渲染任何时段', (await countByXPath(page, SLOT_ROOT, 12)) === 0)
    check(
      '时间段空态下日期条仍可用（静态内容，不整页替换）',
      (await dateItems(page)).length === DATE_RANGE_DAYS,
      String((await dateItems(page)).length),
    )
    check('时间段空态下资源信息仍在', (await xpathEl(page, '//view[@class="cr-section info"]')) !== null)

    // ---------- 11. 时间段接口失败（error）与重试恢复 ----------
    await setAvailMode(mp, 'error')
    res = await tapDateAndWait(mp, 4, data.dateOptions[4].value, 'error')
    data = res.data
    check('时间段请求失败落到时间段错误态', !!data && data.slotState === 'error', data ? String(data.slotState) : 'null')
    check(
      '时间段错误态写入错误提示',
      typeof data.slotError === 'string' && data.slotError.length > 0,
      JSON.stringify(data.slotError),
    )
    const slotError = data.slotError
    page = await mp.currentPage()
    const slotErrorText = await xpathText(page, '//view[@class="error-state"]')
    check(
      'error-state 展示失败原因',
      slotErrorText !== null && slotErrorText.indexOf(slotError) >= 0,
      JSON.stringify(slotErrorText),
    )
    check('时间段错误态下不渲染时段', (await countByXPath(page, SLOT_ROOT, 12)) === 0)
    check(
      '时间段失败不影响资源信息与日期条（两区状态独立）',
      (await xpathEl(page, '//view[@class="cr-section info"]')) !== null &&
        (await dateItems(page)).length === DATE_RANGE_DAYS,
    )

    // 恢复数据源，点击重试应重新拉取当前日期并回到 success
    await setAvailMode(mp, 'default')
    const retryBtn = await xpathEl(page, '//view[@class="error-state__action"]')
    check('时间段错误态渲染重试按钮', retryBtn !== null)
    if (retryBtn) {
      await retryBtn.tap()
      const state = await waitForDetailState(mp, 'success')
      data = await waitForDetailData(mp, (d) => d.slotState === 'success' && d.slots.length === SLOT_COUNT)
      check(
        '点击重试后重新拉取并恢复 success',
        state === 'success' && !!data && data.slots.length === SLOT_COUNT,
        `state=${state} n=${data ? data.slots.length : 'null'}`,
      )
    }

    await clearAvailMode(mp)

    // ---------- 12. 资源详情接口失败（error） ----------
    await setMockMode(mp, 'error')
    await callPageMethod(mp, 'loadDetail')
    let detailData = await waitForDetailData(mp, (d) => d.pageState === 'error')
    check('详情请求失败落到资源信息区错误态', !!detailData && detailData.pageState === 'error', detailData ? String(detailData.pageState) : 'null')
    check(
      '详情错误态写入错误提示',
      !!detailData && typeof detailData.errorMessage === 'string' && detailData.errorMessage.length > 0,
      detailData ? JSON.stringify(detailData.errorMessage) : 'null',
    )
    page = await mp.currentPage()
    const detailErrText = await xpathText(page, '//view[@class="error-state"]')
    check(
      '详情错误态展示失败原因且不渲染资源内容',
      detailErrText !== null &&
        detailErrText.indexOf(detailData.errorMessage) >= 0 &&
        (await xpathEl(page, '//view[@class="cr-section info"]')) === null &&
        (await dateItems(page)).length === 0,
      JSON.stringify(detailErrText),
    )

    // 恢复数据源并重试
    await clearMockMode(mp)
    const detailRetry = await xpathEl(page, '//view[@class="error-state__action"]')
    check('详情错误态渲染重试按钮', detailRetry !== null)
    if (detailRetry) {
      await detailRetry.tap()
      detailData = await waitForDetailData(
        mp,
        (d) => d.pageState === 'success' && d.slotState === 'success',
      )
      check(
        '详情重试后恢复正常',
        !!detailData && detailData.pageState === 'success',
        detailData ? String(detailData.pageState) : 'null',
      )
    }

    // ---------- 13. 资源不存在（empty） ----------
    await setMockMode(mp, 'empty')
    await callPageMethod(mp, 'loadDetail')
    detailData = await waitForDetailData(mp, (d) => d.pageState === 'empty')
    check(
      '资源不存在时落到资源信息区空态（而非错误态）',
      !!detailData && detailData.pageState === 'empty' && detailData.resource === null,
      detailData ? `state=${detailData.pageState}` : 'null',
    )
    page = await mp.currentPage()
    const notFoundText = await xpathText(page, '//view[@class="empty-state"]')
    check(
      '空态文案为「资源不存在」并引导返回',
      notFoundText !== null && notFoundText.indexOf('资源不存在') >= 0 && notFoundText.indexOf('返回上一页') >= 0,
      JSON.stringify(notFoundText),
    )
    check(
      '资源不存在时不渲染日期条与时段（无事可做不留空壳）',
      (await dateItems(page)).length === 0 &&
        (await countByXPath(page, SLOT_ROOT, 12)) === 0,
    )

    await clearMockMode(mp)
    await sleep(600)

    // ---------- 14. 非法 id 参数兜底 ----------
    const beforeInfo = await stackInfo(mp)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/resource-detail/resource-detail?id=abc' }))
    await waitForRouteSettled(mp, DETAIL)
    const t14 = Date.now()
    let stackNow = await stackInfo(mp)
    while (stackNow.len <= beforeInfo.len && Date.now() - t14 < 12000) {
      await sleep(300)
      stackNow = await stackInfo(mp)
    }
    check('非法参数以新页面实例打开', stackNow.len === beforeInfo.len + 1, JSON.stringify(stackNow.routes))

    let bad = await waitForTopPageData(mp, (d) => d.hasValidId === false)
    check(
      '非数字 id 参数被判为非法',
      !!bad.data && bad.data.hasValidId === false && bad.data.resourceId === 0,
      bad.data ? `hasValidId=${bad.data.hasValidId} resourceId=${bad.data.resourceId}` : 'null',
    )
    check(
      '非法 id 展示错误态而非白屏',
      !!bad.page && (await xpathText(bad.page, '//view[@class="error-state"]')) !== null,
    )

    const beforeSecond = await stackInfo(mp)
    await mp.evaluate(() => wx.navigateTo({ url: '/pages/resource-detail/resource-detail?id=0' }))
    await waitForRouteSettled(mp, DETAIL)
    const t14b = Date.now()
    stackNow = await stackInfo(mp)
    while (stackNow.len <= beforeSecond.len && Date.now() - t14b < 12000) {
      await sleep(300)
      stackNow = await stackInfo(mp)
    }
    bad = await waitForTopPageData(mp, (d) => d.hasValidId === false && d.resourceId === 0)
    check(
      'id=0 被判为非法（资源 ID 必须为正整数）',
      !!bad.data && bad.data.hasValidId === false,
      bad.data ? `hasValidId=${bad.data.hasValidId} resourceId=${bad.data.resourceId}` : 'null',
    )

    // ---------- 15. 收尾 ----------
    await goBackTo(mp, HOME)
    const finalPath = await currentPath(mp)
    check('测试结束回到首页', finalPath === HOME, String(finalPath))
  } catch (e) {
    check('测试执行过程无异常', false, e && e.message ? e.message : String(e))
    console.error(e)
  } finally {
    try {
      await clearMockMode(mp)
      await clearAvailMode(mp)
    } catch (e) {
      /* ignore */
    }
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
