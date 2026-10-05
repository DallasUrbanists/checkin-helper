<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Expand, Minimize } from '@lucide/vue'

const props = defineProps({
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
  sort: { type: Object, required: true },
  rowLabel: { type: Function, default: row => String(row.name || row.id) },
  rowKey: { type: String, default: 'id' },
  wide: { type: Boolean, default: true },
  selectable: Boolean,
  selectionDisabled: Boolean,
  busy: Boolean,
  loading: Boolean
})
const emit = defineEmits(['sort', 'submit'])
const selection = defineModel('selection', { type: Set, default: () => new Set() })
const tableScroll = ref(null)
const panel = ref(null)
const expandToggle = ref(null)
const expanded = ref(false)
const scrollState = ref({ left: false, right: false })
let originalOverflow = ''
let backgroundElements = []
const selectedCount = computed(() => props.rows.filter(row => selection.value.has(rowId(row))).length)
const allSelected = computed(() => props.rows.length > 0 && selectedCount.value === props.rows.length)

function rowId(row) { return String(row[props.rowKey]) }
function ariaSort(column) {
  return props.sort.column === column ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
}
function toggleSelection(row, checked) {
  if (props.selectionDisabled) return
  const next = new Set(selection.value)
  if (checked) next.add(rowId(row)); else next.delete(rowId(row))
  selection.value = next
}
function toggleAll(checked) {
  if (!props.selectionDisabled) selection.value = new Set(checked ? props.rows.map(rowId) : [])
}
function toggleRow(row, event) {
  if (!props.selectable || props.selectionDisabled || event.target.closest('a, button, input, select, textarea')) return
  toggleSelection(row, !selection.value.has(rowId(row)))
}
function updateScrollState() {
  const element = tableScroll.value
  if (!element) return
  scrollState.value = {
    left: element.scrollLeft > 0,
    right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1
  }
}
function shrinkView(restoreFocus = true) {
  if (!expanded.value) return
  expanded.value = false
  document.body.style.overflow = originalOverflow
  for (const { element, inert } of backgroundElements) element.inert = inert
  backgroundElements = []
  void nextTick(() => {
    updateScrollState()
    if (restoreFocus && expandToggle.value?.isConnected) expandToggle.value.focus()
  })
}
async function toggleExpanded() {
  if (expanded.value) { shrinkView(); return }
  originalOverflow = document.body.style.overflow
  expanded.value = true
  await nextTick()
  if (!expanded.value) return
  document.body.style.overflow = 'hidden'
  backgroundElements = [...document.querySelectorAll('#app header, #app main, #app footer')].map(element => ({ element, inert: element.inert }))
  for (const { element } of backgroundElements) element.inert = true
  expandToggle.value?.focus()
  updateScrollState()
}
function expandedKeydown(event) {
  if (!expanded.value || document.querySelector('dialog[open]') || props.busy || event.defaultPrevented) return
  if (event.key === 'Escape') { event.preventDefault(); shrinkView(); return }
  if (event.key !== 'Tab') return
  const selector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
  const notifications = document.querySelector('.operation-notifications')
  const controls = [...panel.value.querySelectorAll(selector), ...(notifications?.querySelectorAll(selector) || [])]
    .filter(element => element.getClientRects().length && !element.closest('[inert]'))
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
    event.preventDefault(); last?.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
    event.preventDefault(); first?.focus()
  }
}
watch(() => props.rows, () => nextTick(updateScrollState), { flush: 'post' })
watch(() => props.busy, value => {
  if (value || !expanded.value) return
  void nextTick(() => {
    if (expanded.value) for (const { element } of backgroundElements) element.inert = true
  })
}, { flush: 'post' })
onMounted(() => {
  window.addEventListener('keydown', expandedKeydown)
  window.addEventListener('resize', updateScrollState)
  updateScrollState()
})
onBeforeUnmount(() => {
  shrinkView(false)
  window.removeEventListener('keydown', expandedKeydown)
  window.removeEventListener('resize', updateScrollState)
})
defineExpose({ shrinkView })
</script>

