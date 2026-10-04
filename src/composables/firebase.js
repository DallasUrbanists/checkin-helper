import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, signOut, createUserWithEmailAndPassword } from 'firebase/auth'
import { getToken as getAppCheckToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { computed, ref } from 'vue'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const configured = Object.values(config).every(Boolean)
const user = ref(null)
const ready = ref(!configured)
const error = ref('')
const claimsReady = ref(!configured)
const claims = ref(null)
const authVersion = ref(0)
const isStaff = computed(() => Boolean(user.value && claimsReady.value && (
  claims.value?.staff === true || claims.value?.role === 'staff' ||
  (Array.isArray(claims.value?.roles) && claims.value.roles.includes('staff'))
)))
let auth = null
let appCheck = null

if (configured) {
  const app = getApps().length ? getApp() : initializeApp(config)
  auth = getAuth(app)

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (siteKey) {
    if (import.meta.env.DEV) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true
    })
  }

  onIdTokenChanged(auth, async value => {
    const version = ++authVersion.value
    claims.value = null
    claimsReady.value = false
    user.value = value
    ready.value = true
    if (!value) {
      claimsReady.value = true
      return
    }
    try {
      const result = await value.getIdTokenResult()
      if (version === authVersion.value && user.value?.uid === value.uid) claims.value = result.claims
    } catch {
      // A failed claim lookup must never grant staff access.
    } finally {
      if (version === authVersion.value && user.value?.uid === value.uid) claimsReady.value = true
    }
  })
}

export function useAuth() {
  const initials = computed(() => {
    const source = user.value?.displayName || user.value?.email || ''
    return source.split(/[\s@]+/).filter(Boolean).map(part => part[0].toUpperCase()).join('') || '?'
  })

  async function run(action) {
    error.value = ''
    if (!auth) {
      error.value = 'Firebase authentication is not configured.'
      return null
    }
    try { return await action() } catch (e) { error.value = e.message || 'Authentication failed.'; return null }
  }

  return {
    user, initials, ready, claimsReady, isStaff, authVersion, error, configured,
    signIn: (email, password) => run(() => signInWithEmailAndPassword(auth, email, password)),
    register: (email, password) => run(() => createUserWithEmailAndPassword(auth, email, password)),
    signInWithGoogle: () => run(() => signInWithPopup(auth, new GoogleAuthProvider())),
    signOut: () => run(() => signOut(auth)),
    getToken: async () => user.value ? user.value.getIdToken() : null,
    getAppCheckToken: async () => {
      if (!appCheck) return null
      const result = await getAppCheckToken(appCheck)
      return result?.token || null
    }
  }
}
