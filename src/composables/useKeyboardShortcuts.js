import { onMounted, onUnmounted } from 'vue'

/**
 * Shared keyboard shortcut utilities
 */

export function useKeyboardShortcuts() {
  const handlers = []

  /**
   * Register a keyboard shortcut handler
   * @param {function} handler - Function to call on keydown
   */
  const registerHandler = (handler) => {
    handlers.push(handler)
  }

  /**
   * Create an escape key handler for closing modals
   * @param {Ref[]} modalRefs - Array of modal ref objects to close
   * @returns {function} Keydown handler function
   */
  const createEscapeHandler = (modalRefs) => {
    return (e) => {
      if (e.key === 'Escape') {
        // Close modals in order (first open one found)
        for (const ref of modalRefs) {
          if (ref.value) {
            ref.value = false
            return
          }
        }
      }
    }
  }

  /**
   * Create a Cmd/Ctrl+K handler for focusing search
   * @param {Ref} inputRef - Ref to the search input element
   * @returns {function} Keydown handler function
   */
  const createSearchFocusHandler = (inputRef) => {
    return (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.value?.focus()
      }
    }
  }

  /**
   * Setup keyboard shortcuts with automatic cleanup
   * @param {object} options - Configuration options
   * @param {Ref[]} options.modals - Modal refs for escape handling
   * @param {Ref} options.searchInput - Search input ref for Cmd+K
   * @param {function} options.customHandler - Custom keydown handler
   */
  const setupShortcuts = ({ modals = [], searchInput = null, customHandler = null }) => {
    const handleKeydown = (e) => {
      // Escape to close modals
      if (e.key === 'Escape' && modals.length > 0) {
        for (const ref of modals) {
          if (ref.value) {
            ref.value = false
            return
          }
        }
      }

      // Cmd/Ctrl+K to focus search
      if (searchInput && (e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInput.value?.focus()
      }

      // Custom handler
      if (customHandler) {
        customHandler(e)
      }
    }

    onMounted(() => {
      document.addEventListener('keydown', handleKeydown)
    })

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeydown)
    })

    return handleKeydown
  }

  return {
    registerHandler,
    createEscapeHandler,
    createSearchFocusHandler,
    setupShortcuts
  }
}
