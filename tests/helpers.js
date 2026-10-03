const API = 'https://api.dallasurbanists.org'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
}

const pad = n => String(n).padStart(2, '0')

export const hoursFromNow = hours => new Date(Date.now() + hours * 60 * 60 * 1000)

function icalUtc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Wall-clock time in Dallas, as written in a `DTSTART;TZID=America/Chicago` line
export function chicagoWallTime(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(d)
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return `${v.year}${v.month}${v.day}T${v.hour}${v.minute}${v.second}`
}

export function buildIcal(events) {
  const body = events.flatMap(e => [
    'BEGIN:VEVENT',
    `UID:event_${e.id}@meetup.com`,
    e.dtstart ?? `DTSTART:${icalUtc(e.start)}`,
    `SUMMARY:${e.summary ?? e.title}`,
    ...(e.location ? [`LOCATION:${e.location}`] : []),
    `STATUS:${e.status ?? 'CONFIRMED'}`,
    'END:VEVENT'
  ])
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...body, 'END:VCALENDAR'].join('\r\n') + '\r\n'
}

// Two events fall outside the 12h-back / 24h-ahead window and one is cancelled; listed out of order on purpose.
export function defaultEvents() {
  return [
    { id: '1004', title: 'Tomorrow Event', start: hoursFromNow(23) },
    { id: '1001', title: 'Too Old Event', start: hoursFromNow(-13) },
    { id: '1003', title: 'Upcoming Soon', start: hoursFromNow(2), location: 'City Hall\\, 1500 Marilla St' },
    { id: '1005', title: 'Too Far Event', start: hoursFromNow(25) },
    { id: '1002', title: 'Recent Event', start: hoursFromNow(-11) },
    { id: '1006', title: 'Cancelled Event', start: hoursFromNow(3), status: 'CANCELLED' }
  ]
}

export async function mockEvents(page, events = defaultEvents(), { delay = 0, status = 200 } = {}) {
  await page.route(`${API}/api/events**`, async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: 'nope' }) })

    const data = events
      .filter(event => event.status !== 'CANCELLED')
      .map(event => ({
        id: event.id,
        start_at: event.start.toISOString(),
        end_at: null,
        timezone: event.timezone || 'America/Chicago',
        title: event.title || event.summary || 'Untitled event',
        description: '',
        location: (event.location || '').replace(/\\([,;\\])/g, '$1'),
        url: '',
        status: event.status || 'CONFIRMED'
      }))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data, count: data.length, total: data.length }) })
  })
}

export const mockCalendar = mockEvents

/**
 * Stubs the Dallas Urbanists API and records every call.
 * `fail` maps a call kind (search | create | update | checkin) to 'abort' or { status, message }.
 */
export async function mockApi(page, { contacts = [], delay = 0, fail = {} } = {}) {
  const calls = { search: [], create: [], update: [], checkin: [] }
  let nextId = 100

  await page.route(`${API}/api/**`, async route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

    const url = new URL(request.url())
    const method = request.method()
    const json = (status, body) =>
      route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

    let kind
    if (url.pathname === '/api/contacts' && method === 'GET') kind = 'search'
    else if (url.pathname === '/api/contacts' && method === 'POST') kind = 'create'
    else if (/^\/api\/contacts\/\d+$/.test(url.pathname) && method === 'PUT') kind = 'update'
    else if (url.pathname === '/api/checkins' && method === 'POST') kind = 'checkin'
    else if (url.pathname === '/api/events' && method === 'GET') return route.fallback()
    else return json(404, { error: 'Not Found', message: 'Unmocked endpoint' })

    const body = request.postDataJSON()
    if (kind === 'search') calls.search.push(url.searchParams.get('name'))
    if (kind === 'create') calls.create.push(body)
    if (kind === 'update') calls.update.push({ id: Number(url.pathname.split('/').pop()), body })
    if (kind === 'checkin') calls.checkin.push(body)

    if (delay) await new Promise(resolve => setTimeout(resolve, delay))

    const failure = fail[kind]
    if (failure === 'abort') return route.abort('failed')
    if (failure) return json(failure.status, { error: 'Error', message: failure.message })

    if (kind === 'search') {
      const needle = url.searchParams.get('name').toLowerCase()
      return json(200, contacts.filter(c => c.name.toLowerCase().includes(needle)))
    }
    if (kind === 'create') return json(201, { id: nextId++, created_on: new Date().toISOString(), ...body })
    if (kind === 'update') return json(200, { id: calls.update.at(-1).id, ...body })
    return json(201, { id: 1, ...body })
  })

  return calls
}

export async function fillCheckin(page, { name = '', email = '', phone = '', zip = '' }) {
  if (name) await page.locator('#name').fill(name)
  if (email) await page.locator('#email').fill(email)
  if (phone) await page.locator('#phone').fill(phone)
  if (zip) await page.locator('#zip').fill(zip)
}

export const submitCheckin = page => page.getByRole('button', { name: 'Check in', exact: true }).click()
