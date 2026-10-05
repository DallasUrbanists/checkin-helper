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
import 'bootstrap/js/dist/dropdown'
import ExpandablePreview from '../components/ExpandablePreview.vue'

const route = useRoute()
const { findEvent, load } = useEvents()
const auth = useAuth()
const operations = useEventOperations()
const checkins = ref([])
const error = ref('')
const loading = ref(true)
const selection = ref(new Set())
const tableScroll = ref(null)
const scrollState = ref({ left: false, right: false })
const editing = ref(false)
const drafts = ref(null)
const dialog = ref(null)
let generation = 0
let removeTrigger = null
const event = computed(() => findEvent(String(route.params.eventId)))
const staff = auth.isStaff
const dirty = computed(() => editing.value && drafts.value && draftDirty(drafts.value))
const bounds = computed(() => timeBounds(event.value))
const selectedRows = computed(() => checkins.value.filter(row => selection.value.has(String(row.id))))
const exportRows = computed(() => selectedRows.value.length ? selectedRows.value : checkins.value)
const allSelected = computed(() => checkins.value.length > 0 && selectedRows.value.length === checkins.value.length)
const mutationsAllowed = computed(() => operations.enabled.value && staff.value && !operations.busy.value && !operations.pending.value)
const descriptionHtml = computed(() => {
  const description = event.value?.description
  return description ? DOMPurify.sanitize(marked.parse(String(description))) : ''
})

