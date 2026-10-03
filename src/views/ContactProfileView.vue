<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../composables/useApi.js'
const route = useRoute(); const contact = ref(null); const checkins = ref([]); const error = ref('')
onMounted(async () => { try { const api = useApi(); contact.value = await api.getContact(route.params.contactId); const result = await api.getContactCheckins(route.params.contactId); checkins.value = Array.isArray(result) ? result : (result?.data || []) } catch (e) { error.value = e.message } })
</script>
<template><main><div v-if="error" class="alert alert-danger">{{ error }}</div><div v-if="contact"><h1 class="h3">{{ contact.name }}</h1><div v-for="email in contact.emails" :key="email">{{ email }}</div><div v-for="phone in contact.phones" :key="phone">{{ phone }}</div><div v-if="contact.zip_home">ZIP: {{ contact.zip_home }}</div><h2 class="h5 mt-4">Check-ins</h2><ul class="list-group"><li v-for="checkin in checkins" :key="checkin.id" class="list-group-item">{{ checkin.event_id }} <span class="text-muted">{{ checkin.submitted_on }}</span></li></ul></div></main></template>
