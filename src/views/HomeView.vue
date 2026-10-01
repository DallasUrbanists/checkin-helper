<script setup>
import { onMounted } from 'vue'
import { useEvents, formatEventDate } from '../composables/useEvents.js'

const { upcoming, status, error, load } = useEvents()

onMounted(load)
</script>

<template>
  <main>
    <h2 class="h3 mb-3">Choose an event</h2>

    <div v-if="status === 'loading' || status === 'idle'" class="d-flex align-items-center" role="status">
      <div class="spinner-border spinner-border-sm me-2" aria-hidden="true"></div>
      Loading events...
    </div>

    <div v-else-if="status === 'error'" class="alert alert-danger" role="alert">
      {{ error }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button>
    </div>

    <p v-else-if="!upcoming.length" class="text-muted">No upcoming events found.</p>

    <div v-else class="list-group">
      <RouterLink
        v-for="event in upcoming"
        :key="event.id"
        :to="{ name: 'checkin', params: { eventId: event.id } }"
        class="list-group-item list-group-item-action py-3"
      >
        <div class="fw-semibold">{{ event.title }}</div>
        <div class="text-muted small">{{ formatEventDate(event) }}</div>
      </RouterLink>
    </div>
  </main>
</template>
