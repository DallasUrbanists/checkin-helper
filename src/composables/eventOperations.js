import { computed, ref, shallowRef, watch } from 'vue'
import { useAuth } from './firebase.js'
import { apiRequest } from './useApi.js'
import { operationsEnabled } from './operationCapability.js'
import { clientActionId, latestCommitted, MAX_PAYLOAD_BYTES, MAX_TARGETS, payloadBytes, recordId } from './operationContract.js'

const SOURCE = 'event-view'
const ROOT = '/api/operation-groups'
const capabilityReady = ref(false)
const enabled = computed(() => operationsEnabled === true && capabilityReady.value)
const busy = ref(false)
const dirty = ref(false)
const history = shallowRef([])
const toasts = ref([])
const pending = shallowRef(null)
const lastReceipt = shallowRef(null)
const latest = computed(() => latestCommitted(history.value))
let auth
let epoch = 0
let historyVersion = 0
let active = null
let initialized = false

function failure(message, code, status = 0, uncertain = false) {
  return Object.assign(new Error(message), { code, status, uncertain })
}

function allowed() {
  return operationsEnabled === true && auth?.user.value && auth.ready.value && auth.claimsReady.value && auth.isStaff.value
}

function assertAccess(version) {
  if (version !== epoch || !allowed()) throw failure('Staff access is required.', 'authorization', 403)
}

function key() {
  return globalThis.crypto.randomUUID()
}

function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable)
    Object.freeze(value)
  }
  return value
}

function notify(message, kind = 'error', groupId = null) {
  toasts.value.push({ id: key(), message, kind, groupId })
}

function errorMessage(error) {
  if (error.uncertain) return 'The result is not confirmed. Retry recovery before starting another action.'
  if (error.code === 'dirty') return 'Save or discard table changes before Undo.'
  if (error.code === 'pending') return 'Recover the pending action before starting another action.'
  if (error.status === 428) return 'A record revision is missing. Refresh the attendees and try again.'
  if (error.status === 409 || error.status === 412) return 'Records or history changed. Refresh and review before trying again.'
  if (error.status === 410) return 'This action has expired and can no longer be undone.'
  if (error.status === 401 || error.status === 403) return 'Staff access is required. Sign in again or check permissions.'
  if (error.status === 413) return 'This action exceeds 100 targets or 1 MiB. Reduce the changes; no records were changed.'
  if (error.code === 'capability') return 'Atomic operations are unavailable until authenticated server history loads.'
  if (error.status === 400) return 'The changes are invalid. Review the form and try again.'
  if (error.status === 404) return 'The record or operation is no longer available.'
  return 'The operation could not be completed. Try again after refreshing.'
}

function clear() {
  epoch++
  historyVersion++
  active = null
  busy.value = false
  dirty.value = false
  pending.value = null
  lastReceipt.value = null
  history.value = []
  capabilityReady.value = false
  toasts.value = []
}

function publishPending(operation) {
  pending.value = operation ? Object.freeze({
    kind: operation.kind,
    group_id: operation.groupId,
    client_action_id: operation.clientActionId,
    phase: operation.phase,
    recovering: busy.value
  }) : null
}

async function request(path, options, version) {
  assertAccess(version)
  const response = await apiRequest(path, { ...options, cache: 'no-store' })
  assertAccess(version)
  return response
}

// Only authorized metadata is retained; never copy server snapshots into UI history.
function entry(data) {
  const value = data?.receipt || data?.group || data
  if (!value || typeof value.group_id !== 'string') return null
  const fields = ['group_id', 'commit_order', 'source', 'client_action_id', 'action_type', 'event_id',
    'affected_record_count', 'display_summary', 'committed_at', 'undo_expires_at', 'status', 'undo_availability']
  return Object.freeze(Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, value[field]])))
}

