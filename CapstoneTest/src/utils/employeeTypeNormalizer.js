// src/utils/employeeTypeNormalizer.js
// Extracted normalizer for employeeType objects so it can be reused by UI and services.
export function normalizeEmployeeType(input = {}) {
  const out = { ...(input || {}) };
  
  // Explicitly preserve salaryType (hourly, monthly, daily)
  if (input.salaryType) {
    out.salaryType = input.salaryType;
  }
  
  const sections = ['standardAdditions', 'standardDeductions', 'otherPayables', 'customFields'];

  const looksLikePercentageKey = (k = '') => /holiday|special|differential|night|nd|overtime|ot|percent|rate/i.test(k);

  const normalizeSection = (sec) => {
    const src = out[sec];
    if (!src || typeof src !== 'object') return;
    Object.keys(src).forEach((k) => {
      const v = src[k];
      const valNum = (v && typeof v === 'object' && 'value' in v) ? Number(v.value || 0) || 0 : Number(v || 0) || 0;

      // Tax deduction: special handling for bracket structure
      if (sec === 'standardDeductions' && String(k).toLowerCase() === 'tax') {
        // Preserve the bracket structure with isPercentage flag
        if (v && typeof v === 'object' && Object.keys(v).length > 0) {
          src[k] = { ...v, isPercentage: true };
        } else {
          // Default structure if empty
          src[k] = { bracket: '', rate: 0, baseAmount: 0, excessOver: 0, isPercentage: true };
        }
        return;
      }

      // If this is a custom field we must preserve its type and isPercentage flag
      if (sec === 'customFields') {
        const orig = (v && typeof v === 'object') ? v : { value: valNum, isPercentage: false };
        src[k] = { type: orig.type || 'addition', value: valNum, isPercentage: Boolean(orig.isPercentage) };
        // Preserve optional metadata for custom fields (applyMonths / applyRange)
        if (orig.applyMonths && Array.isArray(orig.applyMonths) && orig.applyMonths.length > 0) src[k].applyMonths = orig.applyMonths.slice();
        if (orig.applyRange && typeof orig.applyRange === 'object') src[k].applyRange = { ...orig.applyRange };
        if (orig.applyDates && Array.isArray(orig.applyDates) && orig.applyDates.length > 0) src[k].applyDates = orig.applyDates.slice();
        return;
      }

      // Bonus is a toggled field: preserve object with isPercentage
      if (sec === 'standardAdditions' && String(k).toLowerCase() === 'bonus') {
        const orig = (v && typeof v === 'object') ? v : { value: valNum, isPercentage: false };
        src[k] = { value: valNum, isPercentage: Boolean(orig.isPercentage) };
        // Preserve optional metadata for bonus (applyMonths / period)
        if (orig.applyMonths && Array.isArray(orig.applyMonths) && orig.applyMonths.length > 0) src[k].applyMonths = orig.applyMonths.slice();
        if (orig.period && typeof orig.period === 'object') src[k].period = { ...orig.period };
        return;
      }

      const isPercentageKey = (keyName) => {
        const lower = String(keyName || '').toLowerCase();
        
        const additionPerc = new Set([
          'thirteenthmonth','thirteenth_month','thirteenthmonthpay','thirteenth_month_pay',
          'nightdifferential','night_differential','nightdiff',
          'holidaypay','holiday_pay','regularholidaypay','regular_holiday_pay','regularholiday',
          'specialholidaypay','special_holiday_pay','specialholiday',
          'leaveconversion','leave_conversion','leaveconversionrate'
        ]);
        
        const deductionPerc = new Set([
          'sss','philhealth','phil_health','pagibig','pag_ibig','tax','withholding','withholdingtax','withholding_tax'
        ]);

        if (additionPerc.has(lower) || deductionPerc.has(lower)) return true;
        if (lower === 'overtimerate' || lower === 'overtime_rate') return true;
        if (lower === 'conversionrate' || lower === 'conversion_rate') return true;
        return false;
      };

      if (v && typeof v === 'object' && (v.applyMonths || v.period || v.applyDates)) {
        const obj = { value: valNum };
        if (v.isPercentage !== undefined) obj.isPercentage = Boolean(v.isPercentage);
        if (v.applyMonths && Array.isArray(v.applyMonths) && v.applyMonths.length > 0) obj.applyMonths = v.applyMonths.slice();
        if (v.period && typeof v.period === 'object') obj.period = { ...v.period };
        if (v.applyDates && Array.isArray(v.applyDates) && v.applyDates.length > 0) obj.applyDates = v.applyDates.slice();
        src[k] = obj;
      } else {
        if (isPercentageKey(k)) {
          const origIsPerc = (v && typeof v === 'object' && v.isPercentage === false) ? false : true;
          src[k] = { value: valNum, isPercentage: origIsPerc };
        } else {
          src[k] = valNum;
        }
      }
    });
  };

  sections.forEach(normalizeSection);

  if (out.overtimeRate && typeof out.overtimeRate === 'object') {
    if (out.overtimeRate.isPercentage !== undefined || out.overtimeRate.applyMonths || out.overtimeRate.period || out.overtimeRate.applyDates) {
      out.overtimeRate = { ...(out.overtimeRate || {}), value: Number(out.overtimeRate.value || 0) || 0 };
    } else {
      out.overtimeRate = Number(out.overtimeRate.value || out.overtimeRate || 0) || 0;
    }
  }
  if (out.leaveInformation && out.leaveInformation.conversionRate) {
    const lr = out.leaveInformation.conversionRate;
    if (typeof lr === 'object') {
      const valueNum = Number(lr.value || 0) || 0;
      if (lr.isPercentage !== undefined || lr.applyMonths || lr.period || lr.applyDates) {
        const obj = { value: valueNum };
        if (lr.isPercentage !== undefined) obj.isPercentage = Boolean(lr.isPercentage);
        if (lr.applyMonths && Array.isArray(lr.applyMonths) && lr.applyMonths.length > 0) obj.applyMonths = lr.applyMonths.slice();
        if (lr.period && typeof lr.period === 'object') obj.period = { ...lr.period };
        if (lr.applyDates && Array.isArray(lr.applyDates) && lr.applyDates.length > 0) obj.applyDates = lr.applyDates.slice();
        out.leaveInformation.conversionRate = obj;
      } else {
        out.leaveInformation.conversionRate = valueNum;
      }
    } else {
      out.leaveInformation.conversionRate = Number(out.leaveInformation.conversionRate || 0) || 0;
    }
  }

  if (out.lateDeduction && typeof out.lateDeduction === 'object' && 'value' in out.lateDeduction) {
    out.lateDeduction = Number(out.lateDeduction.value || 0) || 0;
  } else {
    out.lateDeduction = Number(out.lateDeduction || 0) || 0;
  }

  return out;
}