function values(value) { return Array.isArray(value) ? value.filter(v => v != null).map(String) : [] }
function contactName(row) { return contactFor(row)?.name || row.contact_name || 'Anonymous attendee' }
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
function toggleSelection(row, checked) {
  const next = new Set(selection.value)
  if (checked) next.add(String(row.id)); else next.delete(String(row.id))
  selection.value = next
}
function toggleAll(checked) { selection.value = new Set(checked ? checkins.value.map(row => String(row.id)) : []) }
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
  } catch {
    operations.notify('Download failed. Please try again.')
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
async function copyAttendance(format) {
  if (!staff.value || loading.value || !exportRows.value.length) return
  const current = generation
  try {
    await window.navigator.clipboard.writeText(serializeAttendance(exportRows.value, format))
    if (current === generation) operations.notify('Copied to clipboard.', 'success')
  } catch {
    if (current === generation) operations.notify('Could not copy to clipboard. Check your browser clipboard permissions.')
  }
}
function updateScrollState() {
  const element = tableScroll.value
  if (!element) return
  scrollState.value = {
    left: element.scrollLeft > 0,
    right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1
  }
}
function toggleRow(row, event) {
  if (!staff.value || editing.value || event.target.closest('a, button, input, select, textarea')) return
  toggleSelection(row, !selection.value.has(String(row.id)))
}
function clearEditor() { editing.value = false; drafts.value = null; operations.dirty.value = false }
function resetSensitive() {
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
watch(checkins, () => nextTick(updateScrollState), { flush: 'post' })
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
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
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
        <form v-if="checkins.length && !loading" @submit.prevent="save">
          <p v-if="editing" id="time-guidance" class="small text-muted">Times are in {{ event.timeZone || 'an unavailable event timezone' }}. Include the date. Ambiguous or nonexistent daylight-saving times must be corrected. {{ bounds ? '' : 'Time editing is unavailable for this event.' }}</p>
          <div ref="tableScroll" class="table-responsive attendance-scroll" :class="{ 'staff-table': staff, 'has-right-shadow': scrollState.right }" @scroll="updateScrollState">
            <table class="table align-middle attendance-table" :class="{ 'staff-table': staff, 'table-hover': staff, 'has-selection': staff && !editing, 'has-left-shadow': scrollState.left }">
              <thead><tr>
                <th v-if="staff && !editing" class="attendance-select" scope="col"><input type="checkbox" class="form-check-input" aria-label="Select all attendees" :checked="allSelected" :indeterminate="selectedRows.length > 0 && !allSelected" :disabled="operations.busy.value || Boolean(operations.pending.value)" @change="toggleAll($event.target.checked)"></th>
                <th class="attendance-name" scope="col">Name</th><th v-if="staff" scope="col">Email</th><th v-if="staff" scope="col">Phone</th><th scope="col">Zip</th><th scope="col">Time</th>
              </tr></thead>
              <tbody class="table-group-divider">
                <tr v-for="row in checkins" :key="row.id" @click="toggleRow(row, $event)">
                  <td v-if="staff && !editing" class="attendance-select"><input type="checkbox" class="form-check-input" :aria-label="`Select ${contactName(row)}`" :checked="selection.has(String(row.id))" :disabled="operations.busy.value || Boolean(operations.pending.value)" @change="toggleSelection(row, $event.target.checked)"></td>
                  <td class="attendance-name">
                    <template v-if="editing"><input v-if="contactDraft(row)" v-model="contactDraft(row).name" class="form-control" :aria-label="`Name for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else class="form-control" :value="contactName(row)" aria-label="Name unavailable" disabled></template>
                    <RouterLink v-else-if="linked(row)" :to="{ name: 'contact-profile', params: { contactId: contactId(row) } }">{{ shownName(row) }}</RouterLink>
                    <span v-else>{{ shownName(row) }}</span>
                  </td>
                  <td v-if="staff"><input v-if="editing && contactDraft(row)" v-model="contactDraft(row).emails" class="form-control" :aria-label="`Emails for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else-if="editing" class="form-control" aria-label="Emails unavailable" disabled><span v-else>{{ values(contactFor(row)?.emails).join(', ') }}</span></td>
                  <td v-if="staff"><input v-if="editing && contactDraft(row)" v-model="contactDraft(row).phones" class="form-control" :aria-label="`Phones for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)"><input v-else-if="editing" class="form-control" aria-label="Phones unavailable" disabled><span v-else>{{ values(contactFor(row)?.phones).map(p => displayPhone(phoneDigits(p))).join(', ') }}</span></td>
                  <td>
                    <input v-if="editing && contactDraft(row)" v-model="contactDraft(row).zips" class="form-control" :aria-label="`ZIPs for ${contactName(row)}`" :disabled="operations.busy.value || Boolean(operations.pending.value)">
                    <input v-else-if="editing" class="form-control" aria-label="ZIPs unavailable" disabled>
                    <template v-else-if="staff"><template v-for="(zip, index) in zipList(row)" :key="index"><span v-if="index">, </span><strong v-if="index === 0 && contactFor(row)?.zip_home && zipList(row).length > 1">{{ zip }}</strong><span v-else>{{ zip }}</span></template></template>
                    <span v-else>{{ contactFor(row)?.zip_home || '' }}</span>
                  </td>
                  <td><input v-if="editing" v-model="drafts.times[String(row.id)]" type="text" placeholder="YYYY-MM-DDTHH:mm:ss" class="form-control" :aria-label="`Time for ${contactName(row)}`" aria-describedby="time-guidance" :disabled="!bounds || operations.busy.value || Boolean(operations.pending.value)"><span v-else>{{ formatTime(rowTimestamp(row)) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="staff" class="attendance-toolbar d-flex flex-wrap gap-2 align-items-center" role="toolbar" aria-label="Attendee actions">
            <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="Attendance controls">
              <div class="btn-group btn-group-sm" role="group">
                <button id="attendance-export" type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">Export</button>
                <ul class="dropdown-menu" aria-labelledby="attendance-export">
                  <li><button type="button" class="dropdown-item" @click="downloadAttendance('csv')">Download CSV</button></li>
                  <li><button type="button" class="dropdown-item" @click="downloadAttendance('json')">Download JSON</button></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><button type="button" class="dropdown-item" @click="copyAttendance('csv')">Copy CSV</button></li>
                  <li><button type="button" class="dropdown-item" @click="copyAttendance('json')">Copy JSON</button></li>
                  <li><button type="button" class="dropdown-item" @click="copyAttendance('email')">Copy for email merge</button></li>
                </ul>
              </div>
              <template v-if="editing"><button class="btn btn-sm btn-primary" type="submit" :disabled="!mutationsAllowed">Save changes</button><button class="btn btn-sm btn-outline-secondary" type="button" :disabled="operations.busy.value || Boolean(operations.pending.value)" @click="discard">Discard changes</button></template>
              <template v-else><button v-if="selectedRows.length" class="btn btn-sm btn-outline-danger" type="button" :disabled="!mutationsAllowed" @click="confirmRemove">Remove selected</button><button v-if="selectedRows.length" class="btn btn-sm btn-outline-secondary" type="button" :disabled="operations.busy.value || Boolean(operations.pending.value)" @click="toggleAll(false)">Clear selection</button></template>
              <button v-if="!operations.enabled.value" type="button" class="btn btn-sm btn-outline-secondary" @click="operations.refreshHistory().catch(() => {})">Retry connection</button>
            </div>
            <span v-if="!editing" class="small">{{ selectedRows.length }} selected</span>
            <span v-if="!operations.enabled.value" class="small text-muted">Save, Remove, and Undo require authenticated server history.</span>
          </div>
        </form>
      </section>
      <dialog ref="dialog" class="attendance-dialog" aria-labelledby="remove-title" aria-describedby="remove-description" @cancel.prevent="closeDialog" @close="closeDialog">
        <h2 id="remove-title" class="h5">Remove selected attendees</h2><p id="remove-description">{{ removeMessage }}</p>
        <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-secondary" @click="closeDialog">Cancel</button><button type="button" class="btn btn-danger" :disabled="!mutationsAllowed" @click="remove">Remove attendees</button></div>
      </dialog>
    </template>
  </main>
</template>

<style scoped>
.attendance-scroll {
  position: relative;
  width: 100vw;
  max-width: none;
  margin-left: calc(50% - 50vw);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-color: var(--bs-primary) transparent;
  scrollbar-track-color: transparent;
}
.attendance-scroll::-webkit-scrollbar {
  height: .65rem;
  border: 0;
  background: transparent;
}
.attendance-scroll::-webkit-scrollbar-track {
  border: 0;
  background: transparent;
}
.attendance-scroll::-webkit-scrollbar-corner { background: transparent; }
.attendance-scroll::-webkit-scrollbar-thumb {
  border: 0;
  background: var(--bs-primary);
  border-radius: 999px;
}
.attendance-scroll.staff-table.has-right-shadow::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: .75rem;
  content: '';
  pointer-events: none;
  box-shadow: -0.5rem 0 1rem -0.35rem rgb(0 0 0 / 25%);
}
.attendance-table {
  width: max-content;
  min-width: 100%;
  margin-bottom: 0;
  padding-right: 2rem;
  white-space: nowrap;
}
.attendance-table th,
.attendance-table td { white-space: nowrap; }
.attendance-table th { font-weight: 700; }
.attendance-table th:last-child,
.attendance-table td:last-child { padding-right: 2rem; }
.attendance-table a { color: #003b6f; }
.attendance-table a:hover,
.attendance-table a:focus { color: #00284c; }
.attendance-table .attendance-select,
.attendance-table .attendance-name {
  position: sticky;
  z-index: 2;
  background: #eef2f5;
}
.attendance-table thead .attendance-select,
.attendance-table thead .attendance-name { z-index: 4; background: #e5ebf0; }
/*.attendance-table tbody tr:hover > .attendance-select,
.attendance-table tbody tr:hover > .attendance-name { background-color: var(--bs-table-hover-bg); }*/
.attendance-table .attendance-select {
  left: 0;
  width: 2.75rem;
  min-width: 2.75rem;
  padding-right: .75rem;
  padding-left: .75rem;
  text-align: center;
}
.attendance-table .attendance-select input[type='checkbox'] {
  width: 1.2rem;
  height: 1.2rem;
  margin: 0;
  transform: scale(1.1);
}
.attendance-table .attendance-name {
  left: 0;
  font-weight: 700;
}
.attendance-table.has-selection .attendance-name { left: 2.75rem; }
.attendance-table.has-left-shadow .attendance-name { box-shadow: .5rem 0 1rem -0.7rem rgb(0 0 0 / 45%); }
.attendance-table .attendance-name input.form-control { font-weight: inherit; }
.attendance-table td:not(.attendance-select):not(.attendance-name) { font-size: .875em; }
.attendance-table input.form-control { min-width: 12rem; }
.attendance-toolbar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  width: 100vw;
  max-width: none;
  margin-left: calc(50% - 50vw);
  background: var(--bs-body-bg);
  border-top: 1px solid var(--bs-border-color);
  padding: .75rem max(.25rem, calc((100vw - 100%)/2 + .25rem)) calc(.75rem + env(safe-area-inset-bottom));
}
.attendance-dialog { width: min(32rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 1.5rem; border: 1px solid var(--bs-border-color); border-radius: var(--bs-border-radius); }
.attendance-dialog::backdrop { background: rgb(0 0 0 / 50%); }
.attendance-scroll:not(.staff-table) {
  width: 100%;
  margin-left: 0;
  overflow-x: visible;
}
.attendance-scroll:not(.staff-table) .attendance-table {
  width: 100%;
  min-width: 0;
  padding-right: 0;
  white-space: normal;
}
.attendance-scroll:not(.staff-table) .attendance-table th,
.attendance-scroll:not(.staff-table) .attendance-table td {
  white-space: normal;
}
.attendance-scroll:not(.staff-table) .attendance-table td:last-child,
.attendance-scroll:not(.staff-table) .attendance-table th:last-child { padding-right: .75rem; }
.attendance-scroll:not(.staff-table) .attendance-select,
.attendance-scroll:not(.staff-table) .attendance-name {
  position: static;
  background: transparent;
  box-shadow: none;
}
@media (max-width: 575.98px) {
  .attendance-table th,
  .attendance-table td,
  .attendance-table td:not(.attendance-select):not(.attendance-name),
  .attendance-table input.form-control { font-size: .875rem; }
  .attendance-scroll .attendance-table th,
  .attendance-scroll .attendance-table td { padding: .25rem; }
  .attendance-scroll:not(.staff-table) .attendance-table th:last-child,
  .attendance-scroll:not(.staff-table) .attendance-table td:last-child { padding-right: .25rem; }
  .attendance-scroll .attendance-table .attendance-select {
    width: 1.75rem;
    min-width: 1.75rem;
    padding-right: 0;
  }
  .attendance-table.has-selection .attendance-name { left: 1.75rem; }
}
</style>
