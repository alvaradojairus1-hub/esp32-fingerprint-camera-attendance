/**
 * Color-blind friendly chart configuration for Chart.js
 * Provides accessible color palettes for different types of color vision deficiencies
 */

export const colorBlindFriendlyPalettes = {
  // Standard accessible palette (works for most users)
  standard: {
    primary: '#1f77b4',      // Blue
    secondary: '#ff7f0e',    // Orange
    tertiary: '#2ca02c',     // Green
    quaternary: '#d62728',   // Red
    quinary: '#9467bd',      // Purple
    senary: '#8c564b',       // Brown
    septenary: '#e377c2',    // Pink
    octonary: '#7f7f7f',     // Gray
    nonary: '#bcbd22',       // Olive
    denary: '#17becf'        // Cyan
  },

  // Protanopia/Deuteranopia friendly (Red-Green color blindness)
  protanopia: {
    primary: '#1f77b4',      // Blue
    secondary: '#ff7f0e',    // Orange
    tertiary: '#2ca02c',     // Green
    quaternary: '#d62728',   // Red
    quinary: '#9467bd',      // Purple
    senary: '#8c564b',       // Brown
    septenary: '#e377c2',    // Pink
    octonary: '#7f7f7f',     // Gray
    nonary: '#bcbd22',       // Olive
    denary: '#17becf'        // Cyan
  },

  // Tritanopia friendly (Blue-Yellow color blindness)
  tritanopia: {
    primary: '#d62728',      // Red
    secondary: '#2ca02c',    // Green
    tertiary: '#1f77b4',     // Blue
    quaternary: '#ff7f0e',   // Orange
    quinary: '#9467bd',      // Purple
    senary: '#8c564b',       // Brown
    septenary: '#e377c2',    // Pink
    octonary: '#7f7f7f',     // Gray
    nonary: '#bcbd22',       // Olive
    denary: '#17becf'        // Cyan
  },

  // High contrast palette for low vision users
  highContrast: {
    primary: '#000000',      // Black
    secondary: '#ffffff',    // White
    tertiary: '#ff0000',     // Red
    quaternary: '#00ff00',   // Green
    quinary: '#0000ff',      // Blue
    senary: '#ffff00',       // Yellow
    septenary: '#ff00ff',    // Magenta
    octonary: '#00ffff',     // Cyan
    nonary: '#800000',       // Maroon
    denary: '#008000'        // Dark Green
  }
};

/**
 * Get color-blind friendly colors for charts
 * @param {string} type - Type of color blindness: 'standard', 'protanopia', 'tritanopia', 'highContrast'
 * @param {number} count - Number of colors needed
 * @returns {string[]} Array of hex color codes
 */
export const getAccessibleColors = (type = 'standard', count = 5) => {
  const palette = colorBlindFriendlyPalettes[type] || colorBlindFriendlyPalettes.standard;
  const colors = Object.values(palette);

  // If we need more colors than available, cycle through the palette
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }

  return result;
};

/**
 * Apply theme-aware options to chart configuration
 * @param {Object} options - Chart options object
 * @param {boolean} isDark - Whether dark mode is active
 * @returns {Object} Updated options with theme-aware styling
 */
export const applyThemeToOptions = (options, isDark = null) => {
  const darkMode = isDark !== null ? isDark : document.documentElement.classList.contains('dark');

  // Create a copy of options to avoid mutating the original
  const updatedOptions = { ...options };

  // Apply theme-aware colors to scales
  if (updatedOptions.scales) {
    if (updatedOptions.scales.x) {
      updatedOptions.scales.x.grid = {
        ...updatedOptions.scales.x.grid,
        color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
      };
      updatedOptions.scales.x.ticks = {
        ...updatedOptions.scales.x.ticks,
        color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'
      };
    }

    if (updatedOptions.scales.y) {
      updatedOptions.scales.y.grid = {
        ...updatedOptions.scales.y.grid,
        color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
      };
      updatedOptions.scales.y.ticks = {
        ...updatedOptions.scales.y.ticks,
        color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'
      };
    }
  }

  // Apply theme-aware colors to plugins
  if (updatedOptions.plugins) {
    if (updatedOptions.plugins.legend) {
      updatedOptions.plugins.legend.labels = {
        ...updatedOptions.plugins.legend.labels,
        color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)'
      };
    }

    if (updatedOptions.plugins.title) {
      updatedOptions.plugins.title.color = darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)';
    }
  }

  return updatedOptions;
};

/**
 * Chart.js plugin for accessible charts
 */
export const accessibleChartPlugin = {
  id: 'accessibleChart',
  beforeDraw: (chart) => {
    const ctx = chart.ctx;
    const canvas = chart.canvas;

    // Add ARIA labels to canvas
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', chart.options.accessibility?.ariaLabel || 'Chart visualization');

    // Add description if provided
    if (chart.options.accessibility?.description) {
      canvas.setAttribute('aria-describedby', chart.options.accessibility.description);
    }
  }
};

/**
 * Default accessible chart configuration for attendance data
 */
export const defaultAttendanceChartConfig = {
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: [accessibleChartPlugin],
    scales: {
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          borderColor: 'rgba(0, 0, 0, 0.2)'
        },
        ticks: {
          color: 'rgba(0, 0, 0, 0.7)',
          font: {
            size: 12
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          borderColor: 'rgba(0, 0, 0, 0.2)'
        },
        ticks: {
          color: 'rgba(0, 0, 0, 0.7)',
          font: {
            size: 12
          }
        }
      }
    },
    elements: {
      point: {
        radius: 4,
        hoverRadius: 6
      },
      line: {
        borderWidth: 2
      },
      bar: {
        borderWidth: 1
      }
    },
    accessibility: {
      ariaLabel: 'Attendance statistics chart',
      description: 'Chart showing attendance data over time'
    }
  }
};

