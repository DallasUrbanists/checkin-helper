<script setup>
import { computed, onMounted, ref } from 'vue'
import { useEvents, formatEventDate } from '../composables/useEvents.js'

const { current, future, past, status, error, load } = useEvents()
const tabs = ['Future', 'Past']
const activeTab = ref('Future')
const displayedEvents = computed(() => activeTab.value === 'Future' ? future.value : past.value)

function handleTabKey(event) {
  const index = tabs.indexOf(activeTab.value)
  const nextIndex = {
    ArrowRight: (index + 1) % tabs.length,
    ArrowLeft: (index + tabs.length - 1) % tabs.length,
    Home: 0,
    End: tabs.length - 1
  }[event.key]
  if (nextIndex === undefined) return
  event.preventDefault()
  activeTab.value = tabs[nextIndex]
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex].focus()
}

onMounted(load)
</script>

<template>
  <main>
    <div v-if="status === 'loading' || status === 'idle'" class="d-flex align-items-center" role="status">
      <div class="spinner-border spinner-border-sm me-2" aria-hidden="true"></div>
      Loading events...
    </div>

    <div v-else-if="status === 'error'" class="alert alert-danger" role="alert">
      {{ error }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button>
    </div>

    <template v-else>
      <section class="mb-4">
        <h3 class="h5 mb-2">Current</h3>
        <p v-if="!current.length" class="text-muted">No current events ready for check-in at this time.</p>
        <div v-else class="list-group">
          <RouterLink
            v-for="event in current"
            :key="event.id"
            :to="{ name: 'checkin', params: { eventId: event.id } }"
            class="list-group-item list-group-item-action py-3"
          >
            <div class="fw-semibold">{{ event.title }}</div>
            <div class="text-muted small">{{ formatEventDate(event) }}</div>
          </RouterLink>
        </div>
      </section>

      <div class="nav nav-tabs mb-3" role="tablist" aria-label="Event history">
        <button
          v-for="tab in tabs"
          :id="`events-${tab.toLowerCase()}-tab`"
          :key="tab"
          type="button"
          role="tab"
          class="nav-link"
          :class="{ active: activeTab === tab }"
          :aria-selected="activeTab === tab"
          aria-controls="events-tab-panel"
          :tabindex="activeTab === tab ? 0 : -1"
          @click="activeTab = tab"
          @keydown="handleTabKey"
        >
          {{ tab }}
        </button>
      </div>

      <section
        id="events-tab-panel"
        class="mb-4"
        role="tabpanel"
        :aria-labelledby="`events-${activeTab.toLowerCase()}-tab`"
        tabindex="0"
      >
        <p v-if="!displayedEvents.length" class="text-muted">No {{ activeTab.toLowerCase() }} events.</p>
        <div v-else class="list-group">
          <RouterLink
            v-for="event in displayedEvents"
            :key="event.id"
            :to="{ name: 'event', params: { eventId: event.id } }"
            class="list-group-item list-group-item-action py-3"
          >
            <div class="fw-semibold">{{ event.title }}</div>
            <div class="text-muted small">{{ formatEventDate(event) }}</div>
          </RouterLink>
        </div>
      </section>
    </template>
  </main>
</template>
