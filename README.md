# Checkin Helper

Fast, mobile-friendly event check-in tool for Dallas Urbanists. Register attendees, save contacts, and manage event check-ins seamlessly.

## Features

- **Event listing** — Fetches events from the Meetup iCal feed, categorized into **Current** (12-hour lookback to 24-hour lookahead) and **Future** events
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
- **Calendar** — Meetup iCal feed (proxied via `https://api.dallasurbganists.org/meetup-ical` to avoid CORS)
- **Testing** — Playwright e2e tests with mocked API and calendar

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
    useEvents.js     — Event fetching and filtering
    useApi.js        — API request wrapper and contact/checkin methods
    useCheckin.js    — Form state and submission logic
    validation.js    — Field validators and input sanitizers
    ical.js          — iCal feed parser
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

The app communicates with the [Dallas Urbanists API](https://github.com/DallasUrbanists/cloud-api-server). Configure the API base URL via the `VITE_API_BASE_URL` environment variable (defaults to `https://api.dallasurbanists.org`).

## Calendar

The Meetup iCal feed is fetched from the URL specified by `VITE_ICAL_URL` (defaults to `/meetup-ical`). In local development, this route is proxied through Vite to work around CORS restrictions. For static hosting like GitHub Pages, configure `VITE_ICAL_URL` (e.g. in GitHub repository variables) to point to a CORS-enabled proxy endpoint or calendar feed.

The parser handles:

- Timezone-aware times (TZID, UTC with Z, floating times)
- Folded lines and escaped characters
- Cancelled events (filtered out)

Times are always displayed in the event's original timezone, regardless of the user's locale.

## License

MIT
