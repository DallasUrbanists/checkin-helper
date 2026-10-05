# Checkin Helper

Fast, mobile-friendly event check-in tool for Dallas Urbanists. Register attendees, save contacts, and manage event check-ins seamlessly.

## Features

- **Event listing** — Fetches events from the Events API, caches them locally for 10 minutes, and categorizes them into **Current** (12-hour lookback to 24-hour lookahead) and **Future** events
- **Firebase authentication** — Email/password and Google popup sign-in using `VITE_FIREBASE_*` configuration
- **Authenticated profiles** — User/contact profile pages and editable contact details
- **Quick check-in** — Touch-optimized form with name (required), email, phone, and zip (all optional except name). Attendees already checked in go to confirmation with “Welcome back! You already checked in.”
- **Smart contact matching** — Searches the Dallas Urbanists database by name; handles new contacts, existing contacts, and multiple matches
- **Contact enrichment** — Appends new emails, phones, and zips to existing records without overwriting stored data
- **Email domain shortcuts** — One-click buttons for common email providers (`@gmail.com`, `@yahoo.com`, `@outlook.com`, `@icloud.com`, `@hotmail.com`, `@proton.me`)
- **Accessible & validated** — Blur-only validation, ARIA labels, phone formatting, real-time sanitization
- **Mobile-first design** — Responsive Bootstrap 5 UI optimized for phone and tablet event check-in

## Tech Stack

- **Frontend** — Vue 3 with Composition API (`<script setup>`), Vue Router 4 (hash routing)
- **Styling** — Bootstrap 5.3 SCSS, custom utility classes
- **Bundler** — Vite 8 with HMR
- **Backend API** — Dallas Urbanists REST API at `https://api.dallasurbanists.org`
- **Events** — Dallas Urbanists Events API with browser local-storage caching
- **Testing** — Playwright e2e tests with mocked API responses

## Local Development

Want to clone this project and work on it on your local machine? Here's how.

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
git clone https://github.com/dallasurbanists/checkin-helper.git
cd checkin-helper
npm install
```

### Testing

Use this command to create a localhost server so you can open the app in browser. Vite will hot-reload on file changes.

```bash
npm start
```

Check code style and autofix linting issues.

```bash
npm run lint
npm run fix
```

If you want, you can create a production bundle that's output to the `dist/` directory with this command. Note that running this manually on your end isn't necessary for deploying to this particular repo because we have a GitHub Actions workflow that automatically triggers build and deploy upon pushing to the `main` branch.

```bash
npm run build
```

Run build and lint checks in one command. Use this for testing the stability of your build before pushing code.

```bash
npm test
```

Run end-to-end Playwright tests (mocks calendar and API). The Playwright web server explicitly sets `VITE_RECAPTCHA_SITE_KEY` to an empty value so tests do not initialize reCAPTCHA; production configuration is unaffected.

```bash
npm run test:e2e
```

Run only desktop tests or only mobile tests. View HTML test report after a run.

```bash
npx playwright test --project=desktop
npx playwright test --project=mobile
npx playwright show-report
```

## Project Structure

```
src/
  js/
    main.js          — App entry point, Vue/Router setup
    App.vue          — Root layout with header, router view, footer
    router.js        — Hash-based routes (/, /checkin/:eventId, /confirmation, etc.)
  views/
    HomeView.vue     — Event list
    CheckinView.vue  — Check-in form (name, email, phone, zip, validation)
    MatchesView.vue  — Contact disambiguation ("Are one of these you?")
    ConfirmationView.vue — Success page with event and contact details
  components/
    AppHeader.vue    — Logo and navigation
    AppFooter.vue    — Footer
    LoadingInterstitial.vue — Full-screen loading overlay
  composables/
    useEvents.js     — Event API fetching, caching, and filtering
    useApi.js        — API request wrapper and contact/checkin methods
    useCheckin.js    — Form state and submission logic
    validation.js    — Field validators and input sanitizers
    contactUtils.js  — Contact display and payload builders
  scss/
    styles.scss      — Bootstrap overrides, custom utilities
