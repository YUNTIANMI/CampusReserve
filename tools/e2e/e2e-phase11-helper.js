/**
 * CampusReserve Phase 11 测试数据清理辅助脚本。
 *
 * e2e-phase11.js 跑完会留下真实的预约记录（占用未来几天的时段），
 * 用本脚本清掉「小程序会登录的那个开发用户」的全部预约，避免多次运行累积、
 * 或让后续运行撞上「该时段已被预约」的冲突。
 *
 * 用法：
 *   node ./e2e-phase11-helper.js clean                # 清理 dev-user 的全部预约
 *   node ./e2e-phase11-helper.js clean http://127.0.0.1:8088/api
 *
 * 与 cr-preset-helper.js（临时目录、不入库）的区别：本脚本属于 Phase 11 的正式交付物，
 * 需要随仓库走，供后续回归复用。清理只动 dev-user 自己的记录，不碰其他用户。
 */
const BASE = process.argv[3] || 'http://127.0.0.1:8088/api'
const action = process.argv[2] || 'clean'

/** 与小程序 wx.login 同一条降级路径：非 dev: 开头 → 固定开发用户 dev-user */
const SHARED_CODE = 'e2e-phase11-shared-user'

async function call(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let parsed = null
  const text = await res.text()
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed }
}

async function main() {
  if (action !== 'clean') {
    console.log('未知操作，仅支持 clean')
    process.exit(1)
  }

  const login = await call('POST', '/auth/login', { body: { code: SHARED_CODE } })
  if (!login.body || login.body.code !== 0) {
    console.log(`LOGIN_FAILED=${JSON.stringify(login)}`)
    process.exit(1)
  }
  const token = login.body.data.token
  console.log(`LOGIN_OK user=${JSON.stringify(login.body.data.userInfo)}`)

  const mine = await call('GET', '/bookings/my', { token })
  const list = mine.body.data || []
  let n = 0
  for (const b of list) {
    const r = await call('DELETE', `/bookings/${b.id}`, { token })
    if (r.body.code === 0 || r.body.code === 409001) n += 1
  }
  console.log(`CLEANED=${n}/${list.length}`)
}

main().catch((err) => {
  console.error('helper error', err)
  process.exit(1)
})
