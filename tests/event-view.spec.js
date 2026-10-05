import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { attendees, mockEventOperations, setAuth } from './event-operations-mock.js'
import { ATTENDANCE_SORT_KEY } from '../src/composables/attendanceSort.js'

const open = page => page.goto('/#/events/1')
const edit = page => page.getByRole('button', { name: 'Edit attendees', exact: true }).click()
const save = page => page.getByRole('button', { name: 'Save changes', exact: true }).click()
const mutations = state => state.calls.filter(c => ['PUT', 'DELETE'].includes(c.method) && /\/api\/(contacts|checkins)\//.test(c.path))

async function checkContrast(page) {
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(result.violations.map(violation => ({
    rule: violation.id,
    nodes: violation.nodes.map(node => ({ target: node.target, details: node.failureSummary }))
  }))).toEqual([])
}

test('heading sort defaults to newest first and persists direction across refresh and events', async ({ page }) => {
  const rows = attendees()
  rows[0].submitted_on = '2026-11-01T15:10:00Z'
  rows[1].submitted_on = '2026-11-01T15:40:00Z'
  rows[2].submitted_on = '2026-11-01T15:20:00Z'
  rows[3].submitted_on = 'invalid'
  await mockEventOperations(page, { rows })
  await open(page)
  const names = page.locator('tbody .attendance-name')
  await expect(names).toHaveText(['BOB BROWN', 'CAROL CLARK', 'ALICE ADAMS', 'DAVID DAVIS'])
  await expect(page.getByRole('columnheader', { name: 'Time', exact: true })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.locator('thead svg')).toHaveCount(1)
  await page.getByRole('button', { name: 'Name', exact: true }).click()
  await expect(names).toHaveText(['ALICE ADAMS', 'BOB BROWN', 'CAROL CLARK', 'DAVID DAVIS'])
  await page.getByRole('button', { name: 'Name', exact: true }).click()
  await expect(names).toHaveText(['DAVID DAVIS', 'CAROL CLARK', 'BOB BROWN', 'ALICE ADAMS'])
  expect(await page.evaluate(key => JSON.parse(window.localStorage.getItem(key)), ATTENDANCE_SORT_KEY)).toEqual({ column: 'name', direction: 'desc' })
  await page.reload()
  await expect(names).toHaveText(['DAVID DAVIS', 'CAROL CLARK', 'BOB BROWN', 'ALICE ADAMS'])
  await page.goto('/#/events/2')
  await expect(names).toHaveText(['DAVID DAVIS', 'CAROL CLARK', 'BOB BROWN', 'ALICE ADAMS'])
  await expect(page.getByRole('columnheader', { name: 'Name', exact: true })).toHaveAttribute('aria-sort', 'descending')
  await page.getByRole('button', { name: 'Time', exact: true }).click()
  await page.getByRole('button', { name: 'Time', exact: true }).click()
  await expect(names).toHaveText(['ALICE ADAMS', 'CAROL CLARK', 'BOB BROWN', 'DAVID DAVIS'])
})

test('email values follow column direction and first-value sorting keeps missing values last', async ({ page }) => {
  const rows = attendees()
  rows[0].contact.emails = ['z@example.org', 'a@example.org']
  rows[1].contact.emails = ['m@example.org']
  rows[2].contact.emails = []
  rows[3].contact.emails = ['b@example.org']
  rows[0].contact.phones = ['+1-469-555-0199']
  rows[1].contact.phones = ['+1-214-555-0199']
  rows[2].contact.phones = []
  rows[3].contact.phones = ['+1-972-555-0199']
  rows[0].contact.zip_home = '75202'
  rows[1].contact.zip_home = '75201'
  rows[2].contact.zip_home = ''
  rows[2].contact.zip_other = ['75203']
  rows[3].contact.zip_home = ''
  rows[3].contact.zip_other = []
  await mockEventOperations(page, { rows })
  await open(page)
  const names = page.locator('tbody .attendance-name')
  await page.getByRole('button', { name: 'Email', exact: true }).click()
  await expect(names).toHaveText(['ALICE ADAMS', 'DAVID DAVIS', 'BOB BROWN', 'CAROL CLARK'])
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText('a@example.org, z@example.org')
  await page.getByRole('button', { name: 'Email', exact: true }).click()
  await expect(names).toHaveText(['ALICE ADAMS', 'BOB BROWN', 'DAVID DAVIS', 'CAROL CLARK'])
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText('z@example.org, a@example.org')
  await page.getByRole('button', { name: 'Phone', exact: true }).click()
  await expect(names).toHaveText(['BOB BROWN', 'ALICE ADAMS', 'DAVID DAVIS', 'CAROL CLARK'])
  await page.getByRole('button', { name: 'Zip', exact: true }).click()
  await expect(names).toHaveText(['BOB BROWN', 'ALICE ADAMS', 'CAROL CLARK', 'DAVID DAVIS'])
})

for (const staff of [true, false]) {
  test(`${staff ? 'staff' : 'public'} heading cell edges toggle sort once and Time scrolls while right-aligned`, async ({ page }) => {
    const rows = attendees()
    rows[0].contact.emails = Array.from({ length: 8 }, (_, index) => `attendee-${index}@example.org`)
    await mockEventOperations(page, { rows, auth: { uid: 'attendee-a', claims: { staff } } })
    await open(page)
    const label = staff ? 'Name' : 'Attendee Initials'
    const heading = page.getByRole('columnheader', { name: label, exact: true })
    const box = await heading.boundingBox()
    await heading.click({ position: { x: box.width - 2, y: box.height - 2 } })
    await expect(heading).toHaveAttribute('aria-sort', 'ascending')
    await heading.getByRole('button', { name: label, exact: true }).click()
    await expect(heading).toHaveAttribute('aria-sort', 'descending')
    await heading.getByRole('button', { name: label, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(heading).toHaveAttribute('aria-sort', 'ascending')
    for (const expanded of [false, true]) {
      if (expanded) await page.getByRole('button', { name: 'Expand view', exact: true }).click()
      const scroll = page.locator('.attendance-scroll')
      for (const fraction of [0, .5, 1]) {
        await scroll.evaluate((element, fraction) => { element.scrollLeft = (element.scrollWidth - element.clientWidth) * fraction }, fraction)
        await expect.poll(() => scroll.evaluate(element => {
          const right = element.getBoundingClientRect().left + element.scrollWidth - element.scrollLeft
          return [...element.querySelectorAll('.attendance-time')].every(cell => Math.abs(cell.getBoundingClientRect().right - right) < 1)
        })).toBe(true)
      }
      const alignment = await scroll.evaluate(element => {
        const cell = element.querySelector('tbody .attendance-time')
        const text = cell.querySelector('span')
        return {
          padding: window.getComputedStyle(cell).paddingRight,
          align: window.getComputedStyle(cell).textAlign,
          position: window.getComputedStyle(cell).position,
          headingRight: window.getComputedStyle(element.querySelector('thead .attendance-time')).right,
          scrollsHorizontally: element.scrollWidth > element.clientWidth,
          gap: cell.getBoundingClientRect().right - text.getBoundingClientRect().right,
          right: element.getBoundingClientRect().right, viewport: window.innerWidth
        }
      })
      expect(alignment.padding).toBe('8px')
      expect(alignment.align).toBe('right')
      expect(alignment.position).toBe('static')
      expect(alignment.headingRight).toBe('auto')
      if (staff) expect(alignment.scrollsHorizontally).toBe(true)
      expect(Math.abs(alignment.gap - parseFloat(alignment.padding))).toBeLessThan(1)
      expect(alignment.right).toBeCloseTo(alignment.viewport, 0)
    }
  })
}

test('public sorting remains redacted and falls back from a cached private column', async ({ page }) => {
  await page.addInitScript(key => window.localStorage.setItem(key, '{"column":"emails","direction":"desc"}'), ATTENDANCE_SORT_KEY)
  await mockEventOperations(page, { auth: { uid: 'public-a' } })
  await open(page)
  await expect(page.getByRole('columnheader', { name: 'Time', exact: true })).toHaveAttribute('aria-sort', 'descending')
  await page.getByRole('button', { name: 'Attendee Initials', exact: true }).click()
  await expect(page.locator('tbody .attendance-name')).toHaveText(['AA', 'BB', 'CC', 'DD'])
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveCount(0)
  await expect(page.locator('tbody')).not.toContainText('example.org')
})

for (const staff of [true, false]) {
  test(`${staff ? 'staff' : 'public'} expanded view covers navigation, fills viewport and restores focus`, async ({ page }, testInfo) => {
    const contacts = attendees()
    const rows = Array.from({ length: 60 }, (_, index) => ({ ...contacts[index % contacts.length], id: index + 1 }))
    await mockEventOperations(page, { rows, auth: { uid: 'attendee-a', claims: { staff } } })
    await open(page)
    await page.getByRole('button', { name: 'Expand view', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Expanded attendance', exact: true })
    await expect(panel).toBeVisible()
    await expect(page.getByRole('button', { name: 'Shrink view', exact: true })).toBeFocused()
    const layout = await panel.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return {
        left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
        width: window.innerWidth, height: window.innerHeight,
        toolbarBottom: element.querySelector('.attendance-toolbar').getBoundingClientRect().bottom,
        tableScrolls: element.querySelector('.attendance-scroll').scrollHeight > element.querySelector('.attendance-scroll').clientHeight,
        coversNav: Boolean(document.elementFromPoint(20, 20)?.closest('.attendance-expanded')),
        headerInert: document.querySelector('header').inert, overflow: document.body.style.overflow
      }
    })
    expect(layout.left).toBe(0)
    expect(layout.top).toBe(0)
    expect(layout.right).toBe(layout.width)
    expect(layout.bottom).toBe(layout.height)
    expect(layout.toolbarBottom).toBe(layout.height)
    expect(layout.tableScrolls).toBe(true)
    expect(layout.coversNav).toBe(true)
    expect(layout.headerInert).toBe(true)
    expect(layout.overflow).toBe('hidden')
    await checkContrast(page)
    await page.screenshot({ path: testInfo.outputPath('expanded-view.png') })
    await page.keyboard.press('Tab')
    await expect(staff ? panel.getByLabel('Select all attendees') : panel.getByRole('button', { name: 'Attendee Initials', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Expand view', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.querySelector('header').inert)).toBe(false)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await page.getByRole('button', { name: 'Expand view', exact: true }).click()
    await page.getByRole('button', { name: 'Shrink view', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Expand view', exact: true })).toBeFocused()
  })
}

test('expanded view preserves selection, supports removal confirmation and restores background on role loss', async ({ page }) => {
  await mockEventOperations(page)
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { window.attendanceClipboard = text } } })
  })
  await open(page)
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  await page.getByRole('button', { name: 'Expand view', exact: true }).click()
  await page.getByRole('button', { name: 'Name', exact: true }).click()
  await expect(page.getByLabel('Select Alice Adams', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Export 1', exact: true }).click()
  await page.getByRole('button', { name: 'Copy CSV', exact: true }).click()
  const toast = page.locator('.operation-toast').filter({ hasText: 'Copied to clipboard.' })
  await expect(toast).toBeVisible()
  const abovePanel = await toast.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return Boolean(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.operation-toast'))
  })
  expect(abovePanel).toBe(true)
  await toast.getByRole('button', { name: 'Dismiss' }).click()
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Remove selected attendees', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Shrink view', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click()
  await page.getByRole('dialog', { name: 'Remove selected attendees', exact: true }).getByRole('button', { name: 'Remove attendees', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(4)
  await expect(page.getByRole('dialog', { name: 'Expanded attendance', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('header').inert)).toBe(true)
  await setAuth(page, {})
  await expect(page.getByRole('dialog', { name: 'Expanded attendance', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  await expect(page.locator('tbody')).not.toContainText('example.org')
})

test('clickable event text has sufficient contrast against rendered backgrounds and interaction states', async ({ page }) => {
  await mockEventOperations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeEnabled()
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  await checkContrast(page)
  for (const control of [
    page.getByRole('button', { name: 'Edit attendees', exact: true }),
    page.getByRole('link', { name: 'Add attendee', exact: true }),
    page.getByRole('button', { name: 'Export 1', exact: true }),
    page.getByRole('toolbar').getByRole('button', { name: 'Remove selected', exact: true }),
    page.getByRole('link', { name: 'ALICE ADAMS', exact: true }),
    page.getByRole('link', { name: 'person0@example.org', exact: true }),
    page.locator('tbody tr').first().getByRole('link', { name: '214-555-0199', exact: true })
  ]) {
    await control.hover()
    await checkContrast(page)
    await control.focus()
    await checkContrast(page)
  }
  await page.getByRole('button', { name: 'Export 1', exact: true }).click()
  await checkContrast(page)
  await page.getByRole('button', { name: 'Copy CSV', exact: true }).hover()
  await checkContrast(page)
})

for (const path of ['/', '/checkin/1', '/login', '/contacts/11', '/profile', '/profile/edit']) {
  test(`shared clickable text contrast on ${path}`, async ({ page }) => {
    await mockEventOperations(page)
    await page.goto(`/#${path}`)
    await expect(page.locator('main')).toBeVisible()
    await checkContrast(page)
  })
}

 test('staff lists full links, private fields, formatted phones and home ZIP first', async ({ page }) => {
  await mockEventOperations(page)
  await open(page)
  await expect(page.locator('thead th')).toHaveText(['', 'Name', 'Email', 'Phone', 'Zip', 'Time'])
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toHaveAttribute('href', '#/contacts/11')
  await expect(page.locator('tbody tr').first()).toContainText('person0@example.org, second0@example.org')
  await expect(page.locator('tbody tr').first()).toContainText('214-555-0199')
  await expect(page.getByRole('link', { name: 'person0@example.org', exact: true })).toHaveAttribute('href', 'mailto:person0@example.org')
  await expect(page.locator('tbody tr').first().getByRole('link', { name: '214-555-0199', exact: true })).toHaveAttribute('href', 'sms:+12145550199?body=Hi%20Alice!')
  await expect(page.locator('tbody tr').first().locator('strong')).toHaveText('75201')
  await expect(page.locator('tbody tr').first()).not.toHaveAttribute('role', 'link')
  const actions = page.getByRole('group', { name: 'Event actions', exact: true })
  await expect(actions.getByRole('link', { name: 'Add attendee', exact: true })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Edit attendees', exact: true })).toBeEnabled()
  await expect(page.getByRole('toolbar').getByRole('button', { name: 'Edit attendees', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Check in for event', exact: true })).toHaveCount(0)
  if (page.viewportSize().width < 576) {
    const styles = await page.locator('.attendance-table').evaluate(table => ({
      fontSizes: [...table.querySelectorAll('th, td')].map(cell => window.getComputedStyle(cell).fontSize),
      padding: window.getComputedStyle(table.querySelector('.attendance-name')).paddingTop,
      checkboxPadding: window.getComputedStyle(table.querySelector('.attendance-select')).paddingRight,
      nameLeft: window.getComputedStyle(table.querySelector('.attendance-name')).left
    }))
    expect(new Set(styles.fontSizes)).toEqual(new Set(['14px']))
    expect(styles.padding).toBe('4px')
    expect(styles.checkboxPadding).toBe('0px')
    expect(styles.nameLeft).toBe('28px')
  }
})

test('public remains redacted; only server-confirmed self links full name; null contact safe', async ({ page }) => {
  const rows = attendees()
  rows[1].is_self = true
  rows[3].contact = null
  rows[3].contact_id = null
  await mockEventOperations(page, { rows, auth: { uid: 'public-a' } })
  await open(page)
  await expect(page.locator('thead th')).toHaveText(['Attendee Initials', 'Zip', 'Time'])
  await expect(page.locator('tbody tr').first()).toContainText('AA')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'BOB BROWN' })).toBeVisible()
  await expect(page.locator('tbody')).not.toContainText('example.org')
  await expect(page.locator('tbody')).not.toContainText('75202')
  await expect(page.locator('tbody')).not.toContainText('private-uid')
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Check in for event', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add attendee', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Export / })).toHaveCount(0)
})

test('staff downloads all attendees or selected rows with event-local filenames', async ({ page }) => {
  await mockEventOperations(page)
  await open(page)
  const controls = page.getByRole('group', { name: 'Attendance controls', exact: true })
  await expect(controls).toHaveClass(/btn-group-sm/)
  await expect(controls.locator('button.btn:not(.btn-sm)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Export all', exact: true }).click()
  await expect(controls.locator('.dropdown-item')).toHaveText(['Download CSV', 'Download JSON', 'Copy CSV', 'Copy JSON', 'Copy for email merge'])
  await expect(controls.locator('.dropdown-divider')).toHaveCount(1)
  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
  const json = await jsonDownload
  expect(json.suggestedFilename()).toBe('checkins-20261101090000-community-walk.json')
  const records = JSON.parse(await readFile(await json.path(), 'utf8'))
  expect(records).toHaveLength(4)
  expect(records[0].name).toBe('Alice Adams')
  expect(records[0].emails).toEqual(['person0@example.org', 'second0@example.org'])
  expect(records[0].phones).toEqual(['2145550199'])
  expect(JSON.stringify(records)).not.toContain('private-uid')
  expect(JSON.stringify(records)).not.toContain('revision')
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  await page.getByRole('button', { name: 'Export 1', exact: true }).click()
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  const csv = await csvDownload
  expect(csv.suggestedFilename()).toBe('checkins-20261101090000-community-walk.csv')
  const content = await readFile(await csv.path(), 'utf8')
  expect(content.split('\r\n')).toHaveLength(2)
  expect(content).toContain('Alice Adams')
  expect(content).toContain('"2145550199"')
  expect(content).not.toContain('+1-214-555-0199')
  expect(content).not.toContain('Bob Brown')
})

test('staff copies matching formats, selected email merge and saved rather than draft data', async ({ page }) => {
  await mockEventOperations(page)
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.attendanceClipboard = text } }
    })
  })
  await open(page)
  const copy = async format => {
    await page.getByRole('button', { name: /^Export / }).click()
    await page.getByRole('button', { name: format === 'Email merge' ? 'Copy for email merge' : `Copy ${format}`, exact: true }).click()
    const toast = page.locator('.operation-toast').filter({ hasText: 'Copied to clipboard.' })
    await expect(toast).toBeVisible()
    await expect(page.getByRole('toolbar')).not.toContainText('Copied to clipboard.')
    await toast.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expect(toast).toHaveCount(0)
    return page.evaluate(() => window.attendanceClipboard)
  }
  const copiedRecords = JSON.parse(await copy('JSON'))
  expect(copiedRecords).toHaveLength(4)
  expect(copiedRecords[0].phones).toEqual(['2145550199'])
  const copiedCsv = await copy('CSV')
  expect(copiedCsv.split('\r\n')).toHaveLength(5)
  expect(copiedCsv).toContain('"2145550199"')
  expect(copiedCsv).not.toContain('+1-214-555-0199')
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  expect(await copy('Email merge')).toBe('Alice Adams <person0@example.org>, Alice Adams <second0@example.org>')
  await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Unsaved Name')
  expect(JSON.parse(await copy('JSON')).map(record => record.name)).toEqual(['Alice Adams'])
  await page.evaluate(() => {
    window.navigator.clipboard.writeText = async () => { throw new Error('Permission denied') }
  })
  await page.getByRole('button', { name: 'Export 1', exact: true }).click()
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click()
  await expect(page.locator('.operation-toast').filter({ hasText: 'Could not copy to clipboard.' })).toBeVisible()
  await setAuth(page, {})
  await expect(page.getByRole('button', { name: /^Export / })).toHaveCount(0)
  await expect(page.getByText('Could not copy to clipboard.', { exact: false })).toHaveCount(0)
})

for (const claims of [{ role: 'staff' }, { roles: ['member', 'staff'] }]) {
  test(`normalizes staff claim ${JSON.stringify(claims)}`, async ({ page }) => {
    await mockEventOperations(page, { auth: { uid: 'staff-a', claims } })
    await open(page)
    await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeEnabled()
  })
}

test('claim resolution fails closed and stale result cannot elevate another account', async ({ page }) => {
  await mockEventOperations(page, { auth: { uid: 'staff-a', claims: { staff: true }, delay: 500 } })
  await open(page)
  await setAuth(page, { uid: 'public-b' })
  await expect(page.locator('thead th')).toHaveText(['Attendee Initials', 'Zip', 'Time'])
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toHaveCount(0)
  await expect(page.locator('tbody')).not.toContainText('example.org')
})

test('selection supports indeterminate, select-all clearing, editor/discard and no-op saves', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page)
  const toolbar = page.getByRole('toolbar', { name: 'Attendee actions' })
  const controls = toolbar.getByRole('group', { name: 'Attendance controls', exact: true })
  await expect(controls).toHaveClass(/w-100/)
  await expect(toolbar.getByRole('button', { name: 'Export all', exact: true })).toBeVisible()
  await expect(toolbar).not.toContainText(/\d+ selected/)
  const width = await controls.evaluate(group => ({
    actual: group.getBoundingClientRect().width,
    available: group.parentElement.clientWidth - parseFloat(window.getComputedStyle(group.parentElement).paddingLeft) - parseFloat(window.getComputedStyle(group.parentElement).paddingRight)
  }))
  expect(Math.abs(width.actual - width.available)).toBeLessThan(1)
  const viewportWidth = await toolbar.evaluate(bar => ({
    left: bar.getBoundingClientRect().left,
    right: bar.getBoundingClientRect().right,
    viewport: window.innerWidth,
    padding: window.getComputedStyle(bar).paddingLeft
  }))
  expect(viewportWidth.left).toBeCloseTo(0, 0)
  expect(viewportWidth.right).toBeCloseTo(viewportWidth.viewport, 0)
  expect(viewportWidth.padding).toBe('4px')
  await page.getByLabel('Select Alice Adams', { exact: true }).check()
  await expect(toolbar.getByRole('button', { name: 'Export 1', exact: true })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Remove selected', exact: true })).toBeVisible()
  const widths = await controls.evaluate(group => [...group.children].map(control => control.getBoundingClientRect().width))
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2)
  await expect(page.getByLabel('Select all attendees')).toHaveJSProperty('indeterminate', true)
  await page.getByLabel('Select all attendees').check()
  await expect(toolbar.getByRole('button', { name: 'Export 4', exact: true })).toBeVisible()
  await expect(toolbar).not.toContainText(/\d+ selected/)
  await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0)
  await page.getByLabel('Select all attendees').uncheck()
  await expect(toolbar.getByRole('button', { name: 'Export all', exact: true })).toBeVisible()
  await edit(page)
  await expect(toolbar.getByRole('button', { name: 'Remove selected', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Select all attendees')).toHaveCount(0)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Changed Name')
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  await edit(page)
  await page.getByLabel('Emails for Alice Adams', { exact: true }).fill(' PERSON0@EXAMPLE.ORG, second0@example.org ')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeVisible()
  expect(mutations(state)).toHaveLength(0)
  expect(state.groups).toHaveLength(0)
})

for (const staff of [true, false]) {
  test(`${staff ? 'staff' : 'public'} table headings stay pinned while long attendance lists scroll`, async ({ page }) => {
    const contacts = attendees()
    const rows = Array.from({ length: 60 }, (_, index) => ({ ...contacts[index % contacts.length], id: index + 1 }))
    await mockEventOperations(page, { rows, auth: { uid: 'attendee-a', claims: { staff } } })
    await open(page)
    await expect(page.locator('tbody tr')).toHaveCount(60)
    const scroll = page.locator('.attendance-scroll')
    await scroll.evaluate(element => {
      element.scrollTop = 300
      element.scrollLeft = Math.min(200, element.scrollWidth - element.clientWidth)
    })
    await expect.poll(() => scroll.evaluate(element => {
      const top = element.getBoundingClientRect().top
      return [...element.querySelectorAll('thead th')].every(cell => Math.abs(cell.getBoundingClientRect().top - top) < 1)
    })).toBe(true)
    const positions = await scroll.evaluate(element => ({
      scrollTop: element.scrollTop,
      bodyTop: element.querySelector('tbody tr').getBoundingClientRect().top,
      headingTop: element.querySelector('thead').getBoundingClientRect().top,
      pinnedTop: element.querySelector('thead th').getBoundingClientRect().top,
      nameLeft: element.querySelector('thead .attendance-name').getBoundingClientRect().left,
      checkboxRight: element.querySelector('thead .attendance-select')?.getBoundingClientRect().right
    }))
    expect(positions.scrollTop).toBeGreaterThan(0)
    expect(positions.bodyTop).toBeLessThan(positions.pinnedTop)
    if (staff) expect(Math.abs(positions.nameLeft - positions.checkboxRight)).toBeLessThan(1)
  })
}

test('deduplicates contacts, sends only changed fields and per-checkin timestamps', async ({ page }) => {
  const rows = attendees()
  rows[1].contact_id = rows[0].contact_id
  rows[1].contact = { ...rows[0].contact }
  const state = await mockEventOperations(page, { rows })
  await open(page)
  await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).first().fill('Alice Updated')
  await page.getByLabel('Time for Alice Adams', { exact: true }).first().fill('2026-11-01T10:45')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeVisible()
  const calls = mutations(state)
  expect(calls).toHaveLength(2)
  expect(calls[0].body).toEqual({ name: 'Alice Updated' })
  expect(calls[1].body).toEqual({ submitted_on: '2026-11-01T16:45:00Z' })
  expect(state.groups[0].begin.manifest).toHaveLength(2)
  expect(JSON.stringify(calls)).not.toContain('firebase_uid')
  expect(JSON.stringify(calls)).not.toContain('roles')
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toHaveCount(2)
})

