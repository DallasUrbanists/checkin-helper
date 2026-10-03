# Checkin Helper

Fast, mobile-friendly event check-in tool for Dallas Urbanists. Register attendees, save contacts, and manage event check-ins seamlessly.

## Features

- **Event listing** — Fetches events from the Events API, caches them locally for 10 minutes, and categorizes them into **Current** (12-hour lookback to 24-hour lookahead) and **Future** events
- **Firebase authentication** — Email/password and Google popup sign-in using `VITE_FIREBASE_*` configuration
- **Authenticated profiles** — User/contact profile pages and editable contact details
- **Quick check-in** — Touch-optimized form with name (required), email, phone, and zip (all optional except name)
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

Run end-to-end Playwright tests (mocks calendar and API). Use this for full regression testing.

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

## Events

Events are fetched from `GET /api/events` on the Dallas Urbanists API. Configure its base URL with `VITE_API_BASE_URL` (defaults to `https://api.dallasurbanists.org`).

The app caches the API response in browser local storage for 10 minutes. A fresh cache prevents a network request; an expired cache is displayed immediately while the app refreshes it in the background. Updated results automatically replace the displayed list.

Times are displayed in the event's configured timezone, regardless of the user's locale.

## License

MIT
