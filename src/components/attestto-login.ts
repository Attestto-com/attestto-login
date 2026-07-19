import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  discoverWallets,
  pickWallet,
  verifyPresentation,
  type WalletAnnouncement,
} from '@attestto/id-wallet-adapter'
import type { LoginConfig, LoginResult, OAuthProvider } from '../types.js'
import { withTimeout, classifyError } from '../internal/error-handling.js'

/**
 * <attestto-login> — One-line login component.
 *
 * Shows a DID wallet login button (primary) with optional OAuth fallback buttons.
 * DID flow: pickWallet → request VP → verifyPresentation → emit login-success.
 * OAuth flow: redirect → backend issues VC → store in wallet → emit login-success.
 *
 * @fires login-success - LoginResult
 * @fires login-error - { error: string, method?: string }
 * @fires oauth-start - { provider: OAuthProvider }
 * @fires wallets-discovered - { count: number }
 *
 * @csspart container - Outer wrapper
 * @csspart did-button - Primary DID login button
 * @csspart oauth-button - OAuth provider button
 * @csspart divider - "or" divider between DID and OAuth
 * @csspart status - Status message area
 */
@customElement('attestto-login')
export class AttesttoLogin extends LitElement {
  /** Comma-separated OAuth providers: "google,microsoft" */
  @property({ type: String }) providers = ''

  /** Backend endpoint for OAuth → VC exchange */
  @property({ type: String, attribute: 'issuer-endpoint' }) issuerEndpoint = ''

  /** Comma-separated trusted issuer DIDs */
  @property({ type: String, attribute: 'trusted-issuers' }) trustedIssuers = ''

  /** DID resolver URL */
  @property({ type: String, attribute: 'resolver-url' }) resolverUrl = ''

  /** Primary button label */
  @property({ type: String, attribute: 'did-label' }) didLabel = 'Login with DID'

  /** Component theme */
  @property({ type: String }) theme: 'light' | 'dark' = 'light'

  /** Compact mode — just the button, no card wrapper */
  @property({ type: Boolean }) compact = false

  /** Timeout for wallet-side user interactions (pickWallet, credentials.get). Default 60s. */
  @property({ type: Number, attribute: 'wallet-timeout-ms' }) walletTimeoutMs = 60000

  /** Timeout for network calls (verifyPresentation). Default 20s. */
  @property({ type: Number, attribute: 'api-timeout-ms' }) apiTimeoutMs = 20000

  @state() private _wallets: WalletAnnouncement[] = []
  @state() private _status: string = ''
  @state() private _loading: boolean = false
  @state() private _error: string = ''
  @state() private _errorRetryable: boolean = false
  @state() private _discoveryDone: boolean = false

  connectedCallback(): void {
    super.connectedCallback()
    this._discoverWallets()
  }

  private async _discoverWallets(): Promise<void> {
    try {
      const wallets = await discoverWallets(1500)
      this._wallets = wallets
      this._discoveryDone = true
      this._emitEvent('wallets-discovered', {
        count: wallets.length,
        wallets,
      })
    } catch {
      this._discoveryDone = true
      // Silent — wallet discovery is best-effort
    }
  }

