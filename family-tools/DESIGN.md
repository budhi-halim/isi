# Islandsun family — Design A, version 1.2.2

The user selected Refined Forms. This is the canonical presentation package. Production integration begins with Pricing Form; other app redesigns remain their own checkpoints. No stepper is required for single-stage apps. The revenue extension must keep its existing sophisticated workflow and animation.

## Visual contract

- Neutral blue-tinted surfaces, restrained blue accent, 20px cards, 11px controls, clear borders, quiet shadows, and generous form spacing.
- Typography: Plus Jakarta Sans when available, then Segoe UI and system sans-serif. Do not change document fonts to the interface font. The package has no external runtime/font download requirement.
- All theme colors are semantic custom properties defined with `light-dark(oklch(...), oklch(...))`. The stylesheet declares `color-scheme: light dark`. The conventional-color block is only a fallback for engines without `light-dark()`.
- Apply `isi-theme` to the document root (or an isolated extension overlay root). Apply `isi-ui` only to interface containers. Never apply it to the pricing document or an entire company portal page.
- Use the same header pattern, family mark, named app, optional home navigation, and optional theme toggle. Avoid mandatory sidebars. Forms, data viewers, and extension popups can use suitable widths and density.

## Theme amendment — user decision, 19 September 2026

Every new page launch follows the system color preference. A manual control, when present, is a native checkbox with switch semantics, visually styled as a two-state toggle. It switches only light/dark. Do not show a System option or restore a previous manual choice from localStorage, sessionStorage, or extension storage.

`initializeTheme({ root, toggle })` follows live system changes until the user toggles. The override lasts only for this document; reload/navigation starts from the current system preference. A page restored from the back-forward cache also resets to system. No storage permission is needed for extension theming.

## Component interfaces

- `css/tokens.css`: scoped colors, type, spacing, shape, and motion variables.
- `css/components.css`: opt-in baseline, header, two-state theme switch, controls, tables/filters, dialog, disclosure/help, file input, notices, badges, empty state, log, stepper, progress, spinner, tooltip, and notifications.
- `js/theme.js`: `initializeTheme({ root, toggle })` returns `destroy()`.
- `js/notifications.js`: `createNotifications(host)` returns `show(message, options)`, `clear()`, and `destroy()`. Errors remain until dismissed; ordinary notifications pause expiration on hover/focus. Maximum three, with duplicate-key replacement. Essential actionable failures belong inline.
- `js/tooltips.js`: `initializeTooltips(root)` enhances `data-tooltip` controls with hover/focus/click support, Escape dismissal, and viewport collision handling. Returns `destroy()`. Do not put required functionality in tooltips.
- `js/readiness.js`: `createReadinessGate({ host, content, logoUrl, load, onReady })` returns `start()` and `destroy()`. `load(signal)` is asynchronous; `onReady(data)` is the synchronous final render. Keep the initial content `hidden` in HTML. The gate marks it inert until loading and rendering finish, supports retry, guards repeated starts, aborts on destruction, and rejects stale results.
- `js/icons.js`: `icon(name)` returns trusted static SVG markup; names are validated. Icon-only buttons still need an accessible name.
- `css/interaction.css`: apply `data-family-app` to the application body. Chrome, labels, headings, and controls are not selectable; editable inputs remain selectable. Data cells, logs, and `data-family-selectable` content remain selectable by default. Pricing Form uses `data-family-selection="inputs"` so only input fields can be selected, including in its screen preview. PDF text remains selectable.
- `js/navigation.js`: automatically initializes a `data-family-app` body and returns a cleanup function from `initializeNavigation()`. Mark launcher bodies with `data-family-launcher="isi"` or `"isi-share"`; app-list links use `.app-link` or `data-family-launch`. Mark home links with `data-family-home` and give them a static shared-launcher fallback.

## Launcher return amendment — current-session proof

Every app defaults to `isi-share`. The real deployment uses one origin (`https://budhi-halim.github.io`) with separate repository paths, allowing a same-origin BroadcastChannel handshake. Local copies contain all code; the handshake does not fetch canonical code from another repository.

Each launcher creates an unpredictable token for a supported app link and keeps its destination in JavaScript memory. A launched page removes the temporary URL parameter and requests confirmation using a fresh challenge. Only a matching live launcher can confirm that token/destination; an `isi` confirmation switches home links to the internal list. An `isi-share` confirmation leaves the shared list selected. `noreferrer`/`noopener` links still work because recognition does not depend on a referrer or opener.

