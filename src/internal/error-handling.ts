/**
 * Internal error-handling helpers for `<attestto-login>` (ATT-714).
 *
 * Not part of the public API surface — file lives under `internal/`
 * and is not re-exported from the package entry. Exposed only so unit
 * tests can pin behavior directly.
 *
 * Two responsibilities:
 *   1. `withTimeout` — wrap any promise with a deadline so silent hangs
 *      become loud failures users can act on.
 *   2. `classifyError` — map raw thrown values into a user-facing
 *      `{ message, retryable }` shape. Drives whether the UI surfaces
 *      a "Try again" button (transient) or asks the user to take a
 *      different path (terminal).
 *
 * Canonical rule: "do not retry" copy is reserved for terminal failures.
 * See feedback_api_loading_state_discipline.md.
 */

export class LoginTimeoutError extends Error {
  readonly kind = 'transient' as const
  constructor(message: string) {
    super(message)
    this.name = 'LoginTimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LoginTimeoutError(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

export interface ClassifiedError {
  message: string
  retryable: boolean
}

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof LoginTimeoutError) {
    return { message: 'This is taking longer than expected. Please try again.', retryable: true }
  }
  const raw = err instanceof Error ? err.message : String(err ?? 'Login failed')
  const lower = raw.toLowerCase()
  // 5xx check comes BEFORE the network-keyword check because "504 Gateway
  // Timeout" contains "timeout" and would otherwise be classified as a
  // local connection issue when it is really a server-side problem.
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504')) {
    return { message: 'Something went wrong on our side. Please try again in a moment.', retryable: true }
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('connection') ||
    lower.includes('offline') ||
    lower.includes('econn') ||
    lower.includes('timeout')
  ) {
    return { message: 'Connection issue. Please try again.', retryable: true }
  }
  if (lower.includes('cancel') || lower.includes('aborted') || lower.includes('user denied')) {
    return { message: 'Sign-in was cancelled.', retryable: false }
  }
  return { message: raw, retryable: false }
}
