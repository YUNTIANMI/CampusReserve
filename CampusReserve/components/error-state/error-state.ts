/**
 * ErrorState —— 错误状态组件。
 *
 * 用途：请求失败时展示明确原因并提供重试入口（技术设计 §8：请求失败必须有提示，
 * 且不能出现无法恢复的页面）。
 * 使用：
 *   <error-state
 *     wx:if="{{pageState === 'error'}}"
 *     message="{{errorMessage}}"
 *     bind:retry="onRetry" />
 */
Component({
  properties: {
    /** 错误提示，通常直接使用 ApiError.message */
    message: {
      type: String,
      value: '加载失败，请稍后重试',
    },
    /** 重试按钮文案 */
    buttonText: {
      type: String,
      value: '重新加载',
    },
    /** 是否展示重试按钮 */
    showRetry: {
      type: Boolean,
      value: true,
    },
  },

  methods: {
    /** 点击重试时触发 retry 事件，由页面重新发起请求 */
    handleRetry() {
      this.triggerEvent('retry')
    },
  },
})