for (const count of [1, 2, 3, 4]) {
  test(`removal confirmation grammar and cancellation for ${count} selections`, async ({ page }) => {
    const state = await mockEventOperations(page)
    await open(page)
    for (const name of ['Alice Adams', 'Bob Brown', 'Carol Clark', 'David Davis'].slice(0, count)) await page.getByLabel(`Select ${name}`, { exact: true }).check()
    await page.getByRole('toolbar').getByRole('button', { name: 'Remove selected', exact: true }).click()
    const target = ['Alice Adams', 'Alice Adams and Bob Brown', 'Alice Adams, Bob Brown, and Carol Clark', '4 selected contacts'][count - 1]
    await expect(page.getByRole('dialog')).toContainText(`remove ${target} from list of attendees`)
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('toolbar').getByRole('button', { name: 'Remove selected', exact: true })).toBeFocused()
    expect(mutations(state)).toHaveLength(0)
  })
}

test('failed stage keeps live data and drafts; correction begins a new group', async ({ page }) => {
  const state = await mockEventOperations(page, { failStage: 2 })
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Updated')
  await page.getByLabel('Name for Bob Brown', { exact: true }).fill('Bob Updated')
  await save(page)
  await expect(page.getByRole('alert')).toContainText('Invalid staged input')
  expect(state.rows[0].contact.name).toBe('Alice Adams')
  await expect(page.getByLabel('Name for Alice Adams', { exact: true })).toHaveValue('Alice Updated')
  await page.getByLabel('Name for Bob Brown', { exact: true }).fill('Bob Corrected')
  await save(page)
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeVisible()
  expect(state.groups[0].status).toBe('cancelled')
  expect(state.groups).toHaveLength(2)
})

