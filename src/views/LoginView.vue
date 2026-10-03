<script setup>
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/firebase.js'

const router = useRouter(); const route = useRoute()
const { signIn, register, signInWithGoogle, error, configured } = useAuth()
const form = reactive({ email: '', password: '' }); const busy = reactive({ value: false }); const create = reactive({ value: false })
async function submit() { busy.value = true; const result = create.value ? await register(form.email, form.password) : await signIn(form.email, form.password); busy.value = false; if (result) router.push(route.query.redirect || '/') }
async function google() { busy.value = true; const result = await signInWithGoogle(); busy.value = false; if (result) router.push(route.query.redirect || '/') }
</script>
<template>
  <main class="auth-page mx-auto" style="max-width: 30rem">
    <h1 class="h3 mb-3">{{ create.value ? 'Create an account' : 'Log in' }}</h1>
    <p v-if="!configured" class="alert alert-warning">Firebase authentication is not configured for this deployment.</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <form @submit.prevent="submit">
      <label class="form-label" for="login-email">Email</label><input id="login-email" v-model="form.email" class="form-control mb-3" type="email" required autocomplete="email">
      <label class="form-label" for="login-password">Password</label><input id="login-password" v-model="form.password" class="form-control mb-3" type="password" required minlength="6" autocomplete="current-password">
      <button class="btn btn-primary w-100 mb-2" :disabled="busy.value || !configured">{{ create.value ? 'Create account' : 'Log in' }}</button>
    </form>
    <button class="btn btn-outline-secondary w-100 mb-3" :disabled="busy.value || !configured" @click="google">Continue with Google</button>
    <button class="btn btn-link p-0" @click="create.value = !create.value">{{ create.value ? 'Already have an account? Log in' : 'Create an account' }}</button>
  </main>
</template>
