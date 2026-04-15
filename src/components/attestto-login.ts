import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  discoverWallets,
  pickWallet,
  verifyPresentation,
  type WalletAnnouncement,
} from '@attestto/id-wallet-adapter'
import type { LoginConfig, LoginResult, OAuthProvider } from '../types.js'

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

  @state() private _wallets: WalletAnnouncement[] = []
  @state() private _status: string = ''
  @state() private _loading: boolean = false
  @state() private _error: string = ''

  connectedCallback(): void {
    super.connectedCallback()
    this._discoverWallets()
  }

  private async _discoverWallets(): Promise<void> {
    try {
      const wallets = await discoverWallets(1500)
      this._wallets = wallets
      this._emitEvent('wallets-discovered', {
        count: wallets.length,
        wallets,
      })
    } catch {
      // Silent — wallet discovery is best-effort
    }
  }

  private async _handleDIDLogin(): Promise<void> {
    this._loading = true
    this._error = ''
    this._status = 'Connecting to wallet...'

    try {
      const wallet = await pickWallet()
      if (!wallet) {
        this._loading = false
        this._status = ''
        return // User cancelled
      }

      this._status = 'Requesting credentials...'

      // Request a Verifiable Presentation via CHAPI
      const vp = await navigator.credentials.get({
        // @ts-expect-error — CHAPI web credential type
        web: {
          VerifiablePresentation: {
            query: { type: 'DIDAuthentication' },
            challenge: crypto.randomUUID(),
            domain: window.location.origin,
          },
        },
      })

      if (!vp) {
        this._error = 'No credentials received'
        this._loading = false
        return
      }

      this._status = 'Verifying...'

      const trustedArr = this.trustedIssuers
        ? this.trustedIssuers.split(',').map((s) => s.trim())
        : []

      const result = await verifyPresentation(vp as unknown as Record<string, unknown>, wallet, {
        resolverUrl: this.resolverUrl || undefined,
        trustedIssuers: trustedArr.length > 0 ? trustedArr : ['*'],
      } as Parameters<typeof verifyPresentation>[2])

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
        const errMsg = result.errors.map((e) => e.code).join(', ')
        this._error = `Verification failed: ${errMsg}`
        this._emitEvent('login-error', {
          error: errMsg,
          method: 'did',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      this._error = msg
      this._emitEvent('login-error', { error: msg, method: 'did' })
    } finally {
      this._loading = false
    }
  }

  private _handleOAuthLogin(provider: OAuthProvider): void {
    if (!this.issuerEndpoint) {
      this._error = 'No issuer-endpoint configured for OAuth'
      return
    }

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

        ${this._status
          ? html`<div part="status" class="status">${this._status}</div>`
          : nothing}

        ${this._error
          ? html`<div part="status" class="status error">${this._error}</div>`
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

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'attestto-login': AttesttoLogin
  }
}