async function refreshHistory() {
  if (!allowed()) return []
  const version = epoch
  const refresh = ++historyVersion
  const entries = []
  const cursors = new Set()
  let cursor = null
  do {
    const query = new globalThis.URLSearchParams({ source: SOURCE, limit: '100' })
    if (cursor) query.set('cursor', cursor)
    let data
    try { data = await request(`${ROOT}?${query}`, {}, version) } catch (error) {
      if (error.code === 'INVALID_CURSOR' && cursor && !cursors.has('restarted')) {
        entries.length = 0
        cursors.clear()
        cursors.add('restarted')
        cursor = null
        continue
      }
      if (refresh === historyVersion && version === epoch) {
        history.value = []
        capabilityReady.value = false
      }
      throw error
    }
    if (refresh !== historyVersion) return history.value
    const groups = data?.items
    if (!Array.isArray(groups) || !(data.next_cursor === null || typeof data.next_cursor === 'string')) {
      capabilityReady.value = false
      history.value = []
      throw failure('Invalid history response.', 'protocol', 502)
    }
    for (const value of groups) {
      const group = entry(value)
      if (!group || group.source !== SOURCE || !['committed', 'undone'].includes(group.status) ||
        typeof group.commit_order !== 'string' || !/^\d+$/.test(group.commit_order)) {
        capabilityReady.value = false
        history.value = []
        throw failure('Invalid history entry.', 'protocol', 502)
      }
      if (!entries.some(item => item.group_id === group.group_id)) entries.push(group)
    }
    cursor = data?.next_cursor || null
    if (cursor && cursors.has(cursor)) {
      history.value = []
      capabilityReady.value = false
      throw failure('Invalid history cursor.', 'protocol', 502)
    }
    if (cursor) cursors.add(cursor)
  } while (cursor)
  if (refresh === historyVersion && version === epoch) {
    history.value = entries
    capabilityReady.value = true
  }
  return entries
}

async function refreshSafely(version) {
  try { await refreshHistory() } catch {
    if (version === epoch) {
      history.value = []
      capabilityReady.value = false
      notify('History could not be refreshed. Atomic operations are unavailable until it reloads.')
    }
  }
}

function transport(method, body) {
  return immutable({ method, ...(body !== undefined ? { body } : {}), headers: { 'Idempotency-Key': key() } })
}

function beginAction(input) {
  if (!input || !Array.isArray(input.mutations)) throw failure('Invalid mutations.', 'invalid', 400)
  if (!input.mutations.length) return null
  if (!['update', 'delete'].includes(input.actionType) || input.eventId == null || String(input.eventId).trim() === '') {
    throw failure('Action type and event are required.', 'invalid', 400)
  }
  const targets = new Set()
  const mutations = input.mutations.map(item => {
    if (!item || !['contacts', 'checkins'].includes(item.resource) || !['PUT', 'DELETE'].includes(item.action) ||
      (item.resource === 'contacts' && item.action === 'DELETE') || item.id == null || !String(item.id).trim()) {
      throw failure('Invalid mutation target.', 'invalid', 400)
    }
    if (typeof item.revision !== 'string' || !item.revision.trim()) throw failure('Revision is required.', 'revision_required', 428)
    let id
    try { id = recordId(item.id) } catch (error) { throw failure(error.message, 'invalid', 400) }
    const target = `${item.resource}:${id}`
    if (targets.has(target)) throw failure('Duplicate mutation target.', 'duplicate_target', 400)
    targets.add(target)
    let body
    if (item.action === 'PUT') {
      if (!item.body || typeof item.body !== 'object' || Array.isArray(item.body) || !Object.keys(item.body).length) {
        throw failure('Update body is required.', 'invalid', 400)
      }
      const fields = item.resource === 'contacts' ? ['name', 'emails', 'phones', 'zip_home', 'zip_other'] : ['submitted_on']
      if (Object.keys(item.body).some(field => !fields.includes(field))) throw failure('Unsupported update field.', 'invalid', 400)
      body = JSON.parse(JSON.stringify(item.body))
    }
    return immutable({ resource: item.resource, id, action: item.action, revision: item.revision, body })
  })
  let eventId
  try { eventId = recordId(input.eventId) } catch (error) { throw failure(error.message, 'invalid', 400) }
  const actionId = clientActionId()
  const begin = { source: SOURCE, client_action_id: actionId, action_type: input.actionType,
    event_id: eventId, manifest: mutations.map(({ resource, id, action }) => ({ resource, record_id: id, action })) }
  if (mutations.length > MAX_TARGETS || payloadBytes(begin, mutations) > MAX_PAYLOAD_BYTES) {
    throw failure('This action exceeds 100 targets or 1 MiB. Reduce the changes; no records were changed.', 'GROUP_LIMIT_EXCEEDED', 413)
  }
  return {
    kind: 'execute', phase: 'begin', groupId: null, clientActionId: actionId,
    begin: transport('POST', begin),
    stages: mutations.map(item => ({ path: `/api/${item.resource}/${encodeURIComponent(item.id)}`,
      options: immutable({ ...transport(item.action, item.body), headers: { 'Idempotency-Key': key(), 'If-Match': `"${item.revision.replace(/^"|"$/g, '')}"` } }) })),
    commit: transport('POST'), cancel: transport('DELETE'), nextStage: 0, originalError: null
  }
}