test('atomic removal refreshes count and server Undo restores it without browser history', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page)
  await page.getByLabel('Select all attendees').check()
  await page.getByRole('toolbar').getByRole('button', { name: 'Remove selected', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove attendees', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(0)
  expect(mutations(state).every(call => call.method === 'DELETE' && call.path.startsWith('/api/checkins/'))).toBe(true)
  await page.keyboard.press('Control+z')
  await expect(page.locator('tbody tr')).toHaveCount(4)
  expect(state.groups[0].status).toBe('undone')
  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }))
  expect(stored).not.toContain('Alice')
  expect(stored).not.toContain('group-')
})

test('navigation warns on dirty drafts; native undo and Shift redo are not application Undo', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Changed Alice')
  await page.keyboard.press('Control+z')
  expect(state.calls.filter(c => c.path.endsWith('/undo'))).toHaveLength(0)
  await page.keyboard.press('Control+Shift+z')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'Add attendee' }).click()
  await expect(page).toHaveURL(/events\/1/)
})

test('logout clears private rows, selection and drafts immediately, relogin discovers server history', async ({ page }) => {
  const state = await mockEventOperations(page)
  await open(page); await edit(page)
  await page.getByLabel('Name for Alice Adams', { exact: true }).fill('Alice Updated')
  await save(page)
  await expect(page.getByRole('link', { name: 'ALICE UPDATED' })).toBeVisible()
  await edit(page)
  await page.getByLabel('Name for Alice Updated', { exact: true }).fill('Dirty Alice')
  await setAuth(page, {})
  await expect(page.getByLabel('Name for Alice Updated', { exact: true })).toHaveCount(0)
  await expect(page.locator('tbody')).not.toContainText('example.org')
  await setAuth(page, { uid: 'staff-a', claims: { staff: true } })
  await expect(page.getByRole('button', { name: 'Edit attendees' })).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('link', { name: 'ALICE ADAMS' })).toBeVisible()
  expect(state.groups[0].status).toBe('undone')
})
