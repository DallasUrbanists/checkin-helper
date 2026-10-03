<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'

const router = useRouter()
const form = reactive({ name: '', emails: '', phones: '', zip_home: '', zip_other: '' })
const id = ref(null)
const error = ref('')
const saved = ref(false)

onMounted(async () => {
  try {
    const profile = await useApi().getCurrentUser()
    id.value = profile.id
    form.name = profile.name || ''
    form.emails = (profile.emails || [profile.email]).filter(Boolean).join(', ')
    form.phones = (profile.phones || []).join(', ')
    form.zip_home = profile.zip_home || ''
    form.zip_other = (profile.zip_other || []).join(', ')
  } catch (e) {
    error.value = e.message
  }
})

function splitValues(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

async function submit() {
  try {
    await useApi().updateContact(id.value, {
      name: form.name,
      emails: splitValues(form.emails),
      phones: splitValues(form.phones),
      zip_home: form.zip_home,
      zip_other: splitValues(form.zip_other)
    })
    saved.value = true
    setTimeout(() => router.push('/profile'), 600)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <main>
    <h1 class="h3">Edit profile</h1>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="saved" class="alert alert-success">Profile saved.</div>
    <form @submit.prevent="submit">
      <label class="form-label" for="profile-name">Name</label>
      <input id="profile-name" v-model="form.name" class="form-control mb-3" required>
      <label class="form-label" for="profile-emails">Emails <span class="text-muted">(comma separated)</span></label>
      <input id="profile-emails" v-model="form.emails" class="form-control mb-3" type="text">
      <label class="form-label" for="profile-phones">Phones <span class="text-muted">(comma separated)</span></label>
      <input id="profile-phones" v-model="form.phones" class="form-control mb-3" type="text">
      <label class="form-label" for="profile-zip">Home ZIP</label>
      <input id="profile-zip" v-model="form.zip_home" class="form-control mb-3" inputmode="numeric">
      <label class="form-label" for="profile-other-zips">Other ZIPs <span class="text-muted">(comma separated)</span></label>
      <input id="profile-other-zips" v-model="form.zip_other" class="form-control mb-3" inputmode="numeric">
      <button class="btn btn-primary" type="submit" :disabled="!id">Save changes</button>
    </form>
  </main>
</template>
