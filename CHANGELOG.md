# Changelog

All notable changes to `@attestto/login` will be documented in this file.

This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
