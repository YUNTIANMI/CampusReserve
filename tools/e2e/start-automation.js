/**
 * 启动微信开发者工具的自动化模式，供 e2e 脚本连接。
 *
 * 用法：
 *   node ./start-automation.js [devtoolsCliPath]
 *
 * CLI 路径优先级：命令行参数 > 环境变量 WX_DEVTOOLS_CLI > 常见默认路径。
 * 执行成功后开发者工具会停在自动化模式，脚本即可连接 ws://127.0.0.1:9420。
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const AUTO_PORT = 9420
const projectPath = path.resolve(__dirname, '..', '..', 'CampusReserve')

const candidates = [
  process.argv[2],
  process.env.WX_DEVTOOLS_CLI,
  'D:/微信web开发者工具/cli.bat',
  'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
].filter(Boolean)

const cli = candidates.find((p) => fs.existsSync(p))

if (!cli) {
  console.error('未找到微信开发者工具 CLI，请显式传入路径或设置环境变量 WX_DEVTOOLS_CLI。')
  console.error('已尝试：')
  for (const c of candidates) console.error(`  - ${c}`)
  process.exit(1)
}

if (!fs.existsSync(projectPath)) {
  console.error(`未找到小程序工程目录：${projectPath}`)
  process.exit(1)
}

console.log(`CLI      = ${cli}`)
console.log(`工程根   = ${projectPath}`)
console.log(`自动端口 = ${AUTO_PORT}`)
console.log('')

const quotedCli = /\s/.test(cli) ? `"${cli}"` : cli
const cmd = `${quotedCli} auto --project "${projectPath}" --auto-port ${AUTO_PORT}`
const r = spawnSync(cmd, { stdio: 'inherit', shell: true })

process.exit(r.status === null ? 1 : r.status)
