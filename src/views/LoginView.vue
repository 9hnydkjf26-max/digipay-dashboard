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
  <div class="login-page">
    <!-- Left Panel - Branding -->
    <div class="login-brand">
      <div class="brand-content">
        <img src="@/assets/digipaylogo.svg" alt="DigiPay" class="brand-logo">
        <h1>DigiPay Dashboard</h1>
        <p>Manage your payments, track transactions, and grow your business with powerful analytics.</p>

        <div class="brand-features">
          <div class="feature">
            <div class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span>Secure & Encrypted</span>
          </div>
          <div class="feature">
            <div class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <span>Real-time Analytics</span>
          </div>
          <div class="feature">
            <div class="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M12 10v4"/><path d="M2 10h20"/>
              </svg>
            </div>
            <span>Multi-processor Support</span>
          </div>
        </div>
      </div>

      <div class="brand-footer">
        <span>Trusted by merchants worldwide</span>
      </div>
    </div>

    <!-- Right Panel - Form -->
    <div class="login-form-panel">
      <div class="login-form-container">
        <div class="form-header">
          <h2>{{ showSetPasswordForm ? 'Create Password' : 'Welcome back' }}</h2>
          <p>{{ showSetPasswordForm ? 'Set up your account to get started' : 'Enter your credentials to continue' }}</p>
        </div>

        <!-- Alert message -->
        <div v-if="alertMessage" class="alert" :class="`alert-${alertType}`">
          <svg v-if="alertType === 'error'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          {{ alertMessage }}
        </div>

        <!-- Login Form -->
        <form v-if="!showSetPasswordForm" @submit="handleLogin" class="login-form">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <div class="input-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                type="email"
                id="loginEmail"
                v-model="email"
                required
                placeholder="name@company.com"
                autocomplete="email"
                :disabled="loading"
              >
            </div>
          </div>

          <div class="form-group">
            <label for="loginPassword">Password</label>
            <div class="input-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
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
          </div>

          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="loading-spinner"></span>
            <span v-else>Sign in</span>
            <svg v-if="!loading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </form>

        <!-- Set Password Form -->
        <form v-else @submit="handleSetPasswordSubmit" class="login-form">
          <div class="form-group">
            <label for="userEmail">Email</label>
            <div class="input-wrapper disabled">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                type="email"
                id="userEmail"
                :value="userEmail"
                disabled
              >
            </div>
          </div>

          <div class="form-group">
            <label for="newPassword">New Password</label>
            <div class="input-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type="password"
                id="newPassword"
                v-model="newPassword"
                required
                placeholder="Min. 6 characters"
                autocomplete="new-password"
                minlength="6"
                :disabled="loading"
              >
            </div>
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <div class="input-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
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
          </div>

          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="loading" class="loading-spinner"></span>
            <span v-else>Create Account</span>
            <svg v-if="!loading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
}

/* Left Panel - Branding */
.login-brand {
  flex: 1;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 60px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

.login-brand::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(99, 91, 255, 0.1) 0%, transparent 50%);
  animation: pulse 15s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(10%, 10%); }
}

.brand-content {
  position: relative;
  z-index: 1;
}

.brand-logo {
  height: 56px;
  width: auto;
  margin-bottom: 32px;
  filter: brightness(0) invert(1);
}

.login-brand h1 {
  font-size: 36px;
  font-weight: 700;
  color: white;
  margin: 0 0 16px 0;
  letter-spacing: -0.02em;
}

.login-brand > .brand-content > p {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  margin: 0 0 48px 0;
  max-width: 400px;
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 500;
}

.feature-icon {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a78bfa;
}

.brand-footer {
  position: relative;
  z-index: 1;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* Right Panel - Form */
.login-form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: var(--color-bg);
}

.login-form-container {
  width: 100%;
  max-width: 400px;
}

.form-header {
  margin-bottom: 40px;
}

.form-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.form-header p {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper svg {
  position: absolute;
  left: 16px;
  color: var(--color-text-tertiary);
  pointer-events: none;
  transition: color 0.2s;
}

.input-wrapper input {
  width: 100%;
  padding: 14px 16px 14px 50px;
  border: 2px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-card);
  transition: all 0.2s;
}

.input-wrapper input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(99, 91, 255, 0.1);
}

.input-wrapper input:focus + svg,
.input-wrapper:focus-within svg {
  color: var(--color-primary);
}

.input-wrapper input::placeholder {
  color: var(--color-text-tertiary);
}

.input-wrapper.disabled {
  opacity: 0.6;
}

.input-wrapper input:disabled {
  cursor: not-allowed;
  background: var(--color-bg);
}

.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.alert svg {
  flex-shrink: 0;
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

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 16px 24px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: linear-gradient(135deg, #635bff 0%, #7c3aed 100%);
  color: white;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(99, 91, 255, 0.4);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 91, 255, 0.5);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Mobile Responsive */
@media (max-width: 900px) {
  .login-page {
    flex-direction: column;
  }

  .login-brand {
    padding: 40px 24px;
    min-height: auto;
  }

  .login-brand h1 {
    font-size: 28px;
  }

  .login-brand > .brand-content > p {
    font-size: 16px;
    margin-bottom: 32px;
  }

  .brand-features {
    display: none;
  }

  .brand-footer {
    display: none;
  }

  .login-form-panel {
    padding: 40px 24px;
  }
}

@media (max-width: 480px) {
  .login-brand {
    padding: 32px 20px;
  }

  .brand-logo {
    height: 44px;
  }

  .login-brand h1 {
    font-size: 24px;
  }

  .login-form-panel {
    padding: 32px 20px;
  }

  .form-header h2 {
    font-size: 24px;
  }

  .input-wrapper input {
    padding: 12px 16px 12px 46px;
  }

  .submit-btn {
    padding: 14px 20px;
  }
}
</style>
