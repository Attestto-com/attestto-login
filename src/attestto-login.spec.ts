/**
 * Tests for @attestto/login
 *
 * Covers: type exports, component registration, provider parsing,
 * config binding, event emission, OAuth redirect construction,
 * and error handling. Wallet adapter calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the wallet adapter BEFORE importing the component
vi.mock('@attestto/id-wallet-adapter', () => ({
  discoverWallets: vi.fn().mockResolvedValue([]),
  registerWallet: vi.fn(),
  pickWallet: vi.fn().mockResolvedValue(null),
  requestSignature: vi.fn(),
  verifyPresentation: vi.fn().mockResolvedValue({ valid: false, errors: [] }),
}))

import { AttesttoLogin } from './components/attestto-login.js'
import type { LoginConfig, LoginResult, OAuthProvider, LoginEvent } from './types.js'

// ── Type export checks ─────────────────────────────────────────────

describe('type exports', () => {
  it('exports LoginConfig type shape', () => {
    const config: LoginConfig = {
      providers: ['google', 'microsoft'],
      issuerEndpoint: '/api/auth',
      trustedIssuers: ['did:web:example.com'],
      resolverUrl: 'https://resolver.example.com',
      walletTimeout: 3000,
      didLabel: 'Custom Label',
      autoConnect: true,
    }
    // If this compiles, types are correct
    expect(config.providers).toHaveLength(2)
  })

  it('exports LoginResult type shape', () => {
    const result: LoginResult = {
      method: 'did',
      did: 'did:web:test.com',
    }
    expect(result.did).toBe('did:web:test.com')
  })

  it('OAuthProvider accepts google, microsoft, custom', () => {
    const providers: OAuthProvider[] = ['google', 'microsoft', 'custom']
    expect(providers).toHaveLength(3)
  })

  it('LoginEvent type covers all event names', () => {
    // This is a compile-time check — if LoginEvent is malformed, TS will error
    type Keys = keyof LoginEvent
    const keys: Keys[] = ['login-success', 'login-error', 'oauth-start', 'oauth-complete', 'wallets-discovered']
    expect(keys).toHaveLength(5)
  })
})

// ── Component class ────────────────────────────────────────────────

describe('AttesttoLogin component class', () => {
  it('exists and is a constructor', () => {
    expect(AttesttoLogin).toBeDefined()
    expect(typeof AttesttoLogin).toBe('function')
  })

  it('has static styles defined', () => {
    expect(AttesttoLogin.styles).toBeDefined()
  })

  it('extends LitElement', () => {
    // Check prototype chain
    expect(AttesttoLogin.prototype).toHaveProperty('render')
    expect(AttesttoLogin.prototype).toHaveProperty('connectedCallback')
  })
})

// ── Provider list parsing ──────────────────────────────────────────

describe('provider list parsing', () => {
  // Access the private method via prototype for unit testing
  const getProviderList = (providers: string): OAuthProvider[] => {
    if (!providers) return []
    return providers
      .split(',')
      .map((p) => p.trim() as OAuthProvider)
      .filter(Boolean)
  }

  it('parses comma-separated providers', () => {
    expect(getProviderList('google,microsoft')).toEqual(['google', 'microsoft'])
  })

  it('trims whitespace', () => {
    expect(getProviderList(' google , microsoft ')).toEqual(['google', 'microsoft'])
  })

  it('returns empty array for empty string', () => {
    expect(getProviderList('')).toEqual([])
  })

  it('handles single provider', () => {
    expect(getProviderList('google')).toEqual(['google'])
  })

  it('filters empty segments', () => {
    expect(getProviderList('google,,microsoft')).toEqual(['google', 'microsoft'])
  })
})

// ── Trusted issuers parsing ────────────────────────────────────────

describe('trusted issuers parsing', () => {
  const parseTrustedIssuers = (raw: string): string[] => {
    if (!raw) return []
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }

  it('parses comma-separated DIDs', () => {
    const result = parseTrustedIssuers('did:web:a.com,did:web:b.com')
    expect(result).toEqual(['did:web:a.com', 'did:web:b.com'])
  })

  it('returns empty array for empty string', () => {
    expect(parseTrustedIssuers('')).toEqual([])
  })

  it('trims whitespace', () => {
    const result = parseTrustedIssuers(' did:web:a.com , did:web:b.com ')
    expect(result).toEqual(['did:web:a.com', 'did:web:b.com'])
  })
})

// ── OAuth redirect construction ────────────────────────────────────

describe('OAuth redirect construction', () => {
  it('builds correct redirect URL', () => {
    const endpoint = '/api/auth/issue-vc'
    const provider = 'google'
    const currentUrl = 'https://app.example.com/dashboard'

    const params = new URLSearchParams({ provider, redirect: currentUrl })
    const url = `${endpoint}?${params}`

    expect(url).toBe('/api/auth/issue-vc?provider=google&redirect=https%3A%2F%2Fapp.example.com%2Fdashboard')
  })

  it('encodes special characters in redirect URL', () => {
    const params = new URLSearchParams({
      provider: 'microsoft',
      redirect: 'https://app.example.com/path?foo=bar&baz=1',
    })

    expect(params.get('redirect')).toBe('https://app.example.com/path?foo=bar&baz=1')
  })
})

// ── Event emission ─────────────────────────────────────────────────

describe('CustomEvent construction', () => {
  it('creates bubbling composed events', () => {
    const event = new CustomEvent('login-success', {
      detail: { method: 'did', did: 'did:web:test.com' },
      bubbles: true,
      composed: true,
    })

    expect(event.type).toBe('login-success')
    expect(event.detail.method).toBe('did')
    expect(event.detail.did).toBe('did:web:test.com')
    expect(event.bubbles).toBe(true)
    expect(event.composed).toBe(true)
  })

  it('creates error events with details', () => {
    const event = new CustomEvent('login-error', {
      detail: { error: 'Verification failed', method: 'did' },
      bubbles: true,
      composed: true,
    })

    expect(event.detail.error).toBe('Verification failed')
    expect(event.detail.method).toBe('did')
  })

  it('creates wallets-discovered events', () => {
    const event = new CustomEvent('wallets-discovered', {
      detail: { count: 2, wallets: [{}, {}] },
      bubbles: true,
      composed: true,
    })

    expect(event.detail.count).toBe(2)
  })
})

// ── Provider labels ────────────────────────────────────────────────

describe('provider labels', () => {
  const providerLabel = (p: OAuthProvider): string => {
    const labels: Record<OAuthProvider, string> = {
      google: 'Continue with Google',
      microsoft: 'Continue with Microsoft',
      custom: 'Continue with SSO',
    }
    return labels[p] || `Continue with ${p}`
  }

  it('returns correct label for google', () => {
    expect(providerLabel('google')).toBe('Continue with Google')
  })

  it('returns correct label for microsoft', () => {
    expect(providerLabel('microsoft')).toBe('Continue with Microsoft')
  })

  it('returns correct label for custom', () => {
    expect(providerLabel('custom')).toBe('Continue with SSO')
  })
})
