/**
 * ResourceCard —— 资源卡片。
 *
 * 用途：首页热门 / 推荐资源、资源列表页展示单条资源（技术设计 §6）。
 * 职责边界：只负责展示与抛出点击事件，**不硬编码路由**，跳转由使用方决定，
 * 使同一卡片可在首页与列表页复用。
 *
 * 使用：
 *   <resource-card wx:for="{{list}}" wx:key="id" resource="{{item}}" bind:cardtap="onTapResource" />
 *
 * 事件：`cardtap`，detail 为 `{ resource }`。
 * 事件名刻意不复用 `tap`：组件内部的原生 tap 会冒泡，与自定义事件同名时可能触发两次。
 */
import type { Resource } from '../../types/resource'
import { getResourceTypeLabel } from '../../utils/resource'

Component({
  properties: {
    /** 要展示的资源 */
    resource: {
      type: Object,
      value: null,
    },
  },

  data: {
    /** 资源类型中文名，随 resource 变化同步计算 */
    typeLabel: '',
  },

  observers: {
    resource(value: Resource | null) {
      this.setData({
        typeLabel: value ? getResourceTypeLabel(value.type) : '',
      })
    },
  },

  methods: {
    /** 点击卡片时触发 cardtap 事件，携带 resource 供使用方跳转 */
    handleTap() {
      this.triggerEvent('cardtap', { resource: this.data.resource })
    },
  },
})
