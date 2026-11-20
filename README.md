# Voltforge

**Describe it. Forge it.** — tryvoltforge.com

Voltforge is vibe engineering for hardware: describe a device in plain
words and get a complete, buildable Arduino-class project — a working
sketch (.ino), a parts list, a wiring map, and a step-by-step build guide.

Generation is *fenced*: every project is assembled from a library of
hand-checked building blocks (motion light, climate logger, plant monitor,
distance alarm, light tracker, sound meter) plus whitelisted parameters.
If a request matches no block, Voltforge says so and suggests the closest
buildable thing — it never fabricates a design.

## Layout

- `index.html` — landing: the one promise, a real sample project, pricing.
- `builder.html` — the studio: chat-style builder, demo accounts, credits.
- `js/blocks.js` — the known-good block library (templates, BOM, wiring).
- `js/engine.js` — matching, parameter whitelist, generation, exports.
- `js/account.js` — demo account + monthly-resetting credit layer.
- `js/app.js` — builder UI (all rendering via textContent/createElement).
- `js/util.js` — escaping, sanitization, download helpers.
- `css/styles.css` — the brand kit as CSS.
- `SECURITY.md` — the security posture and its honest limits.

## Running it

Static files only — open `index.html` in a browser, or serve the folder
(`python3 -m http.server`). Deployable to GitHub Pages as-is (root =
site root). No build step, no dependencies, no server.

## Model

Freemium, Base44-pattern: Free = 25 credits/month, resetting on the 1st;
paid subscriptions (Starter $16 / Builder $40 / Pro $80) carry bigger
monthly pools. Generation = 5 credits, each export = 1. Paid checkout is a
"launching soon" placeholder in v1 — see SECURITY.md for what is demo-grade
and what the launch gates are.

## Organizing principle

Product frozen at a finished-feeling v1; growth lever is marketing;
updates ship as occasional named drops. See `../SETUP-RECORD.md`.
