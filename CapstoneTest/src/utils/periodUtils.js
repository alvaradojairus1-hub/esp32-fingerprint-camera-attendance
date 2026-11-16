import { parseISO } from 'date-fns';

/**
 * Calculate payroll period start and end dates based on payroll configuration.
 * For monthly with recurrence day 29:
 *   - Period runs from the 29th of previous month to 28th of current month
 * 
 * @param {object} config - payroll config with { recurrence: { type, days }, currentDate }
 * @param {Date|string} currentDate - the reference date
 * @returns {object} { startDate, endDate, startDateStr, endDateStr } in YYYY-MM-DD format
 */
export function calculatePayrollDateRange(config, currentDate) {
  const today = currentDate ? new Date(currentDate) : new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!config || !config.recurrence) {
    // default: calendar month
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      startDate: start,
      endDate: end,
      startDateStr: formatDateToISO(start),
      endDateStr: formatDateToISO(end)
    };
  }

  const { recurrence } = config;
  const recurrenceType = (recurrence.type || '').toString().toLowerCase();
  const days = Array.isArray(recurrence.days) ? recurrence.days.map(d => Number(d)).filter(Boolean) : [1];

  if (recurrenceType === 'monthly') {
    // Monthly: typically a single day (e.g., 29)
    const payrollDay = days[0] || 29;
    
    // Calculate the start date: payroll day of PREVIOUS month
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, payrollDay);
    
    // If payroll day hasn't occurred this month yet, backtrack to previous month's payroll day
    if (today.getDate() < payrollDay) {
      startDate.setMonth(today.getMonth() - 1);
    }
    
    // Calculate the end date: day BEFORE the next payroll day (same day next month - 1)
    let endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1); // Day before next payroll day
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return {
      startDate,
      endDate,
      startDateStr: formatDateToISO(startDate),
      endDateStr: formatDateToISO(endDate)
    };
  } else if (recurrenceType === 'semimonthly') {
    // Semi-monthly: two pay dates per month (e.g., 15 and 30)
    const sortedDays = days.sort((a, b) => a - b);
    const currentDay = today.getDate();
    
    // Find the applicable pay period
    let startDay = sortedDays[0];
    let endDay = sortedDays.length > 1 ? sortedDays[1] : sortedDays[0];
    
    if (currentDay < startDay) {
      // We're before the first pay period this month, so use last month's second period
      const prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, endDay);
      const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, startDay);
      return {
        startDate: prevStart,
        endDate: prevEnd,
        startDateStr: formatDateToISO(prevStart),
        endDateStr: formatDateToISO(prevEnd)
      };
    } else if (currentDay < endDay) {
      // We're in the first period
      const start = new Date(today.getFullYear(), today.getMonth(), startDay);
      const end = new Date(today.getFullYear(), today.getMonth(), endDay);
      return {
        startDate: start,
        endDate: end,
        startDateStr: formatDateToISO(start),
        endDateStr: formatDateToISO(end)
      };
    } else {
      // We're in the second period
      const start = new Date(today.getFullYear(), today.getMonth(), endDay);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of month
      return {
        startDate: start,
        endDate: end,
        startDateStr: formatDateToISO(start),
        endDateStr: formatDateToISO(end)
      };
    }
  }

  // Fallback: calendar month
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    startDate: start,
    endDate: end,
    startDateStr: formatDateToISO(start),
    endDateStr: formatDateToISO(end)
  };
}

/**
 * Format a Date to YYYY-MM-DD string
 */
function formatDateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determine if a payroll period (YYYY-MM) falls within a metadata rule.
 * Supports metadata shapes:
 * - { applyMonths: [1..12] }
 * - { period: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }
 * - { applyRange: { startMonth: 1, endMonth: 3 } }
 * If no metadata provided, returns true (legacy behavior: always apply).
 *
 * @param {string} period - period string like '2025-11'
 * @param {object} meta - metadata object possibly containing applyMonths/period/applyRange
 * @returns {boolean}
 */
export function appliesToPeriod(period, meta) {
  if (!meta || typeof meta !== 'object') return true;
  if (!period || typeof period !== 'string') return true;

  // month number for the payroll period
  let year = null, month = null;
  try {
    const parts = period.split('-').map(Number);
    if (parts.length >= 2) {
      year = parts[0];
      month = parts[1];
    }
  } catch (e) {
    return true;
  }
  if (!year || !month) return true;

  // applyMonths explicit array
  if (Array.isArray(meta.applyMonths) && meta.applyMonths.length > 0) {
    return meta.applyMonths.map(m => Number(m)).some(m => m === month);
  }

  // applyRange { startMonth, endMonth }
  if (meta.applyRange && (meta.applyRange.startMonth || meta.applyRange.endMonth)) {
    try {
      const s = Number(meta.applyRange.startMonth || 1);
      const e = Number(meta.applyRange.endMonth || 12);
      return month >= Math.min(s, e) && month <= Math.max(s, e);
    } catch (e) {
      // fallthrough
    }
  }

  // applyDates: explicit array of ISO date strings -> true if any date falls within the payroll period
  if (Array.isArray(meta.applyDates) && meta.applyDates.length > 0) {
    try {
      // if period given as YYYY-MM, check any applyDate's month/year match
      if (year && month) {
        return meta.applyDates.map(d => {
          try { return parseISO(String(d)); } catch (e) { return null; }
        }).some(dt => dt && !isNaN(dt.getTime()) && dt.getFullYear() === year && (dt.getMonth() + 1) === month);
      }
      // otherwise, if no year/month parsed for period, attempt to see whether any date parses at all
      return meta.applyDates.map(d => {
        try { return parseISO(String(d)); } catch (e) { return null; }
      }).some(dt => dt && !isNaN(dt.getTime()));
    } catch (e) {
      // fallthrough to other checks
    }
  }

  // period object with start/end dates
  if (meta.period && (meta.period.start || meta.period.end)) {
    try {
      const pStart = meta.period.start ? parseISO(meta.period.start) : null;
      const pEnd = meta.period.end ? parseISO(meta.period.end) : null;
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);
      if (pStart && pEnd) {
        return !(periodEnd < pStart || periodStart > pEnd);
      }
      if (pStart && !pEnd) return !(periodEnd < pStart);
      if (!pStart && pEnd) return !(periodStart > pEnd);
    } catch (e) {
      // fallthrough
    }
  }

  // default: no metadata -> apply
  return true;
}
