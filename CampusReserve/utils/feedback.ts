/**
 * 统一的用户反馈出口（Phase 9）。
 *
 * 为什么值得单独一层：
 * 1. **一致性**：同一种情况在不同页面弹出不同形态的提示，用户会以为是两回事。
 *    成功用 `success`、失败用 `none`、危险确认按钮用红色，在这里定一次，页面不再各写各的。
 * 2. **消除重复**：`页面跳转失败` 原先在五个页面里各写一遍，改一次要改五处，
 *    而且很容易出现「四个页面改了、漏掉一个」的不一致。
 * 3. **modal 的 Promise 化**：`wx.showModal` 是回调式的，「确认后做什么」只能写进
 *    `success` 回调；包一层 Promise 后可以 `await`，「确认 → 发请求 → 处理结果」
 *    能写成一条直线，不必层层嵌套。
 *
 * 与四态组件的关系（不重复）：本模块只负责**瞬时**反馈（toast / modal）；
 * 页面级的**常驻**状态仍由 loading-state / empty-state / error-state 承担。
 * 两者不可互相替代——toast 会消失，而「该时段已被预约」这类需要用户据此改变行为的提示
 * 必须留在页面上（见 pages/resource-detail 的 `submitError`）。
 *
 * 保持文案稳定的原因：端到端测试对 `需要登录` / `取消预约` / `预约成功` / `已取消`
 * 等文案有断言（tools/e2e），集中到这里之后文案改动只需在一处完成，
 * 但也意味着改这里会牵动测试——这是刻意的，反馈文案属于对用户的承诺，不该随手改。
 */

/** 页面跳转失败的统一文案 */
export const NAVIGATE_FAILED_TEXT = '页面跳转失败'

/** toast 的默认停留时间（毫秒），与微信默认值一致，便于用户看清 */
const TOAST_DURATION = 2000

/** 确认框配置 */
export interface ConfirmOptions {
  /** 标题 */
  title: string
  /** 正文 */
  content: string
  /** 确认按钮文案，缺省「确定」 */
  confirmText?: string
  /** 取消按钮文案，缺省「取消」 */
  cancelText?: string
  /** 是否为危险操作：确认按钮用红色，让用户意识到不可逆 */
  danger?: boolean
}

/**
 * 失败提示（`icon: 'none'`）。
 *
 * 失败一律用无图标样式而不是 `icon: 'error'`：错误原因本身就是要读的文字，
 * 图标占位会挤掉文字宽度，长文案更容易被截断。
 */
export function toastError(title: string) {
  wx.showToast({ title, icon: 'none', duration: TOAST_DURATION })
}

/**
 * 中性结果提示（`icon: 'none'`），用于「已取消」这类非错误、也谈不上喜庆的操作结果。
 *
 * 与 `toastError` 当前实现相同——微信 toast 只有 success / error / loading / none
 * 四种形态，`none` 需要同时承担「失败」与「中性」两种表达。
 * 分成两个函数是为了让调用处写清楚意图，将来若要给失败换上图标或加长停留时间，
 * 只需改这里一处，不必回头分辨每个调用点到底是哪种。
 */
export function toastInfo(title: string) {
  wx.showToast({ title, icon: 'none', duration: TOAST_DURATION })
}

/** 成功提示（`icon: 'success'`） */
export function toastSuccess(title: string) {
  wx.showToast({ title, icon: 'success', duration: TOAST_DURATION })
}

/** 页面跳转失败：跳转是后台行为，失败必须让用户知道，否则表现为「点了没反应」 */
export function toastNavigateFailed() {
  toastError(NAVIGATE_FAILED_TEXT)
}

/**
 * 二次确认，返回是否点了确认。
 *
 * 两个刻意的处理：
 * 1. **取消与弹窗失败都返回 `false`**。`fail`（弹窗都没弹出来）按「未确认」处理，
 *    调用方什么都不做——这是安全方向：确认框背后通常是不可逆操作
 *    （取消预约、退出登录），宁可不执行也不能在用户没看到确认框的情况下执行。
 * 2. **确认按钮文案由调用方给**。「确定取消」比「确定」更明确，
 *    用户在点击的瞬间就知道自己要做的动作是什么。
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const modal: WechatMiniprogram.ShowModalOption = {
      title: options.title,
      content: options.content,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      success: (res) => {
        resolve(!!res.confirm)
      },
      fail: () => {
        resolve(false)
      },
    }

    // 非危险操作不传该字段，避免把默认色硬写成主色（各端主题可能不同）
    if (options.danger) {
      modal.confirmColor = '#f5222d'
    }

    wx.showModal(modal)
  })
}
