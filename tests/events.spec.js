import { test, expect } from '@playwright/test'
import { buildIcal, chicagoWallTime, hoursFromNow, mockCalendar } from './helpers.js'

const rows = page => page.locator('.list-group-item')
const squash = text => text.replace(/\s+/g, ' ')

test.describe('event list', () => {
  test('shows current and future events in start order, omitting past and cancelled events', async ({ page }) => {
    await mockCalendar(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Current' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Future' })).toBeVisible()
    await expect(rows(page).locator('.fw-semibold')).toHaveText([
      'Recent Event',
      'Upcoming Soon',
      'Tomorrow Event',
      'Too Far Event'
    ])
    await expect(page.getByText('Too Old Event')).toHaveCount(0)
    await expect(page.getByText('Cancelled Event')).toHaveCount(0)
  })

  test('shows a loading indicator while the calendar is fetched', async ({ page }) => {
    await page.route('**/meetup-ical', async route => {
      await new Promise(resolve => setTimeout(resolve, 500))
      await route.fulfill({
        contentType: 'text/calendar',
        body: buildIcal([{ id: '1', title: 'Slow Event', start: hoursFromNow(1) }])
      })
    })
    await page.goto('/')

    await expect(page.getByText('Loading events...')).toBeVisible()
    await expect(page.getByText('Slow Event')).toBeVisible()
    await expect(page.getByText('Loading events...')).toBeHidden()
  })

  test('shows an empty message when nothing is in the current window', async ({ page }) => {
    await mockCalendar(page, [{ id: '1', title: 'Far Future', start: hoursFromNow(200) }])
    await page.goto('/')

    await expect(page.getByText('No current events ready for check-in at this time.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Future' })).toBeVisible()
    await expect(rows(page).locator('.fw-semibold')).toHaveText(['Far Future'])
  })

  test('converts TZID start times to Dallas time regardless of browser timezone', async ({ page }) => {
    const start = hoursFromNow(5)
    await mockCalendar(page, [{
      id: '1',
      title: 'Zoned Event',
      dtstart: `DTSTART;TZID=America/Chicago:${chicagoWallTime(start)}`
    }])
    await page.goto('/')

    const expected = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    }).format(start)

    const text = squash(await rows(page).first().innerText())
    expect(text).toContain(squash(expected))
    expect(text).toMatch(/C[SD]T/)
  })

  test('decodes escaped characters and folded lines in titles', async ({ page }) => {
    await mockCalendar(page, [
      { id: '1', title: '', summary: 'Bike\\, Walk & Roll', start: hoursFromNow(1) },
      { id: '2', title: '', summary: 'Folded Ti\r\n tle Event', start: hoursFromNow(2) }
    ])
    await page.goto('/')

    await expect(rows(page).locator('.fw-semibold')).toHaveText(['Bike, Walk & Roll', 'Folded Title Event'])
  })

  test('shows an error with a working retry when the request fails', async ({ page }) => {
    let attempts = 0
    await page.route('**/meetup-ical', route => {
      attempts++
      if (attempts === 1) return route.fulfill({ status: 500, body: 'nope' })
      return route.fulfill({
        contentType: 'text/calendar',
        body: buildIcal([{ id: '1', title: 'Recovered Event', start: hoursFromNow(1) }])
      })
    })
    await page.goto('/')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Calendar request failed (500)')
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(page.getByText('Recovered Event')).toBeVisible()
    await expect(alert).toBeHidden()
  })

  test('shows an error when the network request is blocked', async ({ page }) => {
    await page.route('**/meetup-ical', route => route.abort('failed'))
    await page.goto('/')

    await expect(page.getByRole('alert').getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  test('fetches the calendar once across navigation', async ({ page }) => {
    let requests = 0
    await page.route('**/meetup-ical', route => {
      requests++
      return route.fulfill({
        contentType: 'text/calendar',
        body: buildIcal([{ id: '1', title: 'Only Event', start: hoursFromNow(1) }])
      })
    })
    await page.goto('/')
    await page.getByText('Only Event').click()
    await page.getByRole('button', { name: 'Back' }).click()

    await expect(page.getByText('Only Event')).toBeVisible()
    expect(requests).toBe(1)
  })
})