  private async _handleDIDLogin(): Promise<void> {
    if (this._loading) return // hard guard against double-fire
    this._loading = true
    this._error = ''
    this._errorRetryable = false
    this._status = 'Connecting to wallet...'

    try {
      const wallet = await withTimeout(pickWallet(), this.walletTimeoutMs, 'Wallet selection')
      if (!wallet) {
        this._loading = false
        this._status = ''
        return // User cancelled
      }

      this._status = 'Requesting credentials...'

      // Freshness + audience binding (SOC-6). Generate the challenge and domain
      // ONCE and keep them: the same values requested here are required back on
      // the returned presentation (see verifyPresentation below). A VP that was
      // not produced for this exact challenge and this origin — e.g. one captured
      // on a phishing page or replayed from a prior session — is rejected.
      const challenge = crypto.randomUUID()
      const domain = window.location.origin

      // Request a Verifiable Presentation via CHAPI
      const vp = await withTimeout(
        navigator.credentials.get({
          // @ts-expect-error — CHAPI web credential type
          web: {
            VerifiablePresentation: {
              query: { type: 'DIDAuthentication' },
              challenge,
              domain,
            },
          },
        }),
        this.walletTimeoutMs,
        'Credential request',
      )

      if (!vp) {
        const cancelled = classifyError(new Error('user denied'))
        this._error = cancelled.message
        this._errorRetryable = false
        this._loading = false
        return
      }

      this._status = 'Verifying...'

      const trustedArr = this.trustedIssuers
        ? this.trustedIssuers.split(',').map((s) => s.trim())
        : []

      // Typed against an explicit shape so a rename/typo of expectedChallenge/
      // expectedDomain is caught by tsc. The cast only bridges to the adapter's
      // VerifyOptions (the pinned install may lag the binding-enforcing version and
      // types resolverUrl as required); it must not mask the two fields below.
      const verifyOptions: {
        resolverUrl?: string
        trustedIssuers: string[]
        // Require the presentation to be bound to the challenge/domain we just
        // issued. The verifier rejects a mismatch, so `login-success` below is
        // never reached for a replayed or cross-origin presentation.
        expectedChallenge: string
        expectedDomain: string
      } = {
        resolverUrl: this.resolverUrl || undefined,
        trustedIssuers: trustedArr.length > 0 ? trustedArr : ['*'],
        expectedChallenge: challenge,
        expectedDomain: domain,
      }

      const result = await withTimeout(
        verifyPresentation(
          vp as unknown as Record<string, unknown>,
          wallet,
          verifyOptions as Parameters<typeof verifyPresentation>[2],
        ),
        this.apiTimeoutMs,
        'Verification',
      )

      if (result.valid) {
        const loginResult: LoginResult = {
          method: 'did',
          did: result.holderDid || wallet.did,
          wallet,
          verification: result,
        }
        this._emitEvent('login-success', loginResult)
        this._status = `Authenticated: ${loginResult.did}`
      } else {
        // Verification failure is terminal — a different credential is needed,
        // not a retry of the same one.
        const errMsg = result.errors.map((e) => e.code).join(', ') || 'unknown'
        this._error = `Verification failed: ${errMsg}`
        this._errorRetryable = false
        this._emitEvent('login-error', { error: errMsg, method: 'did' })
      }
    } catch (err) {
      const classified = classifyError(err)
      this._error = classified.message
      this._errorRetryable = classified.retryable
      const rawMsg = err instanceof Error ? err.message : String(err ?? 'Login failed')
      this._emitEvent('login-error', { error: rawMsg, method: 'did' })
    } finally {
      this._loading = false
      this._status = ''
    }
  }

  /** Public reset — clears error/status. Useful for parent apps. */
  reset(): void {
    if (this._loading) return
    this._error = ''
    this._errorRetryable = false
    this._status = ''
  }

  private _handleOAuthLogin(provider: OAuthProvider): void {
    if (this._loading) return // hard guard against double-fire
    if (!this.issuerEndpoint) {
      this._error = 'OAuth sign-in is not configured for this site.'
      this._errorRetryable = false
      return
    }

    // Lock UI while we hand off to the OAuth flow — even though the redirect
    // happens immediately, the brief lock prevents double-clicks before the
    // browser navigates away.
    this._loading = true
    this._error = ''
    this._errorRetryable = false
    this._status = `Redirecting to ${provider}…`

    this._emitEvent('oauth-start', { provider })

    // Redirect to backend OAuth endpoint
    // The backend handles: OAuth flow → verify token → issue VC → redirect back
    const params = new URLSearchParams({
      provider,
      redirect: window.location.href,
    })
    window.location.href = `${this.issuerEndpoint}?${params}`
  }

