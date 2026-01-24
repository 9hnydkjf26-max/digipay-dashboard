<script setup>
import { ref, onMounted } from 'vue'

// Plugin release info
const pluginVersion = ref(null)
const pluginDownloadUrl = ref('https://github.com/9hnydkjf26-max/digipay-plugin/releases/latest')
const loadingRelease = ref(true)

async function fetchLatestRelease() {
  try {
    const response = await fetch('https://api.github.com/repos/9hnydkjf26-max/digipay-plugin/releases/latest')
    if (response.ok) {
      const data = await response.json()
      pluginVersion.value = data.tag_name || data.name
      // Get the zip download URL from assets if available
      const zipAsset = data.assets?.find(a => a.name.endsWith('.zip'))
      if (zipAsset) {
        pluginDownloadUrl.value = zipAsset.browser_download_url
      }
    }
  } catch (e) {
    console.error('Failed to fetch release info:', e)
  } finally {
    loadingRelease.value = false
  }
}

onMounted(() => {
  fetchLatestRelease()
})
</script>

<template>
  <div class="reports-page documentation">
    <!-- Background -->
    <div class="reports-bg">
      <div class="reports-grid"></div>
      <div class="reports-glow reports-glow-1"></div>
      <div class="reports-glow reports-glow-2"></div>
    </div>

    <div class="reports-main">
      <!-- Top Bar -->
      <header class="reports-topbar">
        <div class="reports-topbar-left">
          <div class="reports-page-title">
            <span class="reports-breadcrumb">Resources</span>
            <h1>Documentation</h1>
          </div>
        </div>
      </header>

      <!-- Documentation Cards -->
      <div class="docs-grid">
        <!-- Integration Guide -->
        <div class="docs-card">
          <div class="docs-card-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div class="docs-card-content">
            <h3>Custom API Integration Guide</h3>
            <p>Complete guide for integrating DigiPay using the custom API. Includes setup, configuration, and implementation details.</p>
          </div>
          <a
            href="/digipay-dashboard/DigipayIntegration.pdf"
            download="DigipayIntegration.pdf"
            class="docs-card-btn"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download PDF
          </a>
        </div>

        <!-- WooCommerce Plugin -->
        <div class="docs-card">
          <div class="docs-card-icon plugin-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
            </svg>
          </div>
          <div class="docs-card-content">
            <h3>
              DigiPay WooCommerce Plugin
              <span v-if="pluginVersion" class="version-badge">{{ pluginVersion }}</span>
              <span v-else-if="loadingRelease" class="version-badge loading">...</span>
            </h3>
            <p>Download the latest version of the DigiPay payment gateway plugin for WooCommerce. Includes auto-update functionality.</p>
          </div>
          <a
            :href="pluginDownloadUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-card-btn"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download Latest Release
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@import '@/assets/styles/reports-shared.css';
</style>

<style scoped>
.docs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
}

.docs-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-card:hover {
  border-color: var(--border-default);
}

.docs-card-icon {
  width: 48px;
  height: 48px;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
}

.docs-card-icon svg {
  width: 24px;
  height: 24px;
}

.docs-card-icon.plugin-icon {
  background: var(--accent-success-dim);
  color: var(--accent-success);
}

.docs-card-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.version-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  background: var(--accent-success-dim);
  color: var(--accent-success);
  border-radius: 4px;
}

.version-badge.loading {
  background: var(--bg-surface);
  color: var(--text-tertiary);
}

.docs-card-content p {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.docs-card-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--accent-primary);
  color: white;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  margin-top: auto;
  width: fit-content;
  transition: background 0.15s ease;
}

.docs-card-btn:hover {
  background: #6366f1;
}

.docs-card-btn svg {
  width: 18px;
  height: 18px;
}

@media (max-width: 600px) {
  .docs-grid {
    grid-template-columns: 1fr;
  }
}
</style>
