/**
 * Utilities for formatting data for display
 */

/**
 * Format seconds remaining into a human-readable string
 * @param {number} seconds - Seconds remaining
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(seconds) {
  if (!seconds || seconds <= 0) {
    return 'None';
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  let timeString = '';
  
  if (hours > 0) {
    timeString += `${hours}h `;
  }
  
  if (minutes > 0 || hours > 0) {
    timeString += `${minutes}m `;
  }
  
  timeString += `${remainingSeconds}s`;
  
  return timeString;
}

/**
 * Format a large number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a date object to a readable string
 * @param {Date|number} date - Date object or timestamp
 * @param {boolean} includeSeconds - Whether to include seconds
 * @returns {string} Formatted date string
 */
function formatDate(date, includeSeconds = false) {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  if (includeSeconds) {
    options.second = '2-digit';
  }
  
  return dateObj.toLocaleString(undefined, options);
}

/**
 * Format a date to show day and time
 * @param {Date} date - Date object
 * @returns {string} Formatted date string showing only day and time
 */
function formatDayAndTime(date) {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  
  const options = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return dateObj.toLocaleString(undefined, options);
}

/**
 * Format a date as relative time from now
 * @param {Date} date - Date object
 * @returns {string} Relative time string (e.g., "2 hours ago" or "in 3 days")
 */
function formatRelativeTime(date) {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  const now = new Date();
  const diffMs = dateObj - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDays = Math.round(diffHr / 24);
  
  if (diffSec < 0) {
    // Past
    if (diffSec > -60) return `${Math.abs(diffSec)} seconds ago`;
    if (diffMin > -60) return `${Math.abs(diffMin)} minutes ago`;
    if (diffHr > -24) return `${Math.abs(diffHr)} hours ago`;
    if (diffDays > -7) return `${Math.abs(diffDays)} days ago`;
    return formatDate(date);
  } else {
    // Future
    if (diffSec < 60) return `in ${diffSec} seconds`;
    if (diffMin < 60) return `in ${diffMin} minutes`;
    if (diffHr < 24) return `in ${diffHr} hours`;
    if (diffDays < 7) return `in ${diffDays} days`;
    return formatDate(date);
  }
}

/**
 * Format a percentage change with arrow and color indicators
 * @param {number} percent - Percentage change
 * @returns {string} Formatted percentage change with arrow
 */
function formatPercentChange(percent) {
  if (percent === undefined || percent === null || isNaN(percent)) {
    return '0%';
  }
  
  const roundedPercent = Math.round(percent * 10) / 10; // Round to 1 decimal place
  
  if (roundedPercent > 0) {
    return `+${roundedPercent.toFixed(1)}% 📈`;
  } else if (roundedPercent < 0) {
    return `${roundedPercent.toFixed(1)}% 📉`;
  } else {
    return `${roundedPercent.toFixed(1)}% ⏸️`;
  }
}

/**
 * Format a stat value with K, M, B suffixes for larger numbers
 * @param {number} value - The value to format
 * @returns {string} Formatted value with appropriate suffix
 */
function formatStatValue(value) {
  if (value === undefined || value === null) return '0';
  
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  } else if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  } else {
    return value.toString();
  }
}

/**
 * Format a currency value
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency
 */
function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '$0';
  
  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(2)}K`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Format a time period
 * @param {string} period - The period identifier ('day', 'week', 'month')
 * @returns {string} Formatted period name
 */
function formatPeriod(period) {
  switch (period.toLowerCase()) {
    case 'day':
      return '24 Hours';
    case 'week':
      return '7 Days';
    case 'month':
      return '30 Days';
    default:
      return period;
  }
}

/**
 * Format time since a given date
 * @param {Date} date - The date to calculate time since
 * @returns {string} Formatted time ago string
 */
function formatTimeAgo(date) {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  const now = new Date();
  const diffMs = now - dateObj;
  
  // Convert to seconds, minutes, hours, days
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  
  // Format appropriately based on time difference
  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? 's' : ''}`;
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''}`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''}`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  
  const years = Math.floor(diffDays / 365);
  return `${years} year${years !== 1 ? 's' : ''}`;
}

module.exports = {
  formatTimeRemaining,
  formatNumber,
  formatDate,
  formatDayAndTime,
  formatRelativeTime,
  formatPercentChange,
  formatStatValue,
  formatCurrency,
  formatPeriod,
  formatTimeAgo
};
