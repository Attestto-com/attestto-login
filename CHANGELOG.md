# Changelog

All notable changes to `@attestto/login` will be documented in this file.

This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-07-19

### Security
- **DID login now binds the presentation to its challenge and origin (SOC-6).** The component already generated a fresh `challenge` and `domain` for the CHAPI request but discarded them; it now keeps both and passes them to `verifyPresentation` as `expectedChallenge` / `expectedDomain`. A presentation that was not produced for this exact challenge and this origin — e.g. one captured on a phishing page or replayed from a prior session — is rejected by the verifier, so `login-success` is never emitted for a replayed or cross-origin presentation.

### Changed
- Requires `@attestto/id-wallet-adapter@^0.6.0`, which enforces the challenge/domain binding. Earlier adapter versions ignore the new options and do **not** provide replay protection.

### Added
- 2 tests asserting the issued challenge/origin are handed to the verifier and that `login-success` is withheld when the verifier reports the binding invalid (51 total).

## [0.1.2] - 2026-06-29

### Added
- **Universal API loading-state discipline** (ATT-714): every async step in the DID login flow now has an explicit timeout, a visible indeterminate progress bar (in addition to the in-button spinner), and `role="status"` + `aria-busy` on the loading region.
- New attributes `wallet-timeout-ms` (default 60000) and `api-timeout-ms` (default 20000) to tune timeouts per integration.
- `LoginTimeoutError` for surfaced timeout failures; `classifyError` helper maps raw errors into `{ message, retryable }` for retry-friendly UX.
- "Try again" button rendered automatically next to transient errors (timeout, network, 5xx). Terminal errors (verification, cancellation, config) do not invite retry.
- Public `reset()` method for parent applications to clear error/status state programmatically.
- 26 new tests covering the timeout + error-classification helpers (49 total).

### Fixed
- Silent hang during transient backend outages — DID login flow could wait indefinitely with no user feedback. All async calls (`pickWallet`, `navigator.credentials.get`, `verifyPresentation`) are now wrapped with timeouts.
- "Do not retry" copy on transient failures — error copy now correctly invites retry on network/timeout/5xx and reserves terminal copy for verification / cancellation / config errors.
- Double-fire on the DID login button if it was clicked again before the in-flight request settled.
- OAuth provider buttons now lock during the redirect window to prevent multi-fires.

## [0.1.1] - 2026-04-16

### Added
- "No DID wallet detected" message when wallet discovery finds zero wallets. Links to compatible wallet documentation.
- Test suite: 23 tests covering type exports, component class validation, provider list parsing, trusted issuers parsing, OAuth redirect construction, CustomEvent emission, and provider label mapping.

### Fixed
- Build order: Vite build runs before TypeScript declaration emit.
- VP type cast for CHAPI credential request compatibility.

## [0.1.0] - 2026-04-15

### Added
- Initial release: `<attestto-login>` Web Component for one-line DID login.
- **DID wallet login** via `@attestto/id-wallet-adapter`: wallet discovery, CHAPI credential request, Verifiable Presentation verification.
- **OAuth bridge** (Google, Microsoft, custom SSO): redirects to backend issuer endpoint for OAuth-to-VC exchange.
- HTML attribute API: `providers`, `issuer-endpoint`, `trusted-issuers`, `resolver-url`, `did-label`, `theme`, `compact`.
- Custom events: `login-success`, `login-error`, `oauth-start`, `oauth-complete`, `wallets-discovered`.
- CSS custom properties for theming (`--login-primary`, `--login-bg`, etc.).
- CSS parts for deep styling (`container`, `did-button`, `oauth-button`, `divider`, `status`).
- Light and dark theme support.
- Compact mode (button only, no card wrapper).
- Re-exports full `@attestto/id-wallet-adapter` API for advanced use cases.
- Zero framework dependencies — works in vanilla HTML, React, Vue, Svelte, Angular, WordPress, Joomla.
