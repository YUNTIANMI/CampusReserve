/**
 * LoadingState —— 加载中状态组件。
 *
 * 用途：页面 / 列表数据加载期间展示，避免白屏（技术设计 §8）。
 * 使用：
 *   <loading-state wx:if="{{pageState === 'loading'}}" text="正在加载资源" />
 */
Component({
  properties: {
    /** 提示文案 */
    text: {
      type: String,
      value: '加载中',
    },
  },
})
