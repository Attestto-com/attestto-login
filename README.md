# @attestto/login

[![npm version](https://img.shields.io/npm/v/@attestto/login.svg)](https://www.npmjs.com/package/@attestto/login)
[![license](https://img.shields.io/npm/l/@attestto/login.svg)](./LICENSE)

![Works with: Vanilla JS](https://img.shields.io/badge/Vanilla_JS-✓-F7DF1E?logo=javascript&logoColor=black)
![Works with: React](https://img.shields.io/badge/React-✓-61DAFB?logo=react&logoColor=black)
![Works with: Vue](https://img.shields.io/badge/Vue-✓-4FC08D?logo=vuedotjs&logoColor=white)
![Works with: Svelte](https://img.shields.io/badge/Svelte-✓-FF3E00?logo=svelte&logoColor=white)
![Works with: Angular](https://img.shields.io/badge/Angular-✓-DD0031?logo=angular&logoColor=white)
![Works with: WordPress](https://img.shields.io/badge/WordPress-✓-21759B?logo=wordpress&logoColor=white)
![No framework required](https://img.shields.io/badge/No_framework_required-✓-gray)

> One-line DID login for any website. Drop a Web Component, get passwordless authentication backed by cryptographic identity. Falls back to Google/Microsoft OAuth and converts tokens into portable Verifiable Credentials.

`@attestto/login` gives your users decentralized identity login with zero friction. No passwords, no OAuth vendor lock-in, no monthly subscription. One HTML element, works in any page. Part of the [Attestto](https://attestto.org) identity infrastructure.

**[Documentation](https://attestto.org/docs/quickstart/add-did-login/)** · **[Playground](https://attestto.org/docs/verify/playground/)** · **[Full API](https://attestto.org/docs/wallets/)**

## Quick start

### Option 1: Copy-paste (any website, WordPress, Joomla, static HTML)

```html
<script type="module" src="https://unpkg.com/@attestto/login"></script>
<attestto-login></attestto-login>
```

That's it. Users see a "Login with DID" button. If they have a DID wallet extension installed, they authenticate with cryptographic proof. No passwords.

### Option 2: npm (React, Vue, Svelte, Angular)

```bash
npm install @attestto/login
```

```typescript
import '@attestto/login'
// Now use <attestto-login> in your templates
```

### With OAuth fallback

Users without a DID wallet can still log in. Their OAuth token gets converted into a Verifiable Credential — next time, they use the credential directly.

```html
<attestto-login
  providers="google,microsoft"
  issuer-endpoint="/api/auth/issue-vc"
  trusted-issuers="did:web:yoursite.com"
></attestto-login>
```

First login uses Google. Every login after uses their DID wallet. Google is cut out of the loop.

## How it works

```
User clicks "Login with DID"
  → pickWallet() shows wallet selector
  → Wallet presents Verifiable Credential (CHAPI)
  → verifyPresentation() validates the trust chain
  → login-success event fires with user's DID

User clicks "Continue with Google" (fallback)
  → OAuth redirect to your backend
  → Backend verifies Google token
  → Backend issues a Verifiable Credential
  → VC stored in user's wallet
  → Next login uses DID path directly
```

## Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `providers` | string | `""` | Comma-separated OAuth providers: `"google,microsoft"` |
| `issuer-endpoint` | string | `""` | Backend URL for OAuth → VC exchange |
| `trusted-issuers` | string | `""` | Comma-separated trusted issuer DIDs |
| `resolver-url` | string | `""` | DID resolver URL for VP verification |
| `did-label` | string | `"Login with DID"` | Primary button label |
| `theme` | `"light"` \| `"dark"` | `"light"` | Color scheme |
| `compact` | boolean | `false` | Button-only mode (no card wrapper) |

## Events

All events are `composed` — they cross Shadow DOM boundaries.

| Event | Detail | When |
|---|---|---|
| `login-success` | `LoginResult` | Authentication succeeded |
| `login-error` | `{ error, method }` | Authentication failed or cancelled |
| `oauth-start` | `{ provider }` | User clicked an OAuth button |
| `wallets-discovered` | `{ count, wallets }` | Wallet discovery completed |

```javascript
const login = document.querySelector('attestto-login')

login.addEventListener('login-success', (e) => {
  console.log('Authenticated:', e.detail.did)
  console.log('Method:', e.detail.method) // 'did' or 'google'

  // Create your session
  fetch('/api/session', {
    method: 'POST',
    body: JSON.stringify({ did: e.detail.did })
  })
})
```

## CSS theming

Override CSS custom properties to match your brand:

```css
attestto-login {
  --attestto-primary: #594FD3;
  --attestto-primary-hover: #7B72ED;
  --attestto-text: #1a1a2e;
  --attestto-bg: #ffffff;
  --attestto-bg-card: #f8fafc;
  --attestto-border: #e2e8f0;
  --attestto-font: system-ui, sans-serif;
}
```

Style internal elements via CSS parts:

```css
attestto-login::part(did-button) { border-radius: 20px; }
attestto-login::part(oauth-button) { font-size: 0.85rem; }
attestto-login::part(divider) { margin: 1.5rem 0; }
```

## Advanced: use the wallet adapter directly

`@attestto/login` re-exports the full `@attestto/id-wallet-adapter` API for advanced use cases:

```typescript
import {
  discoverWallets,
  pickWallet,
  verifyPresentation,
  requestSignature,
} from '@attestto/login'

// Build your own login UI with full control
const wallets = await discoverWallets()
const wallet = await pickWallet()
const result = await verifyPresentation(vp, wallet, { resolverUrl, trustedIssuers })
```

## Backend: OAuth → VC exchange

Your backend handles the OAuth callback and issues a Verifiable Credential. Example with Express:

```typescript
app.get('/api/auth/issue-vc', async (req, res) => {
  const { provider, redirect } = req.query

  // 1. Run OAuth flow with the provider
  const oauthResult = await runOAuth(provider)

  // 2. Issue a VC proving the user authenticated
  const vc = await issuer.issue({
    type: 'AuthenticationCredential',
    subjectDid: oauthResult.did || generateDid(),
    claims: {
      provider,
      email: oauthResult.email,
      verifiedAt: new Date().toISOString(),
    },
  })

  // 3. Redirect back with the VC for wallet storage
  res.redirect(`${redirect}#vc=${encodeCredential(vc)}`)
})
```

## Ecosystem

| Package | Role |
|---|---|
| [`@attestto/id-wallet-adapter`](https://www.npmjs.com/package/@attestto/id-wallet-adapter) | Wallet discovery protocol (re-exported) |
| [`@attestto-com/vc-sdk`](https://www.npmjs.com/package/@attestto-com/vc-sdk) | Issue VCs server-side (OAuth bridge) |
| [`@attestto/verify`](https://www.npmjs.com/package/@attestto/verify) | Document verification + signing |

## Privacy

No tracking, no analytics, no telemetry. The component runs entirely client-side. OAuth tokens are exchanged via your own backend — Attestto never sees them. DID login never touches any server. See the [Attestto privacy model](https://attestto.org/docs/verify/).

## License

Apache 2.0 — see [LICENSE](./LICENSE)

---

**One line of HTML. Passwordless login. No vendor lock-in.**
