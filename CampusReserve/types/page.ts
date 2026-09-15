/**
 * 页面状态。
 *
 * 技术设计 §7 / §8 要求主要页面统一考虑
 * loading / success / empty / error 四种状态，禁止无限 loading 与白屏。
 */
export type PageState = 'loading' | 'success' | 'empty' | 'error'