async function finish(operation, data, version) {
  const receipt = entry(data)
  const expected = operation.kind === 'undo' ? 'undone' : 'committed'
  if (!receipt || receipt.status !== expected || typeof receipt.commit_order !== 'string' || receipt.source !== SOURCE) {
    throw failure('The server result could not be confirmed.', 'protocol', 502, true)
  }
  assertAccess(version)
  active = null
  pending.value = null
  notify(operation.kind === 'undo' ? 'Changes undone.' : (receipt.display_summary || 'Changes saved.'), 'success',
    operation.kind === 'undo' ? null : receipt.group_id)
  await refreshSafely(version)
  assertAccess(version)
  lastReceipt.value = receipt
  return receipt
}

async function cancel(operation, version) {
  operation.phase = 'cancel'
  publishPending(operation)
  await request(`${ROOT}/${encodeURIComponent(operation.groupId)}`, operation.cancel, version)
  active = null
  pending.value = null
}

async function run(operation, version) {
  if (operation.phase === 'cancel') {
    await cancel(operation, version)
    return null
  }
  if (operation.kind === 'undo') {
    operation.phase = 'undo'
    return finish(operation, await request(`${ROOT}/${encodeURIComponent(operation.groupId)}/undo`, operation.undo, version), version)
  }
  if (!operation.groupId) {
    operation.phase = 'begin'
    const data = await request(ROOT, operation.begin, version)
    operation.groupId = data?.group_id || data?.group?.group_id
    if (typeof operation.groupId !== 'string' || !operation.groupId) throw failure('Begin result is unknown.', 'protocol', 502, true)
  }
  operation.phase = 'stage'
  for (; operation.nextStage < operation.stages.length; operation.nextStage++) {
    const stage = operation.stages[operation.nextStage]
    const options = { ...stage.options, headers: { ...stage.options.headers, 'X-Operation-Group': operation.groupId } }
    const result = await request(stage.path, options, version)
    if (result?.staged !== true) throw failure('Stage result is unknown.', 'protocol', 502, true)
  }
  operation.phase = 'commit'
  return finish(operation, await request(`${ROOT}/${encodeURIComponent(operation.groupId)}/commit`, operation.commit, version), version)
}

async function handleFailure(operation, error, version) {
  if (version !== epoch) return
  if (error.uncertain || !error.status || error.status >= 500) {
    error.uncertain = true
    publishPending(operation)
  } else if (operation.kind === 'execute' && ['GROUP_EXPIRED', 'RETRY_HORIZON_EXPIRED', 'GROUP_NOT_FOUND'].includes(error.code)) {
    active = null
    pending.value = null
  } else if (operation.kind === 'execute' && error.code === 'MANIFEST_INCOMPLETE') {
    operation.nextStage = 0
    error.uncertain = true
    publishPending(operation)
  } else if (operation.kind === 'execute' && operation.groupId) {
    operation.originalError = error
    try { await cancel(operation, version) } catch (cancelError) {
      if (version !== epoch) return
      error.uncertain = true
      publishPending(operation)
      error.details = { original: error.details, cancellation: cancelError.code || 'unconfirmed' }
    }
  } else {
    active = null
    pending.value = null
  }
  if (version === epoch) {
    notify(errorMessage(error))
    await refreshSafely(version)
  }
}

