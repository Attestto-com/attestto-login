// @vitest-environment jsdom
/**
 * SOC-6 — the DID login flow must bind the presentation to the challenge and
 * origin it issued, and require the verifier to enforce that binding.
 *
 * These tests drive `_handleDIDLogin` end to end with a mocked adapter and a
 * stubbed CHAPI call, asserting that the exact `challenge`/`domain` sent to the
 * wallet are the `expectedChallenge`/`expectedDomain` handed to verifyPresentation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted so the mock factory (itself hoisted above module scope) can see them.
const { wallet, verifyPresentation } = vi.hoisted(() => ({
  wallet: { did: 'did:sns:holder.attestto.sol', name: 'W', protocols: [] },
  verifyPresentation: vi.fn(),
}))

vi.mock('@attestto/id-wallet-adapter', () => ({
  discoverWallets: vi.fn().mockResolvedValue([]),
  registerWallet: vi.fn(),
  pickWallet: vi.fn().mockResolvedValue(wallet),
  requestSignature: vi.fn(),
  verifyPresentation,
}))

import { AttesttoLogin } from './components/attestto-login.js'

/** Capture the CHAPI request so we can compare its challenge/domain to what the verifier is told. */
function stubCredentialsGet(): { requested: () => { challenge: string; domain: string } } {
  let captured = { challenge: '', domain: '' }
  const get = vi.fn(async (opts: unknown) => {
    const web = (opts as { web: { VerifiablePresentation: { challenge: string; domain: string } } }).web
    captured = {
      challenge: web.VerifiablePresentation.challenge,
      domain: web.VerifiablePresentation.domain,
    }
    // Return a minimal VP object; the adapter is mocked so its shape is irrelevant here.
    return { type: ['VerifiablePresentation'], holder: wallet.did }
  })
  vi.stubGlobal('navigator', { credentials: { get } })
  return { requested: () => captured }
}

describe('SOC-6 — challenge/domain binding is passed to the verifier', () => {
  beforeEach(() => {
    verifyPresentation.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the issued challenge and origin as expectedChallenge/expectedDomain', async () => {
    const cred = stubCredentialsGet()
    verifyPresentation.mockResolvedValue({ valid: true, holderDid: wallet.did, errors: [] })

    const el = new AttesttoLogin()
    await (el as unknown as { _handleDIDLogin: () => Promise<void> })._handleDIDLogin()

    expect(verifyPresentation).toHaveBeenCalledTimes(1)
    const opts = verifyPresentation.mock.calls[0][2] as { expectedChallenge: string; expectedDomain: string }
    const req = cred.requested()

    // The verifier must be told to require exactly what the wallet was asked for.
    expect(opts.expectedChallenge).toBe(req.challenge)
    expect(opts.expectedDomain).toBe(req.domain)
    expect(opts.expectedDomain).toBe(window.location.origin)
    expect(opts.expectedChallenge).toMatch(/[0-9a-f-]{36}/i) // a real UUID, not empty
  })

  it('does not emit login-success when the verifier reports the binding invalid', async () => {
    stubCredentialsGet()
    verifyPresentation.mockResolvedValue({
      valid: false,
      holderDid: wallet.did,
      errors: [{ code: 'DOMAIN_MISMATCH', message: 'replay' }],
    })

    const el = new AttesttoLogin()
    const success = vi.fn()
    el.addEventListener('login-success', success)

    await (el as unknown as { _handleDIDLogin: () => Promise<void> })._handleDIDLogin()

    expect(success).not.toHaveBeenCalled()
  })
})
