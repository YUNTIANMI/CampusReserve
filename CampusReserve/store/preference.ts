/**
 * 用户偏好（本地缓存）。
 *
 * 需求 §4.9「允许缓存用户基础信息、登录状态、最近筛选条件」与技术设计 §9
 * 「只缓存必要数据：userInfo / loginState / 最近筛选条件」。
 * 登录相关的两项归 `store/auth.ts`，本模块只负责**最近筛选条件**。
 *
 * 为什么筛选条件值得缓存：
 * 逛资源时来回切分类是常态（看看篮球场、再看看自习室），每次都重置回「全部」
 * 会让用户重新点一遍。这里缓存的是「上次看的是哪一类」这个**事实**，
 * 而不是「用户偏好哪一类」这个**判断**——所以没有任何长期偏好逻辑，
 * 用户换一次就跟着变，也不需要「清除偏好」入口。
 *
 * **缓存的优先级低于 URL 参数**：带 `category` 参数进入说明是明确意图
 * （从首页某个分类卡片点进来的），必须以参数为准；只有没带参数时才用缓存兜底。
 * 这个顺序不能反——反了会让「点篮球场却进了自习室」这种诡异现象出现，
 * 而用户完全无法理解为什么。
 *
 * 存的是空串时与「没存过」在缓存层无法区分，但两者语义一致（都是「全部」），
 * 因此不做特殊处理。
 */

/** 最近筛选条件缓存键 */
export const LAST_CATEGORY_STORAGE_KEY = 'CR_LAST_CATEGORY'

/**
 * 读最近使用的筛选条件；无缓存或缓存不可用时返回空串（「全部」）。
 * 读取失败一律视为「没有缓存」而不是抛错——筛选条件只是便利设施，
 * 它出问题不该把整个列表页挡在门外。
 */
export function getLastCategory(): string {
  try {
    const value = wx.getStorageSync(LAST_CATEGORY_STORAGE_KEY)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/**
 * 记住最近使用的筛选条件。
 *
 * 写入失败静默忽略：本次会话内页面上的状态已经是正确的，
 * 缓存只为「下次进来」服务，写不进去最多是下次回到「全部」。
 */
export function saveLastCategory(category: string) {
  try {
    wx.setStorageSync(LAST_CATEGORY_STORAGE_KEY, category)
  } catch {
    /* 缓存写入失败不影响本次浏览 */
  }
}
