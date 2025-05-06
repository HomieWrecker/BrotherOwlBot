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

module.exports = {
  formatTimeRemaining,
  formatNumber,
  formatDate,
  formatDayAndTime,
  formatRelativeTime
};
