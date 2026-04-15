import type { WalletAnnouncement, VerifyResult } from '@attestto/id-wallet-adapter'

/** Supported OAuth providers for the bridge flow */
export type OAuthProvider = 'google' | 'microsoft' | 'custom'

/** Configuration for the <attestto-login> component */
export interface LoginConfig {
  /** OAuth providers to show as fallback options */
  providers?: OAuthProvider[]

  /** Backend endpoint that exchanges OAuth token → issues VC */
  issuerEndpoint?: string

  /** DID(s) of trusted credential issuers for verification */
  trustedIssuers?: string[]

  /** DID resolver URL for presentation verification */
  resolverUrl?: string

  /** Custom OAuth config per provider (client IDs, scopes) */
  oauth?: Partial<Record<OAuthProvider, OAuthConfig>>

  /** Timeout for wallet discovery (ms) */
  walletTimeout?: number

  /** Label for the primary DID login button */
  didLabel?: string

  /** Whether to auto-connect if only one wallet is found */
  autoConnect?: boolean
}

export interface OAuthConfig {
  clientId: string
  scopes?: string[]
  redirectUri?: string
}

/** Result of a successful login */
export interface LoginResult {
  /** How the user authenticated */
  method: 'did' | OAuthProvider

  /** The user's DID (always present after login) */
  did: string

  /** The wallet that provided the credential (DID login only) */
  wallet?: WalletAnnouncement

  /** Verification result from the presentation (DID login only) */
  verification?: VerifyResult

  /** The Verifiable Credential used for login */
  credential?: Record<string, unknown>

  /** Whether a new VC was issued (OAuth bridge flow) */
  vcIssued?: boolean
}

/** Events emitted by <attestto-login> */
export interface LoginEvent {
  /** Login succeeded */
  'login-success': LoginResult

  /** Login failed or was cancelled */
  'login-error': { error: string; method?: string }

  /** User clicked an OAuth provider button */
  'oauth-start': { provider: OAuthProvider }

  /** OAuth completed, VC being issued */
  'oauth-complete': { provider: OAuthProvider; vcIssued: boolean }

  /** Wallet discovery completed */
  'wallets-discovered': { count: number; wallets: WalletAnnouncement[] }
}