  private _emitEvent(name: string, detail: unknown): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      })
    )
  }

  private _getProviderList(): OAuthProvider[] {
    if (!this.providers) return []
    return this.providers
      .split(',')
      .map((p) => p.trim() as OAuthProvider)
      .filter(Boolean)
  }

  private _providerLabel(p: OAuthProvider): string {
    const labels: Record<OAuthProvider, string> = {
      google: 'Continue with Google',
      microsoft: 'Continue with Microsoft',
      custom: 'Continue with SSO',
    }
    return labels[p] || `Continue with ${p}`
  }

  private _providerIcon(p: OAuthProvider): string {
    const icons: Record<OAuthProvider, string> = {
      google: '&#x47;', // G
      microsoft: '&#x25A0;', // square
      custom: '&#x1F511;', // key
    }
    return icons[p] || ''
  }

  render() {
    const providers = this._getProviderList()
    const hasOAuth = providers.length > 0
    const isDark = this.theme === 'dark'

    return html`
      <div part="container" class="container ${isDark ? 'dark' : 'light'} ${this.compact ? 'compact' : ''}">

        <button
          part="did-button"
          class="btn btn-did"
          @click=${this._handleDIDLogin}
          ?disabled=${this._loading}
        >
          ${this._loading
            ? html`<span class="spinner"></span>`
            : html`<span class="icon">&#x1F511;</span>`}
          ${this.didLabel}
          ${this._wallets.length > 0
            ? html`<span class="wallet-count">${this._wallets.length} wallet${this._wallets.length > 1 ? 's' : ''}</span>`
            : nothing}
        </button>

        ${this._discoveryDone && this._wallets.length === 0
          ? html`<div part="no-wallet" class="no-wallet">
              No DID wallet detected. Install a
              <a href="https://attestto.org/docs/wallets/" target="_blank" rel="noopener">compatible wallet</a>
              or use an OAuth provider below.
            </div>`
          : nothing}

        ${hasOAuth
          ? html`
              <div part="divider" class="divider">
                <span>or</span>
              </div>
              ${providers.map(
                (p) => html`
                  <button
                    part="oauth-button"
                    class="btn btn-oauth btn-${p}"
                    @click=${() => this._handleOAuthLogin(p)}
                    ?disabled=${this._loading}
                  >
                    <span class="provider-icon">${this._providerLabel(p)}</span>
                  </button>
                `
              )}
            `
          : nothing}

        ${this._loading
          ? html`
              <div
                part="loading"
                class="loading"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div class="loading-bar"><div class="loading-bar-fill"></div></div>
                <span class="loading-text">${this._status || 'Working…'}</span>
              </div>
            `
          : nothing}

        ${this._status && !this._loading && !this._error
          ? html`<div part="status" class="status">${this._status}</div>`
          : nothing}

        ${this._error
          ? html`
              <div part="status" class="status error" role="alert">
                ${this._error}
                ${this._errorRetryable
                  ? html`
                      <button
                        part="retry-button"
                        class="btn btn-retry"
                        type="button"
                        @click=${this._handleDIDLogin}
                      >
                        Try again
                      </button>
                    `
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `
  }

  static styles = css`
    :host {
      display: block;
      --login-primary: var(--attestto-primary, #594FD3);
      --login-primary-hover: var(--attestto-primary-hover, #7B72ED);
      --login-text: var(--attestto-text, #1a1a2e);
      --login-text-muted: var(--attestto-text-muted, #64748b);
      --login-bg: var(--attestto-bg, #ffffff);
      --login-bg-card: var(--attestto-bg-card, #f8fafc);
      --login-border: var(--attestto-border, #e2e8f0);
      --login-font: var(--attestto-font, system-ui, -apple-system, sans-serif);
      --login-radius: 8px;
    }

    .container {
      font-family: var(--login-font);
      max-width: 360px;
      padding: 1.5rem;
      border-radius: var(--login-radius);
      background: var(--login-bg-card);
      border: 1px solid var(--login-border);
    }

    .container.compact {
      padding: 0;
      background: none;
      border: none;
      max-width: none;
    }

    .container.dark {
      --login-text: #e2e8f0;
      --login-text-muted: #94a3b8;
      --login-bg: #0f0f1a;
      --login-bg-card: #1a1d27;
      --login-border: #2a2d3a;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: var(--login-radius);
      font-size: 0.9rem;
      font-weight: 500;
      font-family: var(--login-font);
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-did {
      background: var(--login-primary);
      color: white;
      border-color: var(--login-primary);
    }

    .btn-did:hover:not(:disabled) {
      background: var(--login-primary-hover);
      border-color: var(--login-primary-hover);
    }

    .btn-oauth {
      background: var(--login-bg);
      color: var(--login-text);
      border: 1px solid var(--login-border);
      margin-top: 0.5rem;
    }

    .btn-oauth:hover:not(:disabled) {
      background: var(--login-bg-card);
      border-color: var(--login-primary);
    }

    .icon {
      font-size: 1.1rem;
    }

    .wallet-count {
      font-size: 0.7rem;
      background: rgba(255, 255, 255, 0.2);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      margin-left: auto;
    }

    .divider {
      display: flex;
      align-items: center;
      margin: 1rem 0;
      gap: 0.75rem;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--login-border);
    }

    .divider span {
      font-size: 0.75rem;
      color: var(--login-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status {
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: var(--login-text-muted);
      text-align: center;
    }

    .status.error {
      color: #ef4444;
    }

    .no-wallet {
      margin-top: 0.6rem;
      padding: 0.6rem 0.8rem;
      background: var(--login-bg);
      border: 1px dashed var(--login-border);
      border-radius: var(--login-radius);
      font-size: 0.78rem;
      color: var(--login-text-muted);
      text-align: center;
      line-height: 1.5;
    }

    .no-wallet a {
      color: var(--login-primary);
      text-decoration: underline;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .loading {
      margin-top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: stretch;
    }

    .loading-bar {
      height: 3px;
      width: 100%;
      overflow: hidden;
      border-radius: 2px;
      background: var(--login-border);
    }

    .loading-bar-fill {
      width: 40%;
      height: 100%;
      background: var(--login-primary);
      animation: indeterminate 1.2s ease-in-out infinite;
    }

    .loading-text {
      font-size: 0.8rem;
      color: var(--login-text-muted);
      text-align: center;
    }

    .btn-retry {
      margin-top: 0.5rem;
      background: var(--login-bg);
      color: var(--login-text);
      border: 1px solid var(--login-border);
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }

    .btn-retry:hover:not(:disabled) {
      border-color: var(--login-primary);
      color: var(--login-primary);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes indeterminate {
      0%   { margin-left: -40%; }
      100% { margin-left: 100%; }
    }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'attestto-login': AttesttoLogin
  }
}
