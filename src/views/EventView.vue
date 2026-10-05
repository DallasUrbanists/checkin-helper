<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { useEvents, formatEventDate } from '../composables/useEvents.js'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/firebase.js'
import { displayPhone, phoneDigits } from '../composables/contactUtils.js'
import { buildMutations, contactFor, createDrafts, draftDirty, rowTimestamp, timeBounds } from '../composables/eventDrafts.js'
import { useEventOperations } from '../composables/eventOperations.js'
import { resolveAttendanceContacts } from '../composables/attendanceContacts.js'
import { attendanceFilename, serializeAttendance } from '../composables/attendanceExport.js'
import { DEFAULT_ATTENDANCE_SORT, orderedEmails, readAttendanceSort, saveAttendanceSort, sortAttendance } from '../composables/attendanceSort.js'
import 'bootstrap/js/dist/dropdown'
import ExpandablePreview from '../components/ExpandablePreview.vue'
import AttendanceTable from '../components/AttendanceTable.vue'

const route = useRoute()
const { findEvent, load } = useEvents()
const auth = useAuth()
const operations = useEventOperations()
const checkins = ref([])
const error = ref('')
const loading = ref(true)
const selection = ref(new Set())
const editing = ref(false)
const drafts = ref(null)
const dialog = ref(null)
const attendanceTable = ref(null)
const sort = ref(readAttendanceSort())
let generation = 0
let removeTrigger = null
const event = computed(() => findEvent(String(route.params.eventId)))
const staff = auth.isStaff
const dirty = computed(() => editing.value && drafts.value && draftDirty(drafts.value))
const bounds = computed(() => timeBounds(event.value))
const activeSort = computed(() => staff.value || ['name', 'zip', 'time'].includes(sort.value.column) ? sort.value : DEFAULT_ATTENDANCE_SORT)
const sortedRows = computed(() => sortAttendance(checkins.value, activeSort.value, shownName))
const columns = computed(() => [
  { key: 'name', label: staff.value ? 'Name' : 'Attendee Initials', class: 'attendance-name' },
  ...(staff.value ? [{ key: 'emails', label: 'Email' }, { key: 'phones', label: 'Phone' }] : []),
  { key: 'zip', label: 'Zip' }, { key: 'time', label: 'Time', class: 'attendance-time', cellClass: 'pe-2' }
])
const selectedRows = computed(() => sortedRows.value.filter(row => selection.value.has(String(row.id))))
const exportRows = computed(() => selectedRows.value.length ? selectedRows.value : sortedRows.value)
const exportLabel = computed(() => selectedRows.value.length
  ? `Export ${selectedRows.value.length}`
  : 'Export all')
const mutationsAllowed = computed(() => operations.enabled.value && staff.value && !operations.busy.value && !operations.pending.value)
const descriptionHtml = computed(() => {
  const description = event.value?.description
  return description ? DOMPurify.sanitize(marked.parse(String(description))) : ''
})