async function submit(operation) {
  const version = epoch
  busy.value = true
  active = operation
  try { return await run(operation, version) } catch (error) {
    await handleFailure(operation, error, version)
    throw error
  } finally {
    if (version === epoch) {
      busy.value = false
      if (pending.value) publishPending(operation)
    }
  }
}

function checkSubmission(isUndo = false) {
  assertAccess(epoch)
  if (!enabled.value) throw failure('Atomic operations are unavailable until authenticated server history loads.', 'capability', 503)
  if (busy.value) throw failure('An operation is already running.', 'busy', 409)
  if (active || pending.value) throw failure('An operation needs recovery.', 'pending', 409)
  if (isUndo && dirty.value) throw failure('Unsaved table changes.', 'dirty', 409)
}

async function execute(input) {
  checkSubmission()
  const operation = beginAction(input)
  return operation ? submit(operation) : null
}

async function undo(group = latest.value, { keyboard = false } = {}) {
  try {
    checkSubmission(true)
    const id = typeof group === 'string' ? group : group?.group_id
    const current = history.value.find(item => item.group_id === id)
    if (!current || current.status !== 'committed') throw failure('Undo is unavailable.', 'stale', 409)
    if (keyboard && latest.value?.group_id !== id) throw failure('Latest history changed.', 'stale', 409)
    const body = keyboard ? { expected_latest_group_id: id, expected_latest_commit_order: current.commit_order, source: SOURCE } : {}
    return await submit({ kind: 'undo', phase: 'undo', groupId: id, clientActionId: current.client_action_id, undo: transport('POST', body) })
  } catch (error) {
    if (['dirty', 'pending', 'stale', 'busy', 'authorization'].includes(error.code)) notify(errorMessage(error))
    throw error
  }
}

async function retryPending() {
  assertAccess(epoch)
  if (busy.value || !active || !pending.value) return null
  if (active.kind === 'undo' && dirty.value) throw failure('Unsaved table changes.', 'dirty', 409)
  const operation = active
  const version = epoch
  busy.value = true
  publishPending(operation)
  try {
    await refreshHistory()
    let known = history.value.find(group => group.group_id === operation.groupId ||
      (operation.clientActionId && group.client_action_id === operation.clientActionId))
    if (known && !operation.groupId) operation.groupId = known.group_id
    if (operation.groupId) {
      const status = await request(`${ROOT}/${encodeURIComponent(operation.groupId)}`, {}, version)
      const state = status?.status || status?.group?.status || status?.state
      if ((operation.kind === 'execute' && state === 'committed') || (operation.kind === 'undo' && state === 'undone')) {
        return await finish(operation, status, version)
      }
      if (['cancelled', 'expired'].includes(state) || (operation.kind === 'execute' && state === 'undone')) {
        active = null
        pending.value = null
        notify(state === 'undone' ? 'This action was already undone.' : 'The pending action is no longer open.', 'info')
        return null
      }
      if (!['open', 'committed'].includes(state)) throw failure('Operation state is unknown.', 'protocol', 502, true)
    } else if (known) {
      return await finish(operation, known, version)
    }
    // Replay the exact transient requests and keys; never rebuild a changed payload.
    return await run(operation, version)
  } catch (error) {
    await handleFailure(operation, error, version)
    throw error
  } finally {
    if (version === epoch) {
      busy.value = false
      if (pending.value) publishPending(operation)
    }
  }
}

export function useEventOperations() {
  if (!initialized) {
    initialized = true
    auth = useAuth()
    watch(() => [auth.user.value?.uid, auth.ready.value, auth.claimsReady.value, auth.isStaff.value], () => {
      clear()
      if (allowed()) void refreshSafely(epoch)
    }, { immediate: true, flush: 'sync' })
  }
  return { enabled, busy, dirty, history, latest, toasts, pending, lastReceipt, refreshHistory, execute, undo,
    dismissToast: id => { toasts.value = toasts.value.filter(toast => toast.id !== id) }, clear, retryPending }
}
