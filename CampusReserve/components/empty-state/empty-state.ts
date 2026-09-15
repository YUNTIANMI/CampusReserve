/**
 * EmptyState —— 空数据状态组件。
 *
 * 用途：接口成功但无数据时展示，可附带一个可选操作入口（技术设计 §8）。
 * 使用：
 *   <empty-state
 *     wx:if="{{pageState === 'empty'}}"
 *     text="暂无资源"
 *     description="换个分类试试"
 *     action-text="返回首页"
 *     bind:action="onEmptyAction" />
 */
Component({
  properties: {
    /** 主文案 */
    text: {
      type: String,
      value: '暂无数据',
    },
    /** 补充说明，为空时不展示 */
    description: {
      type: String,
      value: '',
    },
    /** 操作按钮文案，为空时不展示按钮 */
    actionText: {
      type: String,
      value: '',
    },
  },

  methods: {
    /** 点击操作按钮时触发 action 事件 */
    handleAction() {
      this.triggerEvent('action')
    },
  },
})
