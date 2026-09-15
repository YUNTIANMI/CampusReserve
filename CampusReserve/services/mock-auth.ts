/**
 * 开发期登录数据源（临时机制）。
 *
 * 背景与 services/mock-resource.ts 相同：后端登录接口属于 Phase 10，而 Phase 5 要先把
 * 登录流程的前端部分做完，因此由本模块顶替 `POST /api/auth/login`。
 * 开关同为 services/config.ts 的 `USE_MOCK_DATA`，联调时置为 false 即可切到真实接口，
 * services/auth.ts 与页面代码都不需要改动。
 *
 * 刻意不做的事：不返回 avatarUrl。
 * 与「开发期数据源不提供 imageUrl」是同一个决策（见 docs/PROJECT_MEMORY.md §11）——
 * 避免端到端测试依赖网络图片，页面统一走昵称首字占位，真实头像待 Phase 9 / Phase 12 补齐。
 */
import { MOCK_AUTH_MODE_STORAGE_KEY } from './config'
import { ApiError } from './request'
import type { AuthSession, UserInfo } from '../types/user'

/** 模拟网络耗时（毫秒），让登录按钮的 loading 态可见 */
const MOCK_LOGIN_DELAY = 400

/** 固定用户 id：同一台设备多次登录得到同一个用户，便于断言与展示 */
const MOCK_USER_ID = 1001

/** 固定昵称 */
const MOCK_NICKNAME = '校园用户'

/** 登录失败的业务码，风格同 docs/02_technical_design.md §13 的六位业务码 */
const MOCK_AUTH_ERROR_CODE = 401001

/** 登录数据源模式 */
export type MockAuthMode = 'success' | 'error'

/** 读取注入的登录模式，缺省按成功处理 */
function readMockAuthMode(): MockAuthMode {
  try {
    return wx.getStorageSync(MOCK_AUTH_MODE_STORAGE_KEY) === 'error' ? 'error' : 'success'
  } catch {
    return 'success'
  }
}

/**
 * 模拟「用 wx.login 的一次性凭证换取登录态」。
 *
 * @param code wx.login 返回的 code，mock 里仅用于拼一个可辨识的 token
 */
export function mockLogin(code: string): Promise<AuthSession> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (readMockAuthMode() === 'error') {
        // 用 ApiError 抛出，页面就能和真实失败走完全相同的展示分支
        reject(new ApiError(MOCK_AUTH_ERROR_CODE, '微信登录失败，请稍后重试'))
        return
      }

      const userInfo: UserInfo = {
        id: MOCK_USER_ID,
        nickname: MOCK_NICKNAME,
      }

      resolve({
        token: `mock-token-${MOCK_USER_ID}-${code || 'no-code'}`,
        userInfo,
      })
    }, MOCK_LOGIN_DELAY)
  })
}
