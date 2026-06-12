# NFT Claim — Instructions for Source Site

Share this with your AI image site developer.

---

## What we provide

| Item | Value |
|------|-------|
| **Wallet URL** | `https://wallet.thesurrogate.me` |
| **Secret** | `CLAIM_LINK_SECRET` — we send this privately (do not expose in frontend code) |

---

## What they need to do

1. When the user clicks **“Claim as NFT”**, take the image’s public HTTPS URL.
2. Encrypt a small JSON payload with the shared secret (see below).
3. Redirect the user to:

```
https://wallet.thesurrogate.me/mint?d=<encrypted_token>
```

Use `encodeURIComponent(token)` on the token before putting it in the URL.

---

## JSON to encrypt

Only the image URL is required:

```json
{
  "imageUrl": "https://your-cdn.com/path/to/image.png"
}
```

Optional — link expiry (recommended, 24 hours):

```json
{
  "imageUrl": "https://your-cdn.com/path/to/image.png",
  "exp": 1717891200000
}
```

`exp` = Unix timestamp in **milliseconds**. Example: `Date.now() + 24 * 60 * 60 * 1000`

---

## How to encrypt (Node.js — use on your server)

```javascript
const crypto = require("crypto");

const CLAIM_LINK_SECRET = process.env.CLAIM_LINK_SECRET; // from us
const WALLET_URL = "https://wallet.thesurrogate.me";

function encryptClaim(imageUrl) {
  const key = crypto.pbkdf2Sync(
    CLAIM_LINK_SECRET,
    "netzylo-claim-salt",
    100000,
    32,
    "sha256"
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const payload = JSON.stringify({
    imageUrl,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  });

  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  const token = Buffer.from(
    `${iv.toString("hex")}:${authTag}:${encrypted}`,
    "utf8"
  ).toString("base64url");

  return `${WALLET_URL}/mint?d=${encodeURIComponent(token)}`;
}

// Example
const claimUrl = encryptClaim("https://your-cdn.com/generated/abc123.png");
// redirect user: res.redirect(claimUrl) or window.location.href = claimUrl
```

**Encryption settings (must match exactly):**

- AES-256-GCM
- Key from PBKDF2-SHA256: password = secret, salt = `netzylo-claim-salt`, 100,000 iterations
- Token = `iv:authTag:ciphertext` (hex, colon-separated), then base64url-encode the whole string

---

## End-to-end flow

```
User generates image on your site
        ↓
Clicks "Claim as NFT"
        ↓
Your server encrypts { imageUrl } with the secret
        ↓
Redirect → https://wallet.thesurrogate.me/mint?d=<token>
        ↓
User logs in (if needed) → NFT minted to their wallet
```

---

## Notes

- `imageUrl` must be a **public HTTPS** link the wallet can load.
- Same user + same `imageUrl` = only minted once (duplicate claims are handled).
- **Do the encryption on your server** — never put the secret in browser JavaScript in production.
