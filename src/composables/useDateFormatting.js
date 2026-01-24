/**
 * Shared date formatting utilities
 */

export function useDateFormatting() {
  /**
   * Format a date string to readable format
   * @param {string} dateStr - ISO date string
   * @returns {string} Formatted date string
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  /**
   * Format a date string to date and time parts
   * @param {string} dateStr - ISO date string
   * @returns {object} Object with date and time strings
   */
  const formatDateTime = (dateStr) => {
    if (!dateStr) return { date: '—', time: '' }
    const d = new Date(dateStr)
    return {
      date: d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      time: d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
    }
  }

  /**
   * Format a date in a specific timezone
   * @param {string} dateStr - ISO date string
   * @param {string} timezone - Timezone identifier
   * @returns {object} Object with date and time strings
   */
  const formatDateInTimezone = (dateStr, timezone = 'America/Toronto') => {
    if (!dateStr) return { date: '—', time: '' }
    const d = new Date(dateStr)
    return {
      date: d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone
      }),
      time: d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone
      })
    }
  }

  /**
   * Get relative time string (e.g., "5m ago", "2h ago")
   * @param {string} dateStr - ISO date string
   * @returns {string} Relative time string
   */
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)

    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`

    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`

    return formatDate(dateStr)
  }

  /**
   * Get today's date parts for a timezone
   * @param {string} timezone - Timezone identifier
   * @returns {object} Object with year, month, day
   */
  const getTodayParts = (timezone = 'America/Toronto') => {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(now)
    return {
      year: parts.find(p => p.type === 'year')?.value,
      month: parts.find(p => p.type === 'month')?.value,
      day: parts.find(p => p.type === 'day')?.value
    }
  }

  /**
   * Format date string for display (simple format)
   * @param {string} dateStr - ISO date string or YYYY-MM-DD
   * @returns {string} Formatted date string
   */
  const formatDateStr = (dateStr) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('T')[0].split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`
  }

  return {
    formatDate,
    formatDateTime,
    formatDateInTimezone,
    getRelativeTime,
    getTodayParts,
    formatDateStr
  }
}