No cookies, localStorage, sessionStorage, or persistent preference are used. The confirmed destination lasts for the open document. A reload without a fresh launch token, direct/bookmarked visit, closed launcher, unsupported BroadcastChannel, timeout, different origin, or browser restart defaults to `isi-share`. This deliberately conservative fallback avoids inferring internal origin from stale session restoration. Extensions have a different origin and default to the shared list. This is navigation context, not access control.

Keep hard-coded home destinations pointed at the shared list even when JavaScript is unavailable. Do not store an internal/shared preference persistently. A future custom-domain move needs an explicit origin design; do not assume storage or BroadcastChannel crosses origins.

## Logos and static assets

The family and revenue SVG masters use the approved filled blue geometry. AutoFeedback uses a form with a completed field, following the user's form-themed revision. All share a sun motif; extension marks differ by silhouette as well as label. PNGs are supplied at 16, 32, 48, 128, and 180 pixels. `favicon.ico` contains 16/32/48 PNG entries. Background outside the rounded mark is transparent.

Use the family SVG/favicon for webpages. Use revenue or feedback PNGs in their corresponding extension manifest during that extension's implementation checkpoint. The files are distributed now; existing extension manifests are deliberately not changed in sections 2–3.

## Distribution and drift checking

Canonical files live in `isi/family`. Other apps have local copies in `assets/family`; no runtime request to another repository is necessary. The extension landing page and both extension folders each receive a copy. Keep public URLs and app algorithms unchanged.

From `isi`, run:

```powershell
node family-tools/sync.mjs
node family-tools/sync.mjs --check
```

Use `--target=pricing-form` or another listed target to restrict a run. Synchronization refuses to overwrite locally edited distributed files: reconcile edits into the canonical package first. Removing a canonical file requires reviewing/removing its distributed copy and old manifest entry before synchronization. The manifest records a version and SHA-256 for every distributed asset. Increment the version in `sync.mjs` for subsequent released family changes. The sync command does not delete unrelated assets or publish anything.

Regenerate PNG/icon files with `node family-tools/build-assets.mjs` when editing logo masters, then synchronize. `SHARP_PATH` can point to another local Sharp installation. This is a local asset tool, not a webapp build dependency.

## Loading amendment — integrated in checkpoint 7

Product List follows an explicit initialization sequence: fetch required data → normalize/build indexes → render current input → mark ready. The shared readiness component keeps dependent controls hidden/inert until ready. Required failures offer retry; optional exchange-rate/timestamp failures have explicit fallback feedback.

Sales Report and Sales Target use the exact same loading-screen component and styling for their Python entrypoint readiness. Their file validation and workbook algorithms remain intact, with duplicate-work guards and accessible grouping controls in the presentation layer. No fabricated percentages are used. See `CHECKPOINTS-6-7.md` for implementation and verification; shared assets are version 1.3.0.

## Verification and protected boundaries

Review components locally at `/isi/family-review/`. Pricing's document is outside every `isi-ui` ancestor, has its own stylesheet and renderer, and keeps the company wording, casing, dimensions, font stack, and print break rules. Preview scaling acts on an outer layer only; print removes transforms/compositing from every wrapper.

Start the local preview server from `isi` with `node family-tools/serve.mjs`. See `CHECKPOINTS-2-3.md` for completed work, verification commands, evidence, and limitations.

Python files, company JSON schemas, legacy app membership, existing extension automation, and workbook contracts are not changed by this foundation. No minification or publishing is part of sections 2–3.

## Compact interfaces and extension sessions — checkpoint 5

Shared theme controls hide at widths up to 600px or heights up to 420px. Entering that compact layout clears a manual override and follows the system again. Extension popups omit the control entirely. Standalone All apps actions use the family button treatment.

`css/extension-popup.css` fixes content width to 400 CSS pixels without a viewport-width sizing loop. A native browser may add scrollbar space or cap popup height; scrolling keeps actions reachable. This stylesheet is for browser popups only.

`js/extension-session.js` provides the common company origin, login URL, authenticated fetch/error boundary, and a protected home-page session probe with no-cache requests. JSON availability never establishes readiness. The final URL of a successful protected-page response establishes readiness; final login URLs and HTTP 401/403 establish a logged-out state. Page HTML is not used to classify a session. Network and server failures show an unavailable state. It does not change extraction or feedback rules.

The original redirect-based login decision is documented in `isi/family-tools/LOGIN-DETECTION.md`, with original-code comparisons for both extensions.