/**
 * Create accessible chart configuration for different chart types
 * @param {string} chartType - Type of chart: 'line', 'bar', 'pie', 'doughnut'
 * @param {string} colorBlindType - Type of color blindness support
 * @param {Object} customOptions - Custom chart options to merge
 * @returns {Object} Complete chart configuration
 */
export const createAccessibleChartConfig = (chartType, colorBlindType = 'standard', customOptions = {}) => {
  // customOptions may contain { data, options }
  const defaultOpts = defaultAttendanceChartConfig.options || {};
  const customOpts = customOptions.options || {};

  // Plugins can be provided in two forms:
  // - plugin instances (array) which should be passed to `config.plugins` (Chart.js expects plugin instances here)
  // - plugin options (object) which should live under `options.plugins` (plugin-specific configuration)
  const defaultPluginsArray = Array.isArray(defaultOpts.plugins) ? defaultOpts.plugins : [];
  const customPluginsArrayFromOptions = Array.isArray(customOpts.plugins) ? customOpts.plugins : [];
  const customPluginsArrayFromParam = Array.isArray(customOptions.plugins) ? customOptions.plugins : [];

  // Merge plugin instances, preserving default plugin instances first
  const mergedPluginInstances = [
    ...defaultPluginsArray,
    ...customPluginsArrayFromOptions,
    ...customPluginsArrayFromParam
  ];

  // Build plugin options object by merging any object-form plugins from default/custom options
  const defaultPluginOptions = !Array.isArray(defaultOpts.plugins) && defaultOpts.plugins ? defaultOpts.plugins : {};
  const customPluginOptions = !Array.isArray(customOpts.plugins) && customOpts.plugins ? customOpts.plugins : {};
  const mergedPluginOptions = { ...defaultPluginOptions, ...customPluginOptions };

  const baseConfig = {
    type: chartType,
    data: customOptions.data || {},
    // Chart.js accepts plugin instances via `config.plugins` and plugin options via `options.plugins`
    options: {
      ...defaultOpts,
      ...customOpts,
      // Ensure options.plugins is an object containing plugin options (legend/title settings, etc.)
      plugins: mergedPluginOptions
    },
    // Provide the plugin instances separately so callers can do config.plugins if needed
    plugins: mergedPluginInstances
  };

  // Ensure datasets array exists
  baseConfig.data = baseConfig.data || {};
  baseConfig.data.datasets = baseConfig.data.datasets || [{}];

  // Add color-blind friendly colors based on chart type
  if (chartType === 'pie' || chartType === 'doughnut') {
    if (!baseConfig.data.datasets[0].backgroundColor) {
      baseConfig.data.datasets[0].backgroundColor = getAccessibleColors(colorBlindType, 8);
    }
    if (!baseConfig.data.datasets[0].borderColor) {
      baseConfig.data.datasets[0].borderColor = getAccessibleColors(colorBlindType, 8).map(color => color + '80');
    }
    if (baseConfig.data.datasets[0].borderWidth === undefined) {
      baseConfig.data.datasets[0].borderWidth = 2;
    }
  } else {
    if (!baseConfig.data.datasets[0].backgroundColor) {
      baseConfig.data.datasets[0].backgroundColor = getAccessibleColors(colorBlindType, 1)[0] + '40';
    }
    if (!baseConfig.data.datasets[0].borderColor) {
      baseConfig.data.datasets[0].borderColor = getAccessibleColors(colorBlindType, 1)[0];
    }
  }

  return baseConfig;
};

/**
 * Utility function to add patterns for better accessibility
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Pattern width
 * @param {number} height - Pattern height
 * @param {string} patternType - Type of pattern: 'diagonal', 'dots', 'lines', 'crosshatch'
 * @returns {CanvasPattern} Pattern object
 */
export const createPattern = (ctx, width, height, patternType = 'diagonal') => {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = width;
  patternCanvas.height = height;
  const patternCtx = patternCanvas.getContext('2d');

  patternCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';

  switch (patternType) {
    case 'diagonal':
      patternCtx.beginPath();
      patternCtx.moveTo(0, 0);
      patternCtx.lineTo(width, height);
      patternCtx.stroke();
      break;
    case 'dots':
      patternCtx.beginPath();
      patternCtx.arc(width / 2, height / 2, 2, 0, 2 * Math.PI);
      patternCtx.fill();
      break;
    case 'lines':
      patternCtx.beginPath();
      patternCtx.moveTo(0, height / 2);
      patternCtx.lineTo(width, height / 2);
      patternCtx.stroke();
      break;
    case 'crosshatch':
      patternCtx.beginPath();
      patternCtx.moveTo(0, 0);
      patternCtx.lineTo(width, height);
      patternCtx.moveTo(width, 0);
      patternCtx.lineTo(0, height);
      patternCtx.stroke();
      break;
  }

  return ctx.createPattern(patternCanvas, 'repeat');
};

export default {
  colorBlindFriendlyPalettes,
  getAccessibleColors,
  applyThemeToOptions,
  accessibleChartPlugin,
  defaultAttendanceChartConfig,
  createAccessibleChartConfig,
  createPattern
};
