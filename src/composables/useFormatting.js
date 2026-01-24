/**
 * Shared formatting utilities for currency and numbers
 */

export function useFormatting() {
  /**
   * Format a number as currency
   * @param {number} amount - The amount to format
   * @param {string} currency - Currency code (default: 'CAD')
   * @returns {string} Formatted currency string
   */
  const formatCurrency = (amount, currency = 'CAD') => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0)
  }

  /**
   * Format currency in short form (K, M suffixes)
   * @param {number} amount - The amount to format
   * @returns {string} Formatted short currency string
   */
  const formatCurrencyShort = (amount) => {
    const num = amount || 0
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`
    }
    return `$${num.toFixed(2)}`
  }

  /**
   * Format a number with commas
   * @param {number} num - The number to format
   * @returns {string} Formatted number string
   */
  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num || 0)
  }

  /**
   * Format a percentage
   * @param {number} value - The decimal value (0.5 = 50%)
   * @param {number} decimals - Number of decimal places (default: 1)
   * @returns {string} Formatted percentage string
   */
  const formatPercent = (value, decimals = 1) => {
    return `${((value || 0) * 100).toFixed(decimals)}%`
  }

  return {
    formatCurrency,
    formatCurrencyShort,
    formatNumber,
    formatPercent
  }
}