<template>
  <Teleport to="body" :disabled="!expanded">
    <form v-if="(rows.length && !loading) || expanded" ref="panel" :class="{ 'attendance-expanded': expanded }"
      :role="expanded ? 'dialog' : undefined" :aria-modal="expanded ? 'true' : undefined"
      :aria-label="expanded ? 'Expanded attendance' : undefined" @submit.prevent="emit('submit')">
      <slot name="before-table" :expanded="expanded" />
      <div ref="tableScroll" class="table-responsive attendance-scroll"
        :class="{ 'staff-table': wide, 'has-right-shadow': scrollState.right }" @scroll="updateScrollState">
        <table class="table align-middle attendance-table"
          :class="{ 'staff-table': wide, 'table-hover': wide, 'has-selection': selectable, 'has-left-shadow': scrollState.left }">
          <thead><tr>
            <th v-if="selectable" class="attendance-select" scope="col">
              <input type="checkbox" class="form-check-input" aria-label="Select all attendees" :checked="allSelected"
                :indeterminate="selectedCount > 0 && !allSelected" :disabled="selectionDisabled" @change="toggleAll($event.target.checked)">
            </th>
            <th v-for="column in columns" :key="column.key" :class="column.class" scope="col"
              :aria-sort="ariaSort(column.key)" @click="emit('sort', column.key)">
              <button type="button" class="attendance-sort" @click.stop="emit('sort', column.key)">
                {{ column.label }}<span class="attendance-sort-indicator" aria-hidden="true">
                  <component :is="sort.direction === 'asc' ? ArrowUp : ArrowDown" v-if="sort.column === column.key" :size="12" />
                </span>
              </button>
            </th>
          </tr></thead>
          <tbody class="table-group-divider">
            <tr v-for="row in rows" :key="rowId(row)" @click="toggleRow(row, $event)">
              <td v-if="selectable" class="attendance-select">
                <input type="checkbox" class="form-check-input" :aria-label="`Select ${rowLabel(row)}`"
                  :checked="selection.has(rowId(row))" :disabled="selectionDisabled" @change="toggleSelection(row, $event.target.checked)">
              </td>
              <td v-for="column in columns" :key="column.key" :class="[column.class, column.cellClass]">
                <slot :name="`cell-${column.key}`" :row="row" :column="column">{{ row[column.key] ?? '' }}</slot>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="attendance-toolbar d-flex flex-wrap gap-2 align-items-center" role="toolbar" aria-label="Attendee actions">
        <div class="btn-group btn-group-sm flex-wrap w-100" role="group" aria-label="Attendance controls">
          <slot name="toolbar" :selected-count="selectedCount" />
          <button ref="expandToggle" type="button" class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center gap-1"
            :aria-expanded="expanded" @click="toggleExpanded">
            <component :is="expanded ? Minimize : Expand" :size="14" aria-hidden="true" />{{ expanded ? 'Shrink view' : 'Expand view' }}
          </button>
        </div>
        <slot name="toolbar-status" />
      </div>
    </form>
  </Teleport>
</template>

