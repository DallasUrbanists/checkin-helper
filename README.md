# Checkin Helper

Fast, mobile-friendly event check-in tool for Dallas Urbanists. Register attendees, save contacts, and manage event check-ins seamlessly.

## Features

- **Event listing** — Fetches upcoming events from Meetup iCal feed, filtered by a 12-hour lookback and 24-hour lookahead window
- **Quick check-in** — Touch-optimized form with name (required), email, phone, and zip (all optional except name)
- **Smart contact matching** — Searches the Dallas Urbanists database by name; handles new contacts, existing contacts, and multiple matches
- **Contact enrichment** — Appends new emails, phones, and zips to existing records without overwriting stored data
- **Email domain shortcuts** — One-click buttons for common email providers (@gmail.com, @yahoo.com, @outlook.com, @icloud.com, @hotmail.com, @proton.me, @sbcglobal.net)
- **Accessible & validated** — Blur-only validation, ARIA labels, phone formatting, real-time sanitization
- **Mobile-first design** — Responsive Bootstrap 5 UI optimized for phone and tablet event check-in

## Tech Stack

- **Frontend** — Vue 3 with Composition API (`<script setup>`), Vue Router 4 (hash routing)
- **Styling** — Bootstrap 5.3 SCSS, custom utility classes
- **Bundler** — Vite 8 with HMR
- **Backend API** — Dallas Urbanists REST API at `https://api.dallasurbanists.org`
- **Calendar** — Meetup iCal feed (proxied via Vite to avoid CORS)
- **Testing** — Playwright e2e tests with mocked API and calendar

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
git clone https://github.com/dallasurbanists/checkin-helper.git
cd checkin-helper
npm install
```

### Development

Start the dev server at `http://localhost:8080`:

```bash
npm start
```

Vite will hot-reload on file changes.

### Linting

Check code style:

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run fix
```

### Build

Create a production bundle:

```bash
npm run build
```

Output is in `dist/`.

### Testing

Run end-to-end tests (mocks calendar and API):

```bash
npx playwright test
```

Run only desktop tests:

```bash
npx playwright test --project=desktop
```

Run only mobile tests:

```bash
npx playwright test --project=mobile
```

View the HTML test report after a run:

```bash
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

## Deployment

To deploy, build the app and serve the `dist/` directory with a web server. Ensure your server:

1. Proxies `/meetup-ical` to `https://www.meetup.com/dallasurbanists/events/ical/`
2. Allows CORS requests to the Dallas Urbanists API (or proxies those too)
3. Serves `index.html` for all routes (since this is a single-page app with hash routing)

Example nginx config snippet:

```nginx
location /meetup-ical {
  proxy_pass https://www.meetup.com/dallasurbanists/events/ical/;
}
location / {
  try_files $uri $uri/ /index.html;
}
```

## License

MIT

```sh
git clone https://github.com/twbs/examples.git
cd examples/vue/
npm install
npm start
```
