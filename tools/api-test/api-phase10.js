/**
 * CampusReserve 后端接口实测（Phase 10）。
 *
 * 与 tools/e2e/ 的区别：那边驱动**微信开发者工具里的真实小程序**，验证页面与组件；
 * 这边直接用 HTTP 打**真实后端 + 真实 MySQL**，验证接口契约与业务规则。
 * 两者互补：Phase 10 的验收标准是「小程序核心业务可依赖真实后端运行」，
 * 后端这一侧必须先自证接口与数据层是对的。
 *
 * 契约依据：docs/05_api_contract.md。本脚本按 §3 的错误码表与 §5.6 的校验顺序逐条断言，
 * 契约改了要同步改这里。
 *
 * 用法：
 *   node ./api-phase10.js                                  # 默认 http://127.0.0.1:8088/api
 *   node ./api-phase10.js http://127.0.0.1:8088/api
 *
 * 前提：后端已连上 MySQL 启动（见 backend/README 或 docs/PROJECT_MEMORY.md §7）。
 *
 * 设计说明：
 * 1. **不依赖数据库直连**。脚本只用 HTTP，因此可以对着任何一台上线环境跑；
 *    唯一无法覆盖的分支是「取消一条已结束的预约」——它需要人为把预约时间改到过去，
 *    只能由 SQL 直接改库来构造，已在 docs/PROJECT_MEMORY.md 的实测记录里单独说明。
 * 2. **用两个开发期用户**（`dev:api-test-a` / `dev:api-test-b`）验证归属校验，
 *    见 docs/05_api_contract.md §7。他们的数据通过接口清理，不碰其他人的记录。
 * 3. **用远期日期**（+40 天）做时段断言，避免与人工调试时留下的记录撞车。
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8088/api'

/** 断言计数 */
let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`)
  }
}

/** 生成相对今天偏移 N 天的日期（YYYY-MM-DD），按本机时区计算，与后端同一时区 */
function dateOffset(days) {
  const d = new Date(Date.now() + days * 86400000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 发一个请求，返回 { status, body }；body 解析失败时为 null */
async function call(method, path, { token, body, timeout = 15000 } = {}) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    let parsed = null
    const text = await res.text()
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
    return { status: res.status, body: parsed }
  } finally {
    clearTimeout(timer)
  }
}

/** 统一响应体形状：code 为数字、有 message、data 存在（可为 null） */
function isEnvelope(body) {
  return !!body && typeof body === 'object' && typeof body.code === 'number' && typeof body.message === 'string' && 'data' in body
}

const createdBookingIds = []

async function main() {
  console.log(`== CampusReserve 后端接口实测 ==\nBASE=${BASE}\n`)

  // ===========================================================================
  // A. 连通性与统一响应体
  // ===========================================================================
  const health = await call('GET', '/health')
  check('A1 健康检查 HTTP 200', health.status === 200, `status=${health.status}`)
  check('A2 健康检查返回统一响应体', isEnvelope(health.body), JSON.stringify(health.body))
  check('A3 健康检查 data.status = UP', health.body && health.body.data && health.body.data.status === 'UP',
    JSON.stringify(health.body && health.body.data))

  // ===========================================================================
  // B. 登录与鉴权
  // ===========================================================================
  const loginA = await call('POST', '/auth/login', { body: { code: 'dev:api-test-a' } })
  check('B1 用户 A 登录成功（HTTP 200）', loginA.status === 200, `status=${loginA.status}`)
  check('B2 登录返回 token 与 userInfo', !!(loginA.body && loginA.body.data && loginA.body.data.token && loginA.body.data.userInfo),
    JSON.stringify(loginA.body))
  const tokenA = loginA.body && loginA.body.data ? loginA.body.data.token : null
  const userA = loginA.body && loginA.body.data ? loginA.body.data.userInfo : null
  check('B3 userInfo 含 id 与 nickname', !!(userA && typeof userA.id === 'number' && typeof userA.nickname === 'string'),
    JSON.stringify(userA))
  check('B4 契约约定：当前不返回 avatarUrl', !!(userA && userA.avatarUrl === undefined), JSON.stringify(userA))
  check('B5 token 是三段式（header.payload.signature）', typeof tokenA === 'string' && tokenA.split('.').length === 3,
    tokenA)

  const loginA2 = await call('POST', '/auth/login', { body: { code: 'dev:api-test-a' } })
  check('B6 同一用户重复登录得到同一个 userId', !!(loginA2.body && loginA2.body.data && loginA2.body.data.userInfo.id === userA.id),
    JSON.stringify(loginA2.body && loginA2.body.data && loginA2.body.data.userInfo))

  const loginB = await call('POST', '/auth/login', { body: { code: 'dev:api-test-b' } })
  const tokenB = loginB.body && loginB.body.data ? loginB.body.data.token : null
  const userB = loginB.body && loginB.body.data ? loginB.body.data.userInfo : null
  check('B7 用户 B 登录成功且与 A 是不同的用户', !!(userB && userA && userB.id !== userA.id),
    `A=${userA && userA.id} B=${userB && userB.id}`)

  const loginBad = await call('POST', '/auth/login', { body: { code: '' } })
  check('B8 空 code 登录失败（400001）', !!(loginBad.body && loginBad.body.code === 400001), JSON.stringify(loginBad.body))

  // 未登录 / 凭证不合法 —— 必须 HTTP 401（小程序靠状态码触发「清登录态 + 重新登录」）
  const noToken = await call('GET', '/bookings/my')
  check('B9 不带凭证访问我的预约 → HTTP 401', noToken.status === 401, `status=${noToken.status}`)
  check('B10 401 响应体仍为统一格式且 code=401002', !!(isEnvelope(noToken.body) && noToken.body.code === 401002),
    JSON.stringify(noToken.body))

  const badToken = await call('GET', '/bookings/my', { token: 'not.a.token' })
  check('B11 伪造的 token → HTTP 401', badToken.status === 401, `status=${badToken.status}`)

  const tamperedToken = await call('GET', '/bookings/my', { token: `${tokenA}x` })
  check('B12 被篡改的 token → HTTP 401', tamperedToken.status === 401, `status=${tamperedToken.status}`)

  // ===========================================================================
  // C. 资源查询
  // ===========================================================================
  const list = await call('GET', '/resources')
  check('C1 资源列表 HTTP 200 且 code=0', list.status === 200 && list.body.code === 0, JSON.stringify(list.body))
  const resources = list.body.data
  check('C2 资源列表返回 8 条种子数据', Array.isArray(resources) && resources.length === 8,
    Array.isArray(resources) ? `len=${resources.length}` : typeof resources)
  check('C3 资源字段完整（id/name/type/location/capacity/description）',
    !!resources && resources.every((r) => typeof r.id === 'number' && typeof r.name === 'string'
      && typeof r.type === 'string' && typeof r.location === 'string'
      && typeof r.capacity === 'number' && typeof r.description === 'string'),
    JSON.stringify(resources && resources[0]))
  check('C4 资源不暴露内部配置 openSlots', !!resources && resources.every((r) => r.openSlots === undefined))
  check('C5 资源按 id 升序返回', !!resources && resources.every((r, i) => i === 0 || resources[i - 1].id < r.id))

  const studyRooms = await call('GET', '/resources?type=STUDY_ROOM')
  check('C6 按类型筛选（STUDY_ROOM → 2 条）', studyRooms.body && studyRooms.body.data.length === 2,
    JSON.stringify(studyRooms.body && studyRooms.body.data && studyRooms.body.data.map((r) => r.type)))
  check('C7 筛选结果类型正确', studyRooms.body && studyRooms.body.data.every((r) => r.type === 'STUDY_ROOM'))

  const limited = await call('GET', '/resources?limit=3')
  check('C8 limit=3 只返回 3 条', limited.body && limited.body.data.length === 3,
    JSON.stringify(limited.body && limited.body.data && limited.body.data.length))

  const badType = await call('GET', '/resources?type=NOT_A_TYPE')
  check('C9 非法资源类型 → 400001（不静默返回空列表）', badType.body && badType.body.code === 400001,
    JSON.stringify(badType.body))

  const detail = await call('GET', '/resources/1')
  check('C10 资源详情返回单个对象', !!(detail.body && detail.body.data && detail.body.data.id === 1),
    JSON.stringify(detail.body))

  const missingDetail = await call('GET', '/resources/99999')
  check('C11 资源不存在 → code=0 且 data=null（页面落空态，不是错误态）',
    !!(missingDetail.body && missingDetail.body.code === 0 && missingDetail.body.data === null),
    JSON.stringify(missingDetail.body))

  const badPathId = await call('GET', '/resources/abc')
  check('C12 路径参数非数字 → 400001', badPathId.body && badPathId.body.code === 400001, JSON.stringify(badPathId.body))

  // ===========================================================================
  // D. 可用时间段
  // ===========================================================================
  const farDate = dateOffset(40)
  const avail = await call('GET', `/resources/1/availability?date=${farDate}`)
  check('D1 可用时间段 HTTP 200', avail.status === 200 && avail.body.code === 0, JSON.stringify(avail.body))
  const slots = avail.body.data && avail.body.data.slots
  check('D2 返回 6 个时段（与开放时段配置一致）', Array.isArray(slots) && slots.length === 6,
    Array.isArray(slots) ? `len=${slots.length}` : typeof slots)
  check('D3 回显 resourceId 与 date', !!(avail.body.data.resourceId === 1 && avail.body.data.date === farDate),
    JSON.stringify(avail.body.data && { resourceId: avail.body.data.resourceId, date: avail.body.data.date }))
  check('D4 时段格式为 HH:mm 且首段为 09:00-10:00',
    !!slots && slots[0].startTime === '09:00' && slots[0].endTime === '10:00', JSON.stringify(slots && slots[0]))
  check('D5 远期日期全部可预约（无历史占用）',
    !!slots && slots.every((s) => s.status === 'AVAILABLE'),
    JSON.stringify(slots && slots.map((s) => s.status)))

  const badDate = await call('GET', `/resources/1/availability?date=2026-02-31`)
  check('D6 不存在的日期（02-31）→ 400001', badDate.body && badDate.body.code === 400001, JSON.stringify(badDate.body))

  const badDateShape = await call('GET', `/resources/1/availability?date=2026/09/17`)
  check('D7 日期格式非法 → 400001', badDateShape.body && badDateShape.body.code === 400001,
    JSON.stringify(badDateShape.body))

  const noDate = await call('GET', `/resources/1/availability`)
  check('D8 缺少 date 参数 → 400001', noDate.body && noDate.body.code === 400001, JSON.stringify(noDate.body))

  const availMissing = await call('GET', `/resources/99999/availability?date=${farDate}`)
  check('D9 资源不存在时查时段 → 404001', availMissing.body && availMissing.body.code === 404001,
    JSON.stringify(availMissing.body))

  // ===========================================================================
  // E. 创建预约（需求 §4.5、技术设计 §11 的六条规则）
  // ===========================================================================
  const payload = { resourceId: 1, date: farDate, startTime: '09:00', endTime: '10:00' }

  const noAuthCreate = await call('POST', '/bookings', { body: payload })
  check('E1 未登录创建预约 → HTTP 401 / 401002',
    noAuthCreate.status === 401 && noAuthCreate.body.code === 401002,
    `status=${noAuthCreate.status} body=${JSON.stringify(noAuthCreate.body)}`)

  const created = await call('POST', '/bookings', { token: tokenA, body: payload })
  check('E2 创建预约成功', created.status === 200 && created.body.code === 0, JSON.stringify(created.body))
  const booking = created.body.data
  if (booking && booking.id) createdBookingIds.push(booking.id)
  check('E3 新预约状态为 PENDING', !!(booking && booking.status === 'PENDING'), JSON.stringify(booking && booking.status))
  check('E4 返回资源名与地点（来自连接 resource 表）',
    !!(booking && typeof booking.resourceName === 'string' && booking.resourceName.length > 0 && typeof booking.location === 'string'),
    JSON.stringify(booking && { resourceName: booking.resourceName, location: booking.location }))
  check('E5 日期格式为 YYYY-MM-DD', !!(booking && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)), booking && booking.date)
  check('E6 时间格式为 HH:mm', !!(booking && /^\d{2}:\d{2}$/.test(booking.startTime) && /^\d{2}:\d{2}$/.test(booking.endTime)),
    JSON.stringify(booking && { startTime: booking.startTime, endTime: booking.endTime }))
  check('E7 createdAt 格式为 YYYY-MM-DD HH:mm:ss（数据库默认值已回读）',
    !!(booking && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(booking.createdAt)), booking && booking.createdAt)

  // 身份来自凭证，不来自请求体：即使传了 userId 也必须归到 token 的主人名下
  const withUserId = await call('POST', '/bookings', {
    token: tokenA,
    body: { ...payload, startTime: '10:00', endTime: '11:00', userId: 99999 },
  })
  if (withUserId.body && withUserId.body.data && withUserId.body.data.id) createdBookingIds.push(withUserId.body.data.id)
  const mineAfterWithUserId = await call('GET', '/bookings/my', { token: tokenA })
  check('E8 请求体里的 userId 被忽略，身份只认凭证',
    !!(withUserId.body.code === 0 && mineAfterWithUserId.body.data.some((b) => b.id === withUserId.body.data.id)),
    JSON.stringify(withUserId.body))

  const conflict = await call('POST', '/bookings', { token: tokenB, body: payload })
  check('E9 他人抢占同一时段 → 409001', conflict.body && conflict.body.code === 409001, JSON.stringify(conflict.body))
  check('E10 冲突提示可直接展示给用户',
    !!(conflict.body && /已被预约/.test(conflict.body.message)), conflict.body && conflict.body.message)

  const selfConflict = await call('POST', '/bookings', { token: tokenA, body: payload })
  check('E11 自己重复预约同一时段 → 409001', selfConflict.body && selfConflict.body.code === 409001,
    JSON.stringify(selfConflict.body))

  const past = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: dateOffset(-1), startTime: '09:00', endTime: '10:00' },
  })
  check('E12 预约已过去的日期 → 400002', past.body && past.body.code === 400002, JSON.stringify(past.body))

  const reversed = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: farDate, startTime: '11:00', endTime: '11:00' },
  })
  check('E13 结束时间不晚于开始时间 → 400002', reversed.body && reversed.body.code === 400002,
    JSON.stringify(reversed.body))

  const badFormatDate = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: '2026/10/01', startTime: '09:00', endTime: '10:00' },
  })
  check('E14 日期格式非法 → 400001', badFormatDate.body && badFormatDate.body.code === 400001,
    JSON.stringify(badFormatDate.body))

  const badFormatTime = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: farDate, startTime: '9:0', endTime: '10:00' },
  })
  check('E15 时间格式非法 → 400001', badFormatTime.body && badFormatTime.body.code === 400001,
    JSON.stringify(badFormatTime.body))

  const missingField = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: farDate, startTime: '09:00' },
  })
  check('E16 缺字段 → 400001', missingField.body && missingField.body.code === 400001,
    JSON.stringify(missingField.body))

  const missingResource = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 99999, date: farDate, startTime: '14:00', endTime: '15:00' },
  })
  check('E17 资源不存在 → 404001', missingResource.body && missingResource.body.code === 404001,
    JSON.stringify(missingResource.body))

  const closedSlot = await call('POST', '/bookings', {
    token: tokenA,
    body: { resourceId: 1, date: farDate, startTime: '12:00', endTime: '13:00' },
  })
  check('E18 时段不在资源开放范围内 → 400001', closedSlot.body && closedSlot.body.code === 400001,
    JSON.stringify(closedSlot.body))

  // 创建成功后，可用时间段必须立刻反映为已约满
  const availAfter = await call('GET', `/resources/1/availability?date=${farDate}`)
  const slot0900 = availAfter.body.data.slots.find((s) => s.startTime === '09:00')
  check('E19 创建成功后该时段变为 BOOKED', !!(slot0900 && slot0900.status === 'BOOKED'),
    JSON.stringify(slot0900))

  // ===========================================================================
  // F. 我的预约（需求 §4.6）
  // ===========================================================================
  const mineA = await call('GET', '/bookings/my', { token: tokenA })
  check('F1 我的预约 HTTP 200', mineA.status === 200 && mineA.body.code === 0, JSON.stringify(mineA.body))
  check('F2 A 的列表包含自己创建的预约', !!mineA.body.data.some((b) => b.id === booking.id))
  check('F3 每条记录都带资源名与地点',
    mineA.body.data.every((b) => typeof b.resourceName === 'string' && typeof b.location === 'string'))

  const mineB = await call('GET', '/bookings/my', { token: tokenB })
  check('F4 B 的列表看不到 A 的预约（服务端按凭证过滤）',
    !mineB.body.data.some((b) => b.id === booking.id),
    JSON.stringify(mineB.body.data.map((b) => b.id)))

  // ===========================================================================
  // G. 取消预约（需求 §4.7、技术设计 §11 第 6 条）
  // ===========================================================================
  const cancelByOther = await call('DELETE', `/bookings/${booking.id}`, { token: tokenB })
  check('G1 取消他人的预约 → 404001（与「不存在」返回同一个码，避免探测）',
    cancelByOther.body && cancelByOther.body.code === 404001, JSON.stringify(cancelByOther.body))

  const cancelUnknown = await call('DELETE', '/bookings/99999999', { token: tokenA })
  check('G2 取消不存在的预约 → 404001', cancelUnknown.body && cancelUnknown.body.code === 404001,
    JSON.stringify(cancelUnknown.body))

  const cancelNoAuth = await call('DELETE', `/bookings/${booking.id}`)
  check('G3 未登录取消 → HTTP 401', cancelNoAuth.status === 401, `status=${cancelNoAuth.status}`)

  const cancelled = await call('DELETE', `/bookings/${booking.id}`, { token: tokenA })
  check('G4 取消自己的预约成功', cancelled.body && cancelled.body.code === 0, JSON.stringify(cancelled.body))
  check('G5 状态变为 CANCELLED', !!(cancelled.body.data && cancelled.body.data.status === 'CANCELLED'),
    JSON.stringify(cancelled.body.data && cancelled.body.data.status))
  check('G6 取消不改变预约编号', !!(cancelled.body.data && cancelled.body.data.id === booking.id))
  check('G7 取消不改变创建时间（不是重新写一条记录）',
    !!(cancelled.body.data && cancelled.body.data.createdAt === booking.createdAt),
    `${booking.createdAt} -> ${cancelled.body.data && cancelled.body.data.createdAt}`)

  const repeatCancel = await call('DELETE', `/bookings/${booking.id}`, { token: tokenA })
  check('G8 重复取消 → 409001', repeatCancel.body && repeatCancel.body.code === 409001,
    JSON.stringify(repeatCancel.body))

  const availRestored = await call('GET', `/resources/1/availability?date=${farDate}`)
  const restored = availRestored.body.data.slots.find((s) => s.startTime === '09:00')
  check('G9 取消后时间段恢复为 AVAILABLE', !!(restored && restored.status === 'AVAILABLE'),
    JSON.stringify(restored))

  const mineCancelled = await call('GET', '/bookings/my', { token: tokenA })
  const cancelledInList = mineCancelled.body.data.find((b) => b.id === booking.id)
  check('G10 已取消的预约仍在列表中（状态为 CANCELLED）',
    !!(cancelledInList && cancelledInList.status === 'CANCELLED'), JSON.stringify(cancelledInList))

  // ===========================================================================
  // H. 并发一致性（技术设计 §12：数据库约束 + Service 检查）
  // ===========================================================================
  const raceSlot = { resourceId: 2, date: farDate, startTime: '14:00', endTime: '15:00' }
  const raceResults = await Promise.all(
    Array.from({ length: 8 }, () => call('POST', '/bookings', { token: tokenA, body: raceSlot })),
  )
  const raceOk = raceResults.filter((r) => r.body && r.body.code === 0)
  const raceConflict = raceResults.filter((r) => r.body && r.body.code === 409001)
  const raceOther = raceResults.filter((r) => !(r.body && (r.body.code === 0 || r.body.code === 409001)))
  raceOk.forEach((r) => r.body.data && r.body.data.id && createdBookingIds.push(r.body.data.id))
  check('H1 并发 8 次抢同一时段只成功 1 次', raceOk.length === 1, `ok=${raceOk.length}`)
  check('H2 其余全部是 409001（不是 500）', raceConflict.length === 7, `conflict=${raceConflict.length}`)
  check('H3 没有出现其它错误码', raceOther.length === 0, JSON.stringify(raceOther.map((r) => r.body)))

  const raceAvail = await call('GET', `/resources/2/availability?date=${farDate}`)
  const raceSlotState = raceAvail.body.data.slots.find((s) => s.startTime === '14:00')
  check('H4 库里只留下一条占用记录（该时段为 BOOKED）', !!(raceSlotState && raceSlotState.status === 'BOOKED'),
    JSON.stringify(raceSlotState))

  // ===========================================================================
  // I. 收尾：清理本次测试产生的预约，让脚本可重复运行
  // ===========================================================================
  let cleaned = 0
  for (const id of createdBookingIds) {
    const res = await call('DELETE', `/bookings/${id}`, { token: tokenA })
    if (res.body && (res.body.code === 0 || res.body.code === 409001)) cleaned += 1
  }
  check('I1 本次测试创建的预约已全部清理', cleaned === createdBookingIds.length,
    `cleaned=${cleaned}/${createdBookingIds.length}`)

  const finalAvail = await call('GET', `/resources/1/availability?date=${farDate}`)
  check('I2 清理后时段回到 AVAILABLE，脚本可重复运行',
    finalAvail.body.data.slots.every((s) => s.status === 'AVAILABLE'),
    JSON.stringify(finalAvail.body.data.slots.map((s) => s.status)))

  // ===========================================================================
  // J. 异常路径的兜底
  // ===========================================================================
  const unknownApi = await call('GET', '/not-exist-endpoint')
  check('J1 访问不存在的接口 → HTTP 404 且响应体仍是统一格式',
    unknownApi.status === 404 && isEnvelope(unknownApi.body),
    `status=${unknownApi.status} body=${JSON.stringify(unknownApi.body)}`)

  console.log(`\n合计 ${passed + failed} 项，通过 ${passed}，失败 ${failed}`)
  console.log(`E2E_TEST = ${failed === 0 ? 'PASS' : 'FAIL'}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('实测脚本异常终止：', err)
  console.log(`\n合计 ${passed + failed} 项，通过 ${passed}，失败 ${failed + 1}`)
  console.log('E2E_TEST = FAIL')
  process.exit(1)
})