<style scoped>
.attendance-scroll {
  position: relative;
  width: 100vw;
  max-width: none;
  max-height: calc(100dvh - 8rem);
  margin-left: calc(50% - 50vw);
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior-x: contain;
  scrollbar-color: var(--bs-primary) transparent;
  scrollbar-track-color: transparent;
}
.attendance-scroll::-webkit-scrollbar { height: .65rem; border: 0; background: transparent; }
.attendance-scroll::-webkit-scrollbar-track { border: 0; background: transparent; }
.attendance-scroll::-webkit-scrollbar-corner { background: transparent; }
.attendance-scroll::-webkit-scrollbar-thumb { border: 0; background: var(--bs-primary); border-radius: 999px; }
.attendance-scroll.staff-table.has-right-shadow::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: .75rem;
  content: '';
  pointer-events: none;
  box-shadow: -.5rem 0 1rem -.35rem rgb(0 0 0 / 25%);
}
.attendance-table { width: max-content; min-width: 100%; margin-bottom: 0; white-space: nowrap; }
.attendance-table th,
.attendance-table td { white-space: nowrap; }
.attendance-table th { font-weight: 700; }
.attendance-table th:has(.attendance-sort) { cursor: pointer; }
.attendance-sort {
  display: flex;
  align-items: center;
  gap: .25rem;
  width: 100%;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
}
.attendance-sort:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.attendance-sort-indicator { display: inline-flex; width: .75rem; flex-shrink: 0; }
.attendance-table thead th { position: sticky; top: 0; z-index: 3; background: #e5ebf0; }
.attendance-table .attendance-time { padding-right: 0; text-align: right; }
.attendance-time .attendance-sort { justify-content: flex-end; }
.attendance-time :deep(input.form-control) { text-align: right; }
.attendance-table :deep(a) { color: #003b6f; }
.attendance-table :deep(a:hover),
.attendance-table :deep(a:focus) { color: #00284c; }
.attendance-table .attendance-select,
.attendance-table .attendance-name { position: sticky; z-index: 2; background: #eef2f5; }
.attendance-table thead .attendance-select,
.attendance-table thead .attendance-name { z-index: 4; background: #e5ebf0; }
.attendance-table .attendance-select {
  left: 0;
  width: 2.75rem;
  min-width: 2.75rem;
  padding-right: .75rem;
  padding-left: .75rem;
  text-align: center;
}
.attendance-table .attendance-select input[type='checkbox'] { width: 1.2rem; height: 1.2rem; margin: 0; transform: scale(1.1); }
.attendance-table .attendance-name { left: 0; font-weight: 700; }
.attendance-table.has-selection .attendance-name { left: 2.75rem; }
.attendance-table.has-left-shadow .attendance-name { box-shadow: .5rem 0 1rem -.7rem rgb(0 0 0 / 45%); }
.attendance-table .attendance-name :deep(input.form-control) { font-weight: inherit; }
.attendance-table td:not(.attendance-select):not(.attendance-name) { font-size: .875em; }
.attendance-table :deep(input.form-control) { min-width: 12rem; }
.attendance-toolbar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  width: 100vw;
  max-width: none;
  margin-left: calc(50% - 50vw);
  background: var(--bs-body-bg);
  border-top: 1px solid var(--bs-border-color);
  padding: .75rem .25rem calc(.75rem + env(safe-area-inset-bottom));
}
.attendance-toolbar > .btn-group { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.attendance-toolbar > .btn-group > :deep(*) { min-width: 0; }
.attendance-scroll:not(.staff-table) { overflow-x: visible; }
.attendance-scroll:not(.staff-table) .attendance-table { width: 100%; min-width: 0; padding-right: 0; white-space: normal; }
.attendance-scroll:not(.staff-table) .attendance-table th,
.attendance-scroll:not(.staff-table) .attendance-table td { white-space: normal; }
.attendance-scroll:not(.staff-table) .attendance-select,
.attendance-scroll:not(.staff-table) tbody .attendance-name { position: static; background: transparent; box-shadow: none; }
.attendance-expanded {
  position: fixed;
  inset: 0;
  z-index: 1040;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  margin: 0;
  background: var(--bs-body-bg);
}
.attendance-expanded .attendance-scroll { flex: 1 1 0; width: 100%; min-height: 0; max-height: none; margin-left: 0; overflow: auto; }
.attendance-expanded .attendance-toolbar { position: static; flex-shrink: 0; width: 100%; margin-left: 0; }
@media (max-width: 575.98px) {
  .attendance-table th,
  .attendance-table td,
  .attendance-table td:not(.attendance-select):not(.attendance-name),
  .attendance-table :deep(input.form-control) { font-size: .875rem; }
  .attendance-scroll .attendance-table th,
  .attendance-scroll .attendance-table td { padding: .25rem; }
  .attendance-scroll .attendance-table .attendance-time { padding-right: 0; }
  .attendance-scroll .attendance-table .attendance-select { width: 1.75rem; min-width: 1.75rem; padding-right: 0; }
  .attendance-table.has-selection .attendance-name { left: 1.75rem; }
}
</style>