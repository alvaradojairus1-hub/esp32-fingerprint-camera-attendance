/**
 * Utility functions for theme management
 */

/**
 * Check if dark mode is currently active
 * @returns {boolean} True if dark mode is active
 */
export const isDarkMode = () => {
  // Check localStorage first
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'dark') return true;
  if (storedTheme === 'light') return false;

  // Fallback to checking the document class
  return document.documentElement.classList.contains('dark');
};

/**
 * Get the appropriate text color based on the current theme
 * @param {string} lightModeColor - Color to use in light mode
 * @param {string} darkModeColor - Color to use in dark mode
 * @returns {string} The appropriate color for the current theme
 */
export const getThemeAwareColor = (lightModeColor, darkModeColor) => {
  return isDarkMode() ? darkModeColor : lightModeColor;
};

/**
 * Get theme-aware chart title color
 * @returns {string} Color for chart titles that works in both themes
 */
export const getChartTitleColor = () => {
  // Use a very dark color for light mode and light color for dark mode
  return getThemeAwareColor('#000000', '#e5e7eb');
};

/**
 * Add a theme change listener that calls the provided callback
 * @param {Function} callback - Function to call when theme changes
 * @returns {Function} Cleanup function to remove the listener
 */
export const addThemeChangeListener = (callback) => {
  const handleThemeChange = () => {
    callback(isDarkMode());
  };

  // Listen for storage changes (when theme is changed in another tab)
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
      handleThemeChange();
    }
  });

  // Listen for custom theme change events
  window.addEventListener('themechange', handleThemeChange);

  return () => {
    window.removeEventListener('storage', handleThemeChange);
    window.removeEventListener('themechange', handleThemeChange);
  };
};

/**
 * Dispatch a custom theme change event
 * Call this when the theme is changed programmatically
 */
export const dispatchThemeChange = () => {
  window.dispatchEvent(new CustomEvent('themechange', {
    detail: { isDark: isDarkMode() }
  }));
};
