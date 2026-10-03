import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, createUserWithEmailAndPassword } from 'firebase/auth'
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
let auth = null
let appCheck = null

if (configured) {
  const app = getApps().length ? getApp() : initializeApp(config)
  auth = getAuth(app)

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (siteKey) {
    if (import.meta.env.DEV) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true
    })
  }

  onAuthStateChanged(auth, value => { user.value = value; ready.value = true })
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
    user, initials, ready, error, configured,
    signIn: (email, password) => run(() => signInWithEmailAndPassword(auth, email, password)),
    register: (email, password) => run(() => createUserWithEmailAndPassword(auth, email, password)),
    signInWithGoogle: () => run(() => signInWithPopup(auth, new GoogleAuthProvider())),
    signOut: () => run(() => signOut(auth)),
    getToken: async () => user.value ? user.value.getIdToken() : null,
    getAppCheckToken: async () => appCheck ? getAppCheckToken(appCheck) : null
  }
}
