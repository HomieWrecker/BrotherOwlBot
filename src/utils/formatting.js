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
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  return dateObj.toLocaleString();
}

module.exports = {
  formatTimeRemaining,
  formatNumber,
  formatDate
};
