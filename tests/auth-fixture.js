import { computed, ref } from 'vue'

const user = ref(null)
const ready = ref(true)
const claimsReady = ref(true)
const authVersion = ref(0)
const claims = ref({})
const error = ref('')
const isStaff = computed(() => Boolean(user.value && claimsReady.value && (claims.value.staff === true || claims.value.role === 'staff' || claims.value.roles?.includes('staff'))))

// This module is aliased only by the isolated Playwright development server.
function setAuth(value = {}) {
  authVersion.value++
  claimsReady.value = false
  claims.value = {}
  user.value = value.uid ? { uid: value.uid, displayName: value.name || 'Test Staff', getIdToken: async () => 'isolated-test-token' } : null
  ready.value = value.ready !== false
  const version = authVersion.value
  setTimeout(() => {
    if (version !== authVersion.value) return
    claims.value = value.claims || {}
    claimsReady.value = true
  }, value.delay || 0)
}
window.addEventListener('checkin-test-auth', e => setAuth(e.detail))
setAuth(JSON.parse(window.sessionStorage.getItem('checkin-test-auth') || '{}'))

export function useAuth() {
  return { user, ready, claimsReady, authVersion, isStaff, error, configured: false,
    initials: computed(() => user.value ? 'TS' : '?'),
    signOut: async () => setAuth(), getToken: async () => user.value ? `isolated-test-${user.value.uid}` : null,
    getAppCheckToken: async () => null,
    signIn: async () => null, register: async () => null, signInWithGoogle: async () => null }
}