tests/
  helpers.js               — Test utilities (mocking, form filling)
  events.spec.js           — Event list behavior
  routing.spec.js          — Navigation and route guards
  form-validation.spec.js  — Form field validation and UX
  checkin-flow.spec.js     — Check-in, matches, and confirmation flows
```

## API Integration

The app communicates with the [Dallas Urbanists API](https://github.com/DallasUrbanists/cloud-api-server). Configure the API base URL via `VITE_API_BASE_URL` (defaults to `https://api.dallasurbanists.org`). Firebase is configured with `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`. Authenticated API requests send the Firebase ID token as `Authorization: Bearer <token>`.

Profile assumptions: `/api/users/me` returns the signed-in user's contact, while `/api/contacts/{id}` and `/api/checkins?event_id=...` provide contact and event detail data. These endpoints can be adjusted in `src/composables/useApi.js` if the deployed API uses different names. API-key provisioning and rotation are managed in the API server's [authentication documentation](https://github.com/DallasUrbanists/cloud-api-server#rotating-api-keys); never commit API keys to this repository.

API requests include `X-API-Key` from `VITE_API_KEY` and, when configured, `X-Firebase-AppCheck` from Firebase App Check. This app uses the Firebase Fraud Defense (reCAPTCHA Enterprise) provider. Set the reCAPTCHA Enterprise site key as `VITE_RECAPTCHA_SITE_KEY` for production App Check, register the production hostname in Firebase Console, and use `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` for local development. Never expose the reCAPTCHA secret key in the browser.

## Events

Events are fetched from `GET /api/events` on the Dallas Urbanists API. Configure its base URL with `VITE_API_BASE_URL` (defaults to `https://api.dallasurbanists.org`).

The app caches the API response in browser local storage for 10 minutes. A fresh cache prevents a network request; an expired cache is displayed immediately while the app refreshes it in the background. Updated results automatically replace the displayed list.

Times are displayed in the event's configured timezone, regardless of the user's locale.

## EventView Phase Two

Attendance now uses reactive Firebase staff claims (`staff: true`, `role: "staff"`, or `roles` containing `staff`). Claim resolution fails closed; account, role, and event changes clear privileged rows and drafts, and stale requests are ignored. Staff see full uppercase profile links, emails, formatted phones, and home-first ZIP lists. Public attendees see initials and Home ZIP only; a server-confirmed `is_self: true` row alone gets a full-name profile link. Attendance is never cached in browser storage. `/api/users/me` remains an existing profile assumption, not an ownership or staff-authorization source.

The editor uses shared contact drafts and independent check-in times. It validates comma-separated values without truncating them, omits protected and unchanged fields, supports explicit nullable clears, and creates no operation for normalized no-op saves. Temporal converts event-zone wall-clock times, checks inclusive bounds and rejects DST gaps/ambiguities. Timestamp inputs use text rather than native datetime controls to preserve microsecond/nanosecond strings; untouched timestamps are never rewritten, including historical out-of-range values. Discard sends no requests; dirty navigation warns. Selection and accessible removal confirmation operate on check-in IDs; removal never deletes contacts.

**Production gate:** the delivered operation-group contract is supported by `src/composables/operationCapability.js`, but Edit, Save, Remove and application Undo stay disabled until authenticated, account-bound history discovery returns the expected `items`/`next_cursor` envelope. Missing/incompatible history or lost permissions fail closed; Retry connection and window focus retry discovery. Record revisions are required before any begin request. Staff attendance reads resolve embedded contacts lacking revisions through canonical `GET /api/contacts/{id}` reads (deduplicated by contact ID), replacing values and revision together before creating edit baselines. Public attendance never performs these private contact reads. This read-only availability check is not proof of database atomicity; the deployment must include migration 003 and the tested backend implementation. There is no browser enablement flag or ordinary PUT/DELETE fallback. Existing check-in creation and profile editing are unchanged and are not added to Undo.

`src/composables/eventOperations.js` implements the delivered `/api/operation-groups` contract: UUIDv7 action identifiers, immutable deduplicated `record_id` manifests, quoted revision preconditions, grouped staging, request-specific idempotency keys, atomic commit, cancellation, and status/history recovery after uncertain responses. Actions exceeding 100 distinct typed targets or 1 MiB of normalized canonical UTF-8 payload are rejected before begin; they are never automatically split. Changed timestamps support microsecond precision; untouched higher-precision legacy strings remain unchanged. History is server-owned for 30 days from the original commit. Only transient metadata and in-flight forward requests exist in memory; there is no localStorage undo stack, restoration logic, or browser history size limit. Logout clears that transient state; same-account login rediscovers retained server history.

Global notifications offer Undo on successful actions. Ctrl-Z/Cmd-Z select the numerically greatest decimal-string commit order among still-committed source-wide EventView actions, including blocked entries; requests include top-level `source`, `expected_latest_group_id`, and `expected_latest_commit_order`. BIGINT order values are never converted to JavaScript numbers. Expired pagination cursors restart discovery once. Inputs and contenteditable descendants keep native Undo, Shift-redo is untouched, and dirty drafts prevent application Undo. Server conflicts/expiry never cause fallback to an older action.

### Isolated verification

```bash
npm run test:unit
npm test
npx playwright test event-view.spec.js event-history.spec.js event-boundaries.spec.js event-contract.spec.js
npm run test:e2e
npm run test:integration
```

Playwright points the API at the isolated loopback address `http://127.0.0.1:4199`; unmocked calls cannot reach production. Its development server alone uses `CHECKIN_E2E=1` and `--mode e2e` to alias controlled auth. The real capability gate and adapter are exercised, without a test-only mutation enablement fixture. Build commands never activate these aliases, even with those settings. Tests cover desktop Chrome and Pixel 7, stateful atomic-operation simulation, privacy/auth/route races, selection/drafts, failures and uncertain outcomes, retained/paginated history, sequential Undo, account isolation, blocked latest actions, expiry, and stale cross-tab selection. Mock transactions do not prove PostgreSQL atomicity, exact restoration, lineage, permission enforcement, or deployed CORS behavior.

`npm run test:integration` requires the sibling `cloud-api-server` checkout with its declared dev dependencies installed. It starts the real Express app/controllers/operation service against a fresh in-memory PGlite database and migration 003, using synthetic Firebase verification confined to the test server. The browser runs the production adapter and capability gate with controlled auth. Outbound server sockets and external browser requests are blocked. Coverage includes combined Save, exact Undo/delete restoration, revision-conflict atomicity, self privacy, account isolation and cross-browser latest-action conflicts. Test-only reset/state routes bind to loopback and are never included in production builds. Embedded PostgreSQL tests do not certify multi-connection PostgreSQL behavior.

### Delivered backend and release verification

The adapter matches the [implemented backend contract](../cloud-api-server/docs/operation-groups.md): `manifest: [{resource,record_id,action}]`, UUIDv7 `client_action_id`, top-level `action_type`/`event_id`, `group_id`, history `items` plus `next_cursor`, quoted `If-Match`, and source-wide latest-action preconditions. Public production OpenAPI and OPTIONS reads verified operation routes, timestamp precision, grouping headers and exposed ETag; no production mutation tests are permitted. Authenticated history validates runtime availability separately for each staff account.

The backend test suite uses isolated embedded PostgreSQL to exercise real migration, atomic transactions, trusted restoration/lineage, permission enforcement and retention. These tests and local frontend-to-server integration do not certify actual-schema migration rehearsal, multi-connection PostgreSQL locking/load behavior, production Firebase/App Check provisioning or deployed authenticated mutation behavior. Release verification must use an approved non-production environment, never production attendee records. Logout retains server history but immediately clears all frontend sensitive state; no browser-owned history is reintroduced.

## License

MIT
