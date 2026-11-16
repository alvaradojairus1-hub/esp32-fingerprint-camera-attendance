/**
 * Date utility functions for consistent date formatting across the application
 */

/**
 * Safely formats a date value to a localized date string
 * @param {string|number|Date|Object} dateValue - The date value to format
 * @returns {string} - Formatted date string or error message
 */
export const formatDate = (dateValue) => {
  if (!dateValue) return 'No Date';

  try {
    // For ISO format string (e.g., "2025-10-02T08:42:25")
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }

    // Handle different date formats
    let date;

    if (typeof dateValue === 'string') {
      // Try parsing as ISO string first
      date = new Date(dateValue);

      // If invalid, try parsing as timestamp
      if (isNaN(date.getTime())) {
        const timestamp = parseInt(dateValue);
        if (!isNaN(timestamp)) {
          date = new Date(timestamp);
        }
      }
    } else if (typeof dateValue === 'number') {
      // Handle as timestamp
      date = new Date(dateValue);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }

    return date.toLocaleDateString();
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Formats a date to a readable string with time
 * @param {string|number|Date} dateValue - The date value to format
 * @returns {string} - Formatted date and time string
 */
export const formatDateTime = (dateValue) => {
  if (!dateValue) return 'No Date';

  try {
    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }

    return date.toLocaleString();
  } catch (error) {
    return 'Invalid Date';
  }
};

/**
 * Formats a date to show only the time portion
 * @param {string|number|Date} dateValue - The date value to format
 * @returns {string} - Formatted time string
 */
export const formatTime = (dateValue) => {
  if (!dateValue) return 'No Time';

  try {
    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
      return 'Invalid Time';
    }

    return date.toLocaleTimeString();
  } catch (error) {
    return 'Invalid Time';
  }
};
