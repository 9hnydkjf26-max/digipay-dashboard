import { ref, computed, onMounted } from 'vue'
import { supabase } from './useSupabase'

// Shared state across all components using this composable
const user = ref(null)
const session = ref(null)
const loading = ref(true)
const initialized = ref(false)

export function useAuth() {
  const userRole = computed(() => {
    if (!user.value) return null
    return user.value.user_metadata?.role || user.value.app_metadata?.role || null
  })

  const isAdmin = computed(() => {
    return userRole.value === 'admin'
  })

  const isAuthenticated = computed(() => {
    return !!session.value
  })

  async function initialize() {
    if (initialized.value) return

    try {
      loading.value = true

      // Get initial session
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      session.value = currentSession
      user.value = currentSession?.user || null

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, newSession) => {
        console.log('Auth state changed:', event)
        session.value = newSession
        user.value = newSession?.user || null
      })

      initialized.value = true
    } catch (error) {
      console.error('Auth initialization error:', error)
    } finally {
      loading.value = false
    }
  }

  async function login(email, password) {
    try {
      loading.value = true
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      session.value = data.session
      user.value = data.user
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: error.message }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      loading.value = true
      await supabase.auth.signOut()
      session.value = null
      user.value = null
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      loading.value = false
    }
  }

  async function setPassword(password) {
    try {
      loading.value = true
      const { data, error } = await supabase.auth.updateUser({
        password
      })

      if (error) throw error
      return { success: true, user: data.user }
    } catch (error) {
      console.error('Set password error:', error)
      return { success: false, error: error.message }
    } finally {
      loading.value = false
    }
  }

  async function handleInviteToken(accessToken, refreshToken) {
    try {
      loading.value = true
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })

      if (error) throw error

      session.value = data.session
      user.value = data.user
      return { success: true, needsPassword: true }
    } catch (error) {
      console.error('Invite token error:', error)
      return { success: false, error: error.message }
    } finally {
      loading.value = false
    }
  }

  // Initialize on first use
  onMounted(() => {
    if (!initialized.value) {
      initialize()
    }
  })

  return {
    user,
    session,
    loading,
    userRole,
    isAdmin,
    isAuthenticated,
    initialized,
    initialize,
    login,
    logout,
    setPassword,
    handleInviteToken
  }
}
