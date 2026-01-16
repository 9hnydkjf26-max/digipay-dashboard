<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { login, setPassword, handleInviteToken, isAuthenticated, user } = useAuth()

// Form state
const showSetPasswordForm = ref(false)
const email = ref('')
const password = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const userEmail = ref('')

// UI state
const loading = ref(false)
const alertMessage = ref('')
const alertType = ref('error')

function showAlert(message, type = 'error') {
  alertMessage.value = message
  alertType.value = type
}

function hideAlert() {
  alertMessage.value = ''
}

async function handleLogin(e) {
  e.preventDefault()
  hideAlert()
  loading.value = true

  const result = await login(email.value, password.value)

  if (result.success) {
    const redirectTo = route.query.redirect || '/reports'
    router.push(redirectTo)
  } else {
    showAlert(result.error || 'Invalid email or password')
  }

  loading.value = false
}

async function handleSetPasswordSubmit(e) {
  e.preventDefault()
  hideAlert()

  if (newPassword.value !== confirmPassword.value) {
    showAlert('Passwords do not match')
    return
  }

  if (newPassword.value.length < 6) {
    showAlert('Password must be at least 6 characters')
    return
  }

  loading.value = true

  const result = await setPassword(newPassword.value)

  if (result.success) {
    showAlert('Password set successfully! Redirecting...', 'success')
    setTimeout(() => {
      const redirectTo = route.query.redirect || '/reports'
      router.push(redirectTo)
    }, 1500)
  } else {
    showAlert(result.error || 'Error setting password. Please try again.')
  }

  loading.value = false
}

async function handleAuthTokens() {
  // Check for tokens in URL hash (Supabase PKCE flow)
  const hash = window.location.hash.substring(1)
  const hashParams = new URLSearchParams(hash)
  const queryParams = new URLSearchParams(window.location.search)

  // Check for error in URL
  const error = hashParams.get('error') || queryParams.get('error')
  const errorDescription = hashParams.get('error_description') || queryParams.get('error_description')

  if (error) {
    showAlert(errorDescription || error)
    return false
  }

  // Check for access_token (indicates successful token exchange)
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  const type = hashParams.get('type')

  if (accessToken && refreshToken) {
    const result = await handleInviteToken(accessToken, refreshToken)

    if (result.success) {
      if (type === 'invite' || type === 'recovery' || type === 'signup') {
        showSetPasswordForm.value = true
        userEmail.value = user.value?.email || ''
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
        return true
      }
    } else {
      showAlert(result.error || 'Error processing invite link. Please try again or contact support.')
    }
  }

  return false
}

onMounted(async () => {
  // Handle auth tokens from URL
  const hasTokens = await handleAuthTokens()

  // If already authenticated and no tokens, redirect
  if (!hasTokens && isAuthenticated.value) {
    const redirectTo = route.query.redirect || '/reports'
    router.push(redirectTo)
  }
})
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-container">
        <img src="@/assets/digipaylogo.svg" alt="DigiPay Logo">
        <h2>{{ showSetPasswordForm ? 'Welcome!' : 'Sign In' }}</h2>
        <p>{{ showSetPasswordForm ? 'Create a password to complete your account setup' : 'Sign in to access your dashboard' }}</p>
      </div>

      <!-- Alert message -->
      <div v-if="alertMessage" class="alert" :class="`alert-${alertType}`">
        {{ alertMessage }}
      </div>

      <!-- Login Form -->
      <form v-if="!showSetPasswordForm" @submit="handleLogin">
        <div class="form-group">
          <label for="loginEmail">Email Address</label>
          <input
            type="email"
            id="loginEmail"
            v-model="email"
            required
            placeholder="your@email.com"
            autocomplete="email"
            :disabled="loading"
          >
        </div>

        <div class="form-group">
          <label for="loginPassword">Password</label>
          <input
            type="password"
            id="loginPassword"
            v-model="password"
            required
            placeholder="Enter your password"
            autocomplete="current-password"
            :disabled="loading"
          >
        </div>

        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <!-- Set Password Form -->
      <form v-else @submit="handleSetPasswordSubmit">
        <div class="form-group">
          <label for="userEmail">Email Address</label>
          <input
            type="email"
            id="userEmail"
            :value="userEmail"
            disabled
          >
        </div>

        <div class="form-group">
          <label for="newPassword">Create Password</label>
          <input
            type="password"
            id="newPassword"
            v-model="newPassword"
            required
            placeholder="Create a password"
            autocomplete="new-password"
            minlength="6"
            :disabled="loading"
          >
          <p class="form-hint">Must be at least 6 characters</p>
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            v-model="confirmPassword"
            required
            placeholder="Confirm your password"
            autocomplete="new-password"
            minlength="6"
            :disabled="loading"
          >
        </div>

        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? 'Setting password...' : 'Set Password & Continue' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--color-bg);
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.login-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 48px 40px;
  width: 100%;
  max-width: 480px;
  box-shadow: var(--shadow-sm);
}

.logo-container {
  text-align: center;
  margin-bottom: 40px;
}

.logo-container img {
  height: 48px;
  width: auto;
  margin-bottom: 16px;
}

.logo-container h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--color-text);
}

.logo-container p {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 15px;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-bg);
  transition: all 0.15s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.1);
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 24px;
  font-size: 14px;
}

.alert-error {
  background: rgba(220, 38, 38, 0.1);
  color: var(--color-error);
  border: 1px solid rgba(220, 38, 38, 0.2);
}

.alert-success {
  background: rgba(22, 163, 74, 0.1);
  color: var(--color-success);
  border: 1px solid rgba(22, 163, 74, 0.2);
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.w-full {
  width: 100%;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
  }

  .logo-container {
    margin-bottom: 32px;
  }

  .logo-container img {
    height: 40px;
  }
}
</style>
