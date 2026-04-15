/**
 * @attestto/login — One-line DID login for any website.
 *
 * Provides <attestto-login> Web Component with:
 * - DID wallet login (via @attestto/id-wallet-adapter)
 * - OAuth bridge (Google, Microsoft → VC → wallet)
 * - Session management helpers
 *
 * Re-exports the full wallet adapter API for advanced use cases.
 */

// The login component
export { AttesttoLogin } from './components/attestto-login.js'

// Re-export wallet adapter for advanced use
export {
  discoverWallets,
  registerWallet,
  pickWallet,
  requestSignature,
  verifyPresentation,
} from '@attestto/id-wallet-adapter'

// Re-export types
export type {
  WalletAnnouncement,
  WalletProtocol,
  VerifyResult,
  VerifyError,
  PickWalletOptions,
  SignRequest,
  SignResponse,
} from '@attestto/id-wallet-adapter'

// Login-specific types
export type { LoginConfig, LoginResult, OAuthProvider, LoginEvent } from './types.js'
