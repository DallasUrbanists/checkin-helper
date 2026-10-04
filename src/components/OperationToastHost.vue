<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEventOperations } from '../composables/eventOperations.js'

const operations = useEventOperations()
const { enabled, busy, dirty, history, latest, toasts, pending } = operations
const notifications = ref(null)
const overlay = ref(null)
const message = computed(() => pending.value ? 'Recovering the pending operation…' : 'Applying the operation…')
let previousFocus = null
let mounted = false

function canUndo(toast) {
  const group = history.value.find(item => item.group_id === toast.groupId)
  return enabled.value && !busy.value && !dirty.value && !pending.value && group?.status === 'committed' &&
    group.undo_availability !== 'blocked' && (!group.undo_expires_at || Date.parse(group.undo_expires_at) > Date.now())
}

function editable(event) {
  return event.composedPath().some(node => node instanceof globalThis.Element &&
    (node.matches('input, textarea, select, [role="textbox"]') || node.isContentEditable ||
      node.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')))
}

function onKeydown(event) {
  if (!enabled.value || event.defaultPrevented || event.repeat || event.shiftKey || event.altKey ||
    !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || editable(event) || !latest.value) return
  event.preventDefault()
  if (!busy.value) void operations.undo(latest.value, { keyboard: true }).catch(() => {})
}

async function reloadHistory() {
  if (!busy.value && !pending.value && document.visibilityState !== 'hidden') {
    try { await operations.refreshHistory() } catch { /* The next focus event can retry history discovery. */ }
  }
}

async function dismiss(id) {
  const focused = notifications.value?.contains(document.activeElement)
  operations.dismissToast(id)
  if (focused) {
    await nextTick()
    const next = notifications.value?.querySelector('button')
    if (next) next.focus()
    else if (previousFocus?.isConnected) previousFocus.focus()
  }
}

watch(busy, async value => {
  if (!mounted) return
  if (value) {
    previousFocus = document.activeElement
    await nextTick()
    if (busy.value) overlay.value?.focus()
  } else {
    await nextTick()
    if (previousFocus?.isConnected && (!document.activeElement || document.activeElement === document.body ||
      document.activeElement === overlay.value)) previousFocus.focus()
  }
})

onMounted(() => {
  mounted = true
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('focus', reloadHistory)
  document.addEventListener('visibilitychange', reloadHistory)
})

onUnmounted(() => {
  mounted = false
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus', reloadHistory)
  document.removeEventListener('visibilitychange', reloadHistory)
})
</script>

<template>
  <section ref="notifications" class="operation-notifications" aria-label="Operation notifications">
    <div aria-live="polite" aria-atomic="false" class="operation-toast-list">
      <div v-for="toast in toasts" :key="toast.id" class="operation-toast shadow border rounded bg-body p-3"
        :class="{ 'border-danger': toast.kind === 'error' }" role="status">
        <p class="mb-2">{{ toast.message }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <button v-if="toast.groupId" type="button" class="btn btn-sm btn-outline-primary"
            :disabled="!canUndo(toast)" @click="operations.undo(toast.groupId).catch(() => {})">Undo</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="busy"
            @click="dismiss(toast.id)">Dismiss</button>
        </div>
      </div>
    </div>
    <div v-if="pending" class="operation-toast shadow border rounded bg-body p-3" role="status" aria-live="polite">
      <p class="mb-2">The operation outcome needs recovery before another action.</p>
      <button type="button" class="btn btn-sm btn-primary" :disabled="busy || (pending.kind === 'undo' && dirty)"
        @click="operations.retryPending().catch(() => {})">Retry recovery</button>
    </div>
  </section>
  <div v-if="busy" ref="overlay" class="operation-overlay" role="dialog" aria-modal="true"
    aria-label="Operation in progress" aria-busy="true" tabindex="-1"
    @keydown.tab.prevent @keydown.escape.prevent>
    <div class="rounded bg-body shadow p-4 text-center" role="status" aria-live="polite">
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>{{ message }}
    </div>
  </div>
</template>

<style scoped>
.operation-notifications {
  position: relative;
  width: 100%;
  max-height: 40dvh;
  overflow-y: auto;
  scroll-margin-top: 4rem;
}
.operation-notifications:has(.operation-toast) {
  margin-bottom: 1rem;
}
.operation-toast { pointer-events: auto; margin-top: .5rem; }
.operation-overlay {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: rgb(0 0 0 / 35%);
  display: grid;
  place-items: center;
  padding: 1rem;
}
</style>
