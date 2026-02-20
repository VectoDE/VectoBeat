import { logError } from "./utils/error-handling"

type FetchOptions = RequestInit & {
  data?: unknown
}

class ApiError extends Error {
  status: number
  statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.statusText = statusText
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    const contentType = response.headers.get("content-type")
    if (contentType && contentType.includes("application/json")) {
      return response.json()
    }
    // @ts-expect-error - Assuming text response can be cast to T
    return response.text()
  }

  const errorText = await response.text()
  throw new ApiError(errorText || "API request failed", response.status, response.statusText)
}

export async function apiClient<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { data, headers: customHeaders, ...restOptions } = options

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const config: RequestInit = {
    method: data ? "POST" : "GET",
    headers: {
      ...defaultHeaders,
      ...customHeaders,
    },
    ...restOptions,
  }

  if (data) {
    config.body = JSON.stringify(data)
  }

  try {
    const response = await fetch(endpoint, config)
    return await handleResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiError) {
      logError(`[API Client] ${error.status} ${error.statusText}: ${error.message}`, error)
    } else {
      logError(`[API Client] Network or other error for endpoint ${endpoint}`, error)
    }
    throw error
  }
}
