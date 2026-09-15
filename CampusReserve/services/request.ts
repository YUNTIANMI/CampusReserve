/**
 * 统一请求服务。
 *
 * 职责：只做「请求 → 解包统一响应体 → 错误归一化」，不含任何业务语义。
 * 业务接口封装（getResources / createBooking 等）属于各业务 Phase，见 docs/02_technical_design.md §5。
 *
 * 调用约定（Page → Service → API）：
 *   import { request } from '../../services/request'
 *   const resource = await request<Resource>({ url: `/resources/${id}` })
 *
 * 返回值：直接 resolve 统一响应体中的 `data`；失败时 reject 一个 ApiError。
 * 因此调用方只需 try/catch，并在 catch 中读取 `error.message` 展示提示。
 */
import { API_BASE_URL, ENABLE_REQUEST_LOG, REQUEST_TIMEOUT } from './config'
import type { ApiResponse, HttpMethod } from '../types/api'

/**
 * 客户端本地错误码（负数，与后端业务码不会冲突）。
 * 后端业务码由服务端返回，直接透传给 ApiError.code。
 */
export const ApiErrorCode = {
  /** 网络不可用 / 域名不可达 / 域名未配置 */
  NETWORK: -1,
  /** 请求超时 */
  TIMEOUT: -2,
  /** HTTP 状态码非 2xx，或响应体不符合统一格式 */
  HTTP: -3,
  /** 未登录或登录态失效（HTTP 401） */
  UNAUTHORIZED: -401,
} as const

/** 请求参数 */
export interface RequestOptions {
  /** 接口路径，以 / 开头，例如 /resources/1 */
  url: string
  /** 请求方法，默认 GET */
  method?: HttpMethod
  /** 请求数据：GET 时会被序列化为 query，其余方法作为 JSON body */
  data?: Record<string, unknown>
  /** 附加请求头 */
  header?: Record<string, string>
}

/** 归一化后的请求错误 */
export class ApiError extends Error {
  /** 错误码：负数来自 ApiErrorCode，正数来自后端业务码 */
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** 从响应体中尽力取出可展示的提示信息 */
function readMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }
  return ''
}

/**
 * 判断响应体是否符合统一响应格式。
 * 只校验 code 为数字，data 允许为任意值（失败时为 null）。
 */
function isApiResponse(body: unknown): body is ApiResponse<unknown> {
  return !!body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'number'
}

/**
 * 发起请求。
 * @param options 请求参数
 * @returns 统一响应体中的 data
 * @throws {ApiError} 网络异常、超时、HTTP 异常或业务失败
 */
export function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, header } = options
  const fullUrl = `${API_BASE_URL}${url}`

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...header,
      },
      timeout: REQUEST_TIMEOUT,
      success: (res) => {
        if (ENABLE_REQUEST_LOG) {
          console.log(`[request] ${method} ${fullUrl} -> HTTP ${res.statusCode}`)
        }

        const body: unknown = res.data
        const serverMessage = readMessage(body)

        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (res.statusCode === 401) {
            reject(
              new ApiError(
                ApiErrorCode.UNAUTHORIZED,
                serverMessage || '登录状态已失效，请重新登录',
              ),
            )
            return
          }
          reject(
            new ApiError(
              ApiErrorCode.HTTP,
              serverMessage || `接口请求失败（HTTP ${res.statusCode}）`,
            ),
          )
          return
        }

        if (!isApiResponse(body)) {
          reject(new ApiError(ApiErrorCode.HTTP, '接口返回格式异常'))
          return
        }

        if (body.code !== 0) {
          reject(new ApiError(body.code, serverMessage || '请求失败，请稍后重试'))
          return
        }

        resolve(body.data as T)
      },
      fail: (err) => {
        const errMsg = err.errMsg || ''
        const isTimeout = errMsg.indexOf('timeout') >= 0

        if (ENABLE_REQUEST_LOG) {
          console.warn(`[request] ${method} ${fullUrl} 失败: ${errMsg}`)
        }

        reject(
          isTimeout
            ? new ApiError(ApiErrorCode.TIMEOUT, '请求超时，请稍后重试')
            : new ApiError(ApiErrorCode.NETWORK, '网络连接失败，请检查网络后重试'),
        )
      },
    })
  })
}
