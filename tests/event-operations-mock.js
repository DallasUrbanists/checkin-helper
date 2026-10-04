import { API } from './helpers.js'

export const eventData = { id: '1', title: 'Community Walk', start_at: '2026-11-01T15:00:00Z', end_at: '2026-11-01T18:00:00Z', timezone: 'America/Chicago' }
export function attendees() {
  return ['Alice Adams', 'Bob Brown', 'Carol Clark', 'David Davis'].map((name, index) => ({
    id: index + 1, contact_id: index + 11, revision: `checkin-${index}-v1`, submitted_on: '2026-11-01T15:30:00.123456Z',
    contact: { id: index + 11, revision: `contact-${index}-v1`, name, emails: [`person${index}@example.org`, `second${index}@example.org`], phones: ['+1-214-555-0199'], zip_home: '75201', zip_other: ['75202'], roles: ['staff'], firebase_uid: 'private-uid' }
  }))
}
export async function setAuth(page, value) {
  await page.evaluate(value => window.dispatchEvent(new window.CustomEvent('checkin-test-auth', { detail: value })), value)
}
export async function mockEventOperations(page, { rows = attendees(), auth = { uid: 'staff-a', claims: { staff: true } }, failStage = 0, failCommit = false, lostCommit = false, lostUndo = false, blocked = false, expired = false } = {}) {
  await page.addInitScript(value => window.sessionStorage.setItem('checkin-test-auth', JSON.stringify(value)), auth)
  const state = { rows: globalThis.structuredClone(rows), groups: [], calls: [], stageCount: 0, next: 1, failStage, failCommit, lostCommit, lostUndo, blocked, expired }
  const receipts = new Map()
  await page.route(`${API}/api/**`, async route => {
    const request = route.request()
    const method = request.method()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': '*' }
    const json = (status, body) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const url = new URL(request.url())
    const body = request.postData() ? request.postDataJSON() : undefined
    const key = request.headers()['idempotency-key']
    const owner = request.headers().authorization
    state.calls.push({ path: url.pathname, method, body, headers: request.headers() })
    if (method !== 'GET' && key && receipts.has(key)) return json(...receipts.get(key))
    const done = (status, value) => { if (key) receipts.set(key, [status, value]); return json(status, value) }
    if (url.pathname === '/api/events') return json(200, { data: [eventData, { ...eventData, id: '2', title: 'Second event' }] })
    if (url.pathname === '/api/checkins' && method === 'GET') return json(200, { data: globalThis.structuredClone(state.rows) })
    if (url.pathname === '/api/operation-groups' && method === 'GET') {
      const groups = state.groups.filter(g => g.owner === owner && ['committed', 'undone'].includes(g.status)).map(g => ({ ...g.receipt, status: g.status, undo_availability: state.blocked ? 'blocked' : 'eligible' })).reverse()
      const offset = Number(url.searchParams.get('cursor')?.replace('cursor-', '') || 0)
      const limit = Number(url.searchParams.get('limit') || 100)
      return json(200, { items: groups.slice(offset, offset + limit), next_cursor: offset + limit < groups.length ? `cursor-${offset + limit}` : null })
    }
    if (url.pathname === '/api/operation-groups' && method === 'POST') {
      if (!body.manifest?.length || body.manifest.some(item => !/^\d+$/.test(item.record_id))) return json(400, { message: 'Manifest required' })
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.client_action_id)) return json(400, { message: 'UUIDv7 required' })
      const group_id = `group-${state.next++}`
      state.groups.push({ group_id, owner, status: 'open', begin: body, staged: [] })
      return done(201, { group_id, status: 'open' })
    }
    const groupMatch = url.pathname.match(/^\/api\/operation-groups\/([^/]+)(?:\/(commit|undo))?$/)
    if (groupMatch) {
      const group = state.groups.find(g => g.group_id === groupMatch[1])
      if (!group || group.owner !== owner) return json(404, { message: 'Unavailable group' })
      if (method === 'GET') return json(200, { ...group.receipt, group_id: group.group_id, status: group.status })
      if (method === 'DELETE') { group.status = 'cancelled'; return done(200, { group_id: group.group_id, status: group.status }) }
      if (groupMatch[2] === 'commit') {
        if (state.failCommit || group.staged.length !== group.begin.manifest.length) return json(409, { message: 'Atomic commit conflict', code: 'revision_conflict' })
        group.before = globalThis.structuredClone(state.rows)
        const nextRows = globalThis.structuredClone(state.rows)
        for (const mutation of group.staged) {
          if (mutation.resource === 'contacts') nextRows.filter(r => String(r.contact_id) === mutation.id).forEach(r => { Object.assign(r.contact, mutation.body); r.contact.revision += '-next' })
          else if (mutation.action === 'DELETE') { const at = nextRows.findIndex(r => String(r.id) === mutation.id); nextRows.splice(at, 1) }
          else { const row = nextRows.find(r => String(r.id) === mutation.id); Object.assign(row, mutation.body); row.revision += '-next' }
        }
        state.rows = nextRows
        group.status = 'committed'
        group.receipt = { group_id: group.group_id, commit_order: String(state.groups.indexOf(group) + 1), source: 'event-view', client_action_id: group.begin.client_action_id, action_type: group.begin.action_type || group.begin.context?.action_type, event_id: '1', affected_record_count: group.staged.length, display_summary: 'Attendees updated', committed_at: new Date().toISOString(), undo_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), status: 'committed' }
        receipts.set(key, [200, group.receipt])
        if (state.lostCommit) { state.lostCommit = false; return route.abort('failed') }
        return json(200, group.receipt)
      }
      if (groupMatch[2] === 'undo') {
        if (state.expired) return json(410, { message: 'Undo expired' })
        if (state.blocked) return json(409, { message: 'Latest action is blocked' })
        const latest = state.groups.filter(g => g.owner === owner && g.status === 'committed').at(-1)
        if (body?.expected_latest_group_id && (body.source !== 'event-view' || body.expected_latest_group_id !== latest?.group_id || body.expected_latest_commit_order !== latest?.receipt.commit_order)) return json(409, { message: 'Stale latest action', code: 'LATEST_ACTION_CHANGED' })
        if (latest !== group) return json(409, { message: 'Stale latest action' })
        state.rows = globalThis.structuredClone(group.before)
        group.status = 'undone'
        const receipt = { ...group.receipt, status: 'undone' }
        receipts.set(key, [200, receipt])
        if (state.lostUndo) { state.lostUndo = false; return route.abort('failed') }
        return json(200, receipt)
      }
    }
    const mutation = url.pathname.match(/^\/api\/(contacts|checkins)\/(\d+)$/)
    if (mutation && mutation[1] === 'contacts' && method === 'GET') {
      const row = state.rows.find(row => String(row.contact_id) === mutation[2])
      return row?.contact ? json(200, row.contact) : json(404, { message: 'Contact unavailable' })
    }
    if (mutation && ['PUT', 'DELETE'].includes(method)) {
      if (!request.headers()['x-operation-group'] || !/^"[^"]+"$/.test(request.headers()['if-match'] || '') || !key) return json(428, { message: 'Grouped mutation preconditions required' })
      state.stageCount++
      if (state.failStage === state.stageCount) return json(400, { message: 'Invalid staged input' })
      const group = state.groups.find(g => g.group_id === request.headers()['x-operation-group'])
      if (!group || !group.begin.manifest.some(m => m.resource === mutation[1] && String(m.record_id) === mutation[2] && m.action === method)) return json(409, { message: 'Target missing from manifest' })
      group.staged.push({ resource: mutation[1], id: mutation[2], action: method, body })
      return done(202, { group_id: group.group_id, operation_id: `op-${group.staged.length}`, sequence: group.staged.length, staged: true })
    }
    return json(404, { message: 'Unmocked endpoint' })
  })
  return state
}

