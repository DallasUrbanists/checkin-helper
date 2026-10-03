<script setup>
import { onMounted, ref } from 'vue'
import { useAuth } from '../composables/firebase.js'
import { useApi } from '../composables/useApi.js'

const { user } = useAuth()
const profile = ref(null)
const checkins = ref([])
const error = ref('')

onMounted(async () => {
  try {
    const api = useApi()
    profile.value = await api.getCurrentUser()
    if (profile.value?.id) {
      const result = await api.getContactCheckins(profile.value.id)
      checkins.value = Array.isArray(result) ? result : (result?.data || [])
    }
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <main>
    <div v-if="error" class="alert alert-warning">{{ error }}</div>
    <h1 class="h3">Your profile</h1>
    <section class="card p-3 mb-4">
      <div class="fw-semibold">{{ profile?.name || user?.displayName || 'User' }}</div>
      <div v-for="email in (profile?.emails || [profile?.email || user?.email])" :key="email" class="text-muted">{{ email }}</div>
      <div v-for="phone in (profile?.phones || [])" :key="phone">{{ phone }}</div>
      <div v-if="profile?.zip_home">Home ZIP: {{ profile.zip_home }}</div>
      <div v-if="profile?.zip_other?.length">Other ZIPs: {{ profile.zip_other.join(', ') }}</div>
    </section>
    <h2 class="h5">Past check-ins</h2>
    <p v-if="!checkins.length" class="text-muted">No past check-ins found.</p>
    <div v-else class="table-responsive">
      <table class="table">
        <thead><tr><th>Event</th><th>Time</th></tr></thead>
        <tbody><tr v-for="checkin in checkins" :key="checkin.id"><td>{{ checkin.event?.title || checkin.event_title || checkin.event_id }}</td><td>{{ checkin.submitted_on || checkin.created_at }}</td></tr></tbody>
      </table>
    </div>
  </main>
</template>
