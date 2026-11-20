# Voltforge — Security Posture

Voltforge v1 is a fully static site (plain HTML/CSS/JS, no build step, no
server, no backend). This document states what is protected, how, and —
just as plainly — what is **not** protected yet. Dean flagged vibe-coded-site
security failures as a launch risk; this file is the standing answer.

## Applied in v1

1. **No secrets in client code.** There are no API keys, tokens, or
   credentials anywhere in this repository. The site calls no external API
   (`connect-src 'none'`). Anything secret-shaped found in the codebase is a
   bug — report it.
2. **No unsanitized HTML, ever.** All dynamic rendering goes through
   `textContent` / `createElement` (see `js/app.js`). There is no
   `innerHTML` assignment with dynamic data, no `eval`, no
   `document.write`, no inline event handlers, and no inline scripts —
   the CSP below would block them anyway.
3. **Content-Security-Policy + referrer policy on every page** (meta):
   `default-src 'self'; script-src 'self'; style-src 'self'
   https://fonts.googleapis.com; font-src 'self'
   https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none';
   object-src 'none'; base-uri 'self'; form-action 'self'`, and
   `referrer: strict-origin-when-cross-origin`.
   Known limit: meta-delivered CSP cannot carry `frame-ancestors` or
   reporting directives, and GitHub Pages cannot set custom HTTP headers.
   If clickjacking protection becomes a requirement, move hosting to a
   platform that sets real headers.
4. **Fenced generation — user text never becomes code.** Sketches are
   assembled from hand-checked templates in `js/blocks.js`. The only values
   that flow into them pass `VFEngine.validateParams`: pins must be in the
   fixed sets (D2–D13, A0–A5), numbers are clamped to each block's declared
   range, enums must match declared options, unknown keys are dropped.
   There is no code path from a chat prompt to generated code.
5. **Free text is sanitized at the boundary.** Project names pass
   `VFUtil.sanitizeName` (length cap, control/markup/comment-breaking
   characters stripped) before appearing anywhere — including inside sketch
   comments and the build guide, where they are additionally HTML-escaped.
   Prompts are capped at 300 characters (attribute + engine constant) and
   are only ever echoed back as text.
6. **Exports are built, not interpolated.** The .ino, .csv, .json, and
   build-guide downloads are produced by pure builder functions from the
   validated project object. The guide is a standalone HTML file with no
   scripts at all; every project string inside it is escaped. CSV cells are
   quoted per RFC 4180 rules.
7. **Credit gating is enforced in the flow.** Generation costs 5 credits,
   exports 1, checked and deducted in `VFAccount.spend` before the action
   runs. Balances live in localStorage; the monthly reset refills on the
   calendar month, it cannot be farmed by re-generating within a month.

## Honest limits (demo-grade, by design)

- **Accounts are a demo layer.** They exist only in the visitor's browser
  (localStorage). Passwords are obfuscated with a simple non-crypto hash
  (FNV-1a) purely so they are not stored as readable plaintext — **this is
  not password security** and the UI says so. Anyone with access to the
  browser profile can read or reset local account data. Real authentication
  (server-side, hashed with a proper KDF, sessions, recovery) is a launch
  gate.
- **Credits are client-side.** A determined user can edit localStorage and
  mint themselves credits. Acceptable for a free demo tier; billing-grade
  enforcement requires the server that arrives with real payments.
- **No payments exist yet.** Paid-plan buttons are "launching soon"
  placeholders. No card data is collected, requested, or handled anywhere
  on this site. Real checkout (Stripe, Dean's identity step) is a launch
  gate.
- **No analytics, no trackers, no third-party scripts.** The only external
  requests are Google Fonts (CSS + font files).

## Rules for future changes (named drops included)

- Never add a secret to client code. If a feature needs one, it needs a
  server first.
- Never render user-controlled text with `innerHTML`. `textContent` or
  escape — no third option.
- New generation parameters must go through `validateParams` with a
  declared type and range. Free text still never enters a template.
- Any new third-party origin must be added to the CSP deliberately, in the
  same commit, with a line in this file explaining why.
