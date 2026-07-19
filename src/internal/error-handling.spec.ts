/**
 * Tests for internal error-handling helpers (ATT-714).
 *
 * Pure-function helpers — full coverage required per @attestto/* npm
 * hardening bar (feedback_npm_hardening_bar.md).
 */

import { describe, it, expect, vi } from 'vitest'
import { withTimeout, classifyError, LoginTimeoutError } from './error-handling.js'

describe('LoginTimeoutError', () => {
  it('exposes kind="transient"', () => {
    const err = new LoginTimeoutError('took too long')
    expect(err.kind).toBe('transient')
  })

  it('carries the message through', () => {
    const err = new LoginTimeoutError('took too long')
    expect(err.message).toBe('took too long')
  })

  it('has a useful name for logs', () => {
    const err = new LoginTimeoutError('x')
    expect(err.name).toBe('LoginTimeoutError')
  })

  it('is an Error instance', () => {
    expect(new LoginTimeoutError('x') instanceof Error).toBe(true)
  })
})

describe('withTimeout', () => {
  it('resolves with the underlying value when the promise wins', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'fast op')
    expect(result).toBe('ok')
  })

  it('rejects with the underlying error when the promise wins first', async () => {
    const inner = new Error('inner failure')
    await expect(withTimeout(Promise.reject(inner), 1000, 'op')).rejects.toBe(inner)
  })

  it('rejects with LoginTimeoutError when the timer wins', async () => {
    vi.useFakeTimers()
    try {
      const pending = new Promise<string>(() => {})
      const wrapped = withTimeout(pending, 500, 'slow op')
      vi.advanceTimersByTime(500)
      await expect(wrapped).rejects.toBeInstanceOf(LoginTimeoutError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('includes the label and timeout in the timeout error message', async () => {
    vi.useFakeTimers()
    try {
      const pending = new Promise<string>(() => {})
      const wrapped = withTimeout(pending, 250, 'fetch user')
      vi.advanceTimersByTime(250)
      await expect(wrapped).rejects.toThrow(/fetch user/)
      const wrapped2 = withTimeout(new Promise<string>(() => {}), 333, 'verify')
      vi.advanceTimersByTime(333)
      await expect(wrapped2).rejects.toThrow(/333ms/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timer when the promise resolves first (no leak)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.resolve('done'), 5000, 'op')
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('classifyError', () => {
  it('marks LoginTimeoutError as retryable with friendly copy', () => {
    const c = classifyError(new LoginTimeoutError('x'))
    expect(c.retryable).toBe(true)
    expect(c.message).toMatch(/longer than expected/i)
  })

  it.each([
    'fetch failed',
    'Network error',
    'connection reset',
    'offline',
    'ECONNREFUSED',
    'request timeout',
  ])('marks "%s" as transient/retryable', (msg) => {
    const c = classifyError(new Error(msg))
    expect(c.retryable).toBe(true)
    expect(c.message).toMatch(/connection issue/i)
  })

  it.each(['HTTP 500', 'Bad gateway 502', '503 Service Unavailable', '504 Gateway Timeout'])(
    'marks 5xx "%s" as retryable',
    (msg) => {
      const c = classifyError(new Error(msg))
      expect(c.retryable).toBe(true)
      expect(c.message).toMatch(/on our side/i)
    },
  )

  it.each(['User cancelled', 'aborted by user', 'user denied request'])(
    'marks "%s" as cancelled (not retryable)',
    (msg) => {
      const c = classifyError(new Error(msg))
      expect(c.retryable).toBe(false)
      expect(c.message).toMatch(/cancelled/i)
    },
  )

  it('marks verification failure as terminal (not retryable)', () => {
    const c = classifyError(new Error('signature_invalid: badsig'))
    expect(c.retryable).toBe(false)
    expect(c.message).toBe('signature_invalid: badsig')
  })

  it('handles non-Error throwables as terminal', () => {
    const c = classifyError('a raw string')
    expect(c.retryable).toBe(false)
    expect(c.message).toBe('a raw string')
  })

  it('handles null / undefined defensively', () => {
    expect(classifyError(null).message).toBe('Login failed')
    expect(classifyError(undefined).message).toBe('Login failed')
    expect(classifyError(null).retryable).toBe(false)
  })
})