function values(value) { return Array.isArray(value) ? value.filter(v => v != null).map(String) : [] }
function emailsFor(row) {
  return orderedEmails(contactFor(row)?.emails, activeSort.value.column === 'emails' ? activeSort.value.direction : 'asc')
}
function sortColumn(column) {
  sort.value = {
    column,
    direction: activeSort.value.column === column ? (activeSort.value.direction === 'asc' ? 'desc' : 'asc') : (column === 'time' ? 'desc' : 'asc')
  }
  saveAttendanceSort(sort.value)
}
function contactName(row) { return contactFor(row)?.name || row.contact_name || 'Anonymous attendee' }
function smsLink(phone, row) {
  const recipient = String(phone).replace(/[^\d+]/g, '')
  const firstName = contactName(row).trim().split(/\s+/)[0]
  return `sms:${recipient}?body=${encodeURIComponent(`Hi ${firstName}!`)}`
}
function contactId(row) { return row.contact_id ?? contactFor(row)?.id }
function fullName(row) { return staff.value || row.is_self === true }
function linked(row) { return fullName(row) && contactId(row) != null && Boolean(contactFor(row)) }
function shownName(row) {
  const name = contactName(row)
  if (fullName(row)) return name.toUpperCase()
  if (!/\s/.test(name)) return name.toUpperCase()
  return name === 'Anonymous attendee' ? '—' : name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase()
}
function zipList(row) {
  const contact = contactFor(row)
  return [contact?.zip_home, ...values(contact?.zip_other)].filter(Boolean)
}
function contactDraft(row) { return drafts.value?.contacts[String(contactId(row))] }
function eventDate(value) {
  try { return formatEventDate(value) } catch { return 'Event date or timezone unavailable' }
}
function formatTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'Unknown time'
  try {
    const timeZone = event.value?.timeZone || 'UTC'
    const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const multiDay = event.value?.end && day.format(event.value.end) !== day.format(event.value.start)
    const differentDay = day.format(date) !== day.format(event.value.start)
    return new Intl.DateTimeFormat('en-US', {
      ...(multiDay || differentDay ? { month: 'short', day: 'numeric' } : {}),
      hour: 'numeric', minute: '2-digit', timeZone
    }).format(date)
  } catch { return 'Unknown time' }
}
function downloadAttendance(format) {
  if (!staff.value || loading.value || !exportRows.value.length) return
  let url
  try {
    const content = serializeAttendance(exportRows.value, format)
    const filename = attendanceFilename(event.value, format)
    url = URL.createObjectURL(new window.Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    operations.notify(`Download started: ${format.toUpperCase()} attendance data.`, 'success', null, { autoDismiss: true })
  } catch {
    operations.notify('Download failed. Please try again.', 'error', null, { autoDismiss: true })
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
async function copyAttendance(format) {
  if (!staff.value || loading.value || !exportRows.value.length) return
  const current = generation
  try {
    await window.navigator.clipboard.writeText(serializeAttendance(exportRows.value, format))
    if (current === generation) {
      const label = format === 'email' ? 'email merge data' : `${format.toUpperCase()} attendance data`
      operations.notify(`Copied to clipboard. ${label}.`, 'success', null, { autoDismiss: true })
    }
  } catch {
    if (current === generation) {
      const label = format === 'email' ? 'email merge data' : `${format.toUpperCase()} attendance data`
      operations.notify(`Could not copy to clipboard. ${label}. Check your browser clipboard permissions.`, 'error', null, { autoDismiss: true })
    }
  }
}
function clearEditor() { editing.value = false; drafts.value = null; operations.dirty.value = false }
function resetSensitive() {
  attendanceTable.value?.shrinkView(false)
  generation++
  checkins.value = []
  selection.value = new Set()
  clearEditor()
  error.value = ''
  dialog.value?.close()
}
async function refresh() {
  const current = ++generation
  const eventId = String(route.params.eventId)
  loading.value = true
  error.value = ''
  try {
    await load()
    if (current !== generation || !auth.ready.value) return
    const result = await useApi().getEventCheckins(eventId)
    if (current !== generation) return
    let rows = Array.isArray(result) ? result : result?.data
    if (!Array.isArray(rows)) throw new Error('Check-in response was invalid.')
    if (staff.value) rows = await resolveAttendanceContacts(rows, useApi().getContact)
    if (current !== generation) return
    checkins.value = rows.map(row => {
      const contact = contactFor(row)
      const fields = staff.value ? ['id', 'revision', 'name', 'emails', 'phones', 'zip_home', 'zip_other'] : ['id', 'name', 'zip_home']
      return {
        id: row.id, contact_id: row.contact_id, revision: row.revision,
        submitted_on: rowTimestamp(row), contact_name: row.contact_name,
        is_self: row.is_self === true,
        contact: contact ? Object.fromEntries(fields.filter(field => contact[field] !== undefined).map(field => [field, contact[field]])) : null
      }
    })
    selection.value = new Set([...selection.value].filter(id => rows.some(row => String(row.id) === id)))
  } catch (e) {
    if (current === generation) error.value = e.message
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(() => [route.params.eventId, auth.ready.value, auth.user.value?.uid, auth.claimsReady.value, staff.value],
  ([eventId, authReady]) => {
    resetSensitive()
    loading.value = true
    if (eventId && authReady) void refresh()
  }, { immediate: true, flush: 'sync' })
watch(dirty, value => { operations.dirty.value = Boolean(value) }, { flush: 'sync' })
function beginEdit() {
  if (!mutationsAllowed.value) return
  drafts.value = createDrafts(checkins.value, event.value)
  editing.value = true
  error.value = ''
}
function discard() { clearEditor(); error.value = '' }
async function save() {
  if (!mutationsAllowed.value) return
  const current = generation
  error.value = ''
  try {
    const mutations = buildMutations(drafts.value, checkins.value, event.value)
    if (!mutations.length) { clearEditor(); return }
    await operations.execute({ actionType: 'update', eventId: String(event.value.id), mutations })
    if (current !== generation) return
    clearEditor()
    await refresh()
  } catch (e) { if (current === generation) error.value = e.message }
}
const removeMessage = computed(() => {
  const rows = selectedRows.value
  const names = rows.map(contactName)
  const joined = names.length === 1 ? names[0] : names.length === 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
  const target = rows.length <= 3 ? joined : `${rows.length} selected contacts`
  return `Are you sure you want to remove ${target} from list of attendees? Only do this for accurate record-keeping if they weren't present at all for ${event.value?.title}`
})
async function confirmRemove(e) {
  if (!mutationsAllowed.value || !selectedRows.value.length) return
  removeTrigger = e.currentTarget
  await nextTick()
  dialog.value.showModal()
  dialog.value.querySelector('button').focus()
}
function closeDialog() { dialog.value?.close(); removeTrigger?.focus(); removeTrigger = null }
async function remove() {
  if (!mutationsAllowed.value || !selectedRows.value.length) return
  const current = generation
  const mutations = selectedRows.value.map(row => ({ resource: 'checkins', id: row.id, action: 'DELETE', revision: row.revision }))
  closeDialog()
  error.value = ''
  try {
    await operations.execute({ actionType: 'delete', eventId: String(event.value.id), mutations })
    if (current !== generation) return
    selection.value = new Set()
    await refresh()
  } catch (e) { if (current === generation) error.value = e.message }
}
function canNavigate() {
  if (operations.busy.value || operations.pending.value) return false
  return !dirty.value || window.confirm('Discard unsaved attendee changes?')
}
onBeforeRouteLeave(canNavigate)
onBeforeRouteUpdate(canNavigate)
function beforeUnload(e) { if (dirty.value || operations.busy.value || operations.pending.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  generation++
  operations.dirty.value = false
  window.removeEventListener('beforeunload', beforeUnload)
})
// Inverses and recovered requests always require authoritative attendance reads.
watch(operations.lastReceipt, receipt => {
  if (!receipt) return
  if (String(receipt.event_id) === String(route.params.eventId)) {
    clearEditor()
    selection.value = new Set()
  }
  if (auth.ready.value && auth.claimsReady.value) void refresh()
})
</script>

<template>
  <main>
    <div v-if="!event && !loading" class="alert alert-warning">That event could not be found. <RouterLink to="/">Pick an event</RouterLink></div>
    <template v-else-if="event">
      <h1 class="h3">{{ event.title }}</h1>
      <p class="text-muted">{{ eventDate(event) }}</p>
      <p v-if="event.location">{{ event.location }}</p>
      <ExpandablePreview v-if="descriptionHtml" class="event-description mb-4"><div v-html="descriptionHtml"></div></ExpandablePreview>
      <div class="btn-group w-100 mb-4" role="group" aria-label="Event actions">
        <RouterLink class="btn btn-primary" :to="{ name: 'checkin', params: { eventId: event.id } }">{{ staff ? 'Add attendee' : 'Check in for event' }}</RouterLink>
        <button v-if="staff && !editing && checkins.length && !loading" class="btn btn-outline-primary" type="button" :disabled="!mutationsAllowed" @click="beginEdit">Edit attendees</button>
      </div>
      <section aria-labelledby="attendees-heading" :aria-busy="loading || operations.busy.value">
        <h2 id="attendees-heading" class="h5">Check-ins <span class="badge text-bg-secondary">{{ checkins.length }}</span></h2>
        <div v-if="loading" class="text-muted" role="status">Loading check-ins...</div>
        <div v-if="error" class="alert alert-warning" role="alert">{{ error }}</div>
        <div v-if="!loading && !checkins.length" class="text-muted">No check-ins yet.</div>
        <AttendanceTable ref="attendanceTable" v-model:selection="selection" :rows="sortedRows" :columns="columns"
          :sort="activeSort" :row-label="contactName" :wide="staff" :selectable="staff && !editing"
          :selection-disabled="operations.busy.value || Boolean(operations.pending.value)"
          :busy="operations.busy.value" :loading="loading" @sort="sortColumn" @submit="save">
          <template #before-table="{ expanded }">
            <div v-if="expanded && error" class="alert alert-warning m-2" role="alert">{{ error }}</div>
            <div v-if="expanded && loading" class="text-muted p-2" role="status">Loading check-ins...</div>
            <p v-if="editing" id="time-guidance" class="small text-muted">Times are in {{ event.timeZone || 'an unavailable event timezone' }}. Include the date. Ambiguous or nonexistent daylight-saving times must be corrected. {{ bounds ? '' : 'Time editing is unavailable for this event.' }}</p>
          </template>
          <template #cell-name="{ row }">
            <template v-if="editing"><input v-if="contactDraft(row)" v-model="contactDraft(row).name" class="form-control" :aria-label="`Name for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else class="form-control" :value="contactName(row)" aria-label="Name unavailable" disabled></template>
            <RouterLink v-else-if="linked(row)" :to="{ name: 'contact-profile', params: { contactId: contactId(row) } }">{{ shownName(row) }}</RouterLink>
            <span v-else>{{ shownName(row) }}</span>
          </template>
          <template #cell-emails="{ row }">
            <input v-if="editing && contactDraft(row)" v-model="contactDraft(row).emails" class="form-control" :aria-label="`Emails for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else-if="editing" class="form-control" aria-label="Emails unavailable" disabled><template v-else><template v-for="(email, index) in emailsFor(row)" :key="index"><span v-if="index">, </span><a :href="`mailto:${email}`">{{ email }}</a></template></template>
          </template>
          <template #cell-phones="{ row }">
            <input v-if="editing && contactDraft(row)" v-model="contactDraft(row).phones" class="form-control" :aria-label="`Phones for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else-if="editing" class="form-control" aria-label="Phones unavailable" disabled><template v-else><template v-for="(phone, index) in values(contactFor(row)?.phones)" :key="index"><span v-if="index">, </span><a :href="smsLink(phone, row)">{{ displayPhone(phoneDigits(phone)) }}</a></template></template>
          </template>
          <template #cell-zip="{ row }">
            <input v-if="editing && contactDraft(row)" v-model="contactDraft(row).zips" class="form-control" :aria-label="`ZIPs for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)">
            <input v-else-if="editing" class="form-control" aria-label="ZIPs unavailable" disabled>
            <template v-else-if="staff"><template v-for="(zip, index) in zipList(row)" :key="index"><span v-if="index">, </span><strong v-if="index === 0 && contactFor(row)?.zip_home && zipList(row).length > 1">{{ zip }}</strong><span v-else>{{ zip }}</span></template></template>
            <span v-else>{{ contactFor(row)?.zip_home || '' }}</span>
          </template>
          <template #cell-time="{ row }">
            <input v-if="editing" v-model="drafts.times[String(row.id)]" type="text" placeholder="YYYY-MM-DDTHH:mm:ss" class="form-control" :aria-label="`Time for ${contactName(row)}`" aria-describedby="time-guidance" :disabled="!bounds || operations.busy.value || Boolean(operations.pending.value)"><span v-else>{{ formatTime(rowTimestamp(row)) }}</span>
          </template>
          <template #toolbar>
            <div v-if="staff" class="btn-group btn-group-sm" role="group">
              <button id="attendance-export" type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">{{ exportLabel }}</button>
              <ul class="dropdown-menu" aria-labelledby="attendance-export">
                <li><button type="button" class="dropdown-item" @click="downloadAttendance('csv')">Download CSV</button></li>
                <li><button type="button" class="dropdown-item" @click="downloadAttendance('json')">Download JSON</button></li>
                <li><hr class="dropdown-divider"></li>
                <li><button type="button" class="dropdown-item" @click="copyAttendance('csv')">Copy CSV</button></li>
                <li><button type="button" class="dropdown-item" @click="copyAttendance('json')">Copy JSON</button></li>
                <li><button type="button" class="dropdown-item" @click="copyAttendance('email')">Copy for email merge</button></li>
              </ul>
            </div>
            <template v-if="staff && editing"><button class="btn btn-sm btn-primary" type="submit" :disabled="!mutationsAllowed">Save changes</button><button class="btn btn-sm btn-outline-secondary" type="button" :disabled="operations.busy.value || Boolean(operations.pending.value)" @click="discard">Discard changes</button></template>
            <template v-else-if="staff"><button v-if="selectedRows.length" class="btn btn-sm btn-outline-danger" type="button" :disabled="!mutationsAllowed" @click="confirmRemove">Remove selected</button></template>
            <button v-if="staff && !operations.enabled.value" type="button" class="btn btn-sm btn-outline-secondary" @click="operations.refreshHistory().catch(() => {})">Retry connection</button>
          </template>
          <template #toolbar-status>
            <span v-if="staff && !operations.enabled.value" class="small text-muted">Save, Remove, and Undo require authenticated server history.</span>
          </template>
        </AttendanceTable>
      </section>
      <dialog ref="dialog" class="attendance-dialog" aria-labelledby="remove-title" aria-describedby="remove-description" @cancel.prevent="closeDialog" @close="closeDialog">
        <h2 id="remove-title" class="h5">Remove selected attendees</h2><p id="remove-description">{{ removeMessage }}</p>
        <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-secondary" @click="closeDialog">Cancel</button><button type="button" class="btn btn-danger" :disabled="!mutationsAllowed" @click="remove">Remove attendees</button></div>
      </dialog>
    </template>
  </main>
</template>

<style scoped>
.attendance-dialog { width: min(32rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 1.5rem; border: 1px solid var(--bs-border-color); border-radius: var(--bs-border-radius); }
.attendance-dialog::backdrop { background: rgb(0 0 0 / 50%); }
</style>
