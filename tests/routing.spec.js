import { test, expect } from '@playwright/test'
import { mockApi, mockCalendar } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await mockCalendar(page)
  await mockApi(page)
})

test('clicking an event opens its check-in page with the event id in the URL', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Upcoming Soon').click()

  await expect(page).toHaveURL(/#\/checkin\/1003$/)
  await expect(page.getByRole('heading', { name: 'Check in to Upcoming Soon' })).toBeVisible()
})

test('each event passes along its own id', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Tomorrow Event').click()

  await expect(page).toHaveURL(/#\/checkin\/1004$/)
})

test('the check-in page loads directly from a URL', async ({ page }) => {
  await page.goto('/#/checkin/1003')

  await expect(page.getByRole('heading', { name: 'Check in to Upcoming Soon' })).toBeVisible()
  await expect(page.getByText(/\d{1,2}:\d{2}/)).toBeVisible()
})

test('an unknown event id shows a not-found message', async ({ page }) => {
  await page.goto('/#/checkin/does-not-exist')

  await expect(page.getByRole('alert')).toContainText('That event could not be found.')
  await expect(page.locator('#name')).toHaveCount(0)
  await page.getByRole('alert').getByRole('link', { name: 'Pick an event' }).click()
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()
})

test('the logo and back link return to the event list', async ({ page }) => {
  await page.goto('/#/checkin/1003')
  await page.getByRole('link', { name: /All events/ }).click()
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()

  await page.getByText('Upcoming Soon').click()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()
})

test('unknown routes redirect to the event list', async ({ page }) => {
  await page.goto('/#/nonsense/path')

  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()
})

test('matches and confirmation pages redirect home when opened without a check-in', async ({ page }) => {
  await page.goto('/#/checkin/1003/matches')
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()

  await page.goto('/#/confirmation')
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible()
})
