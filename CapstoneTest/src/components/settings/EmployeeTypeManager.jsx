import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { firebaseService } from '../../services/firebaseService';
import { Plus, X, ChevronDown, DollarSign, Clock, Settings, AlertCircle, Calendar } from 'lucide-react';

export default function EmployeeTypeManager() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Toggle month number in applyMonths for a nested path (e.g. 'standardAdditions.thirteenthMonth')
  const toggleMonthAt = (path, month) => {
    const source = isEditing ? editingType : newType;
    const updater = isEditing ? setEditingType : setNewType;
    const newState = JSON.parse(JSON.stringify(source || {}));
    const parts = path.split('.');
    let cur = newState;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        if (!cur[p]) cur[p] = {};
        const arr = Array.isArray(cur[p].applyMonths) ? cur[p].applyMonths.slice() : [];
        const idx = arr.indexOf(month);
        if (idx >= 0) arr.splice(idx, 1);
        else arr.push(month);
        cur[p].applyMonths = arr;
      } else {
        if (!cur[p]) cur[p] = {};
        cur = cur[p];
      }
    }
    updater(newState);
  };
  // Add or remove exact date entries (ISO yyyy-mm-dd) at a nested path
  const addDateAt = (path, date) => {
    if (!date) return;
    const source = isEditing ? editingType : newType;
    const updater = isEditing ? setEditingType : setNewType;
    const newState = JSON.parse(JSON.stringify(source || {}));
    const parts = path.split('.');
    let cur = newState;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        if (!cur[p]) cur[p] = {};
        const arr = Array.isArray(cur[p].applyDates) ? cur[p].applyDates.slice() : [];
        if (!arr.includes(date)) arr.push(date);
        cur[p].applyDates = arr;
      } else {
        if (!cur[p]) cur[p] = {};
        cur = cur[p];
      }
    }
    updater(newState);
  };

  const removeDateAt = (path, dateIndex) => {
    const source = isEditing ? editingType : newType;
    const updater = isEditing ? setEditingType : setNewType;
    const newState = JSON.parse(JSON.stringify(source || {}));
    const parts = path.split('.');
    let cur = newState;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        if (!cur[p]) cur[p] = {};
        const arr = Array.isArray(cur[p].applyDates) ? cur[p].applyDates.slice() : [];
        if (dateIndex >= 0 && dateIndex < arr.length) arr.splice(dateIndex, 1);
        cur[p].applyDates = arr;
      } else {
        if (!cur[p]) cur[p] = {};
        cur = cur[p];
      }
    }
    updater(newState);
  };
  // Reusable numeric input handlers
  const handleNumericChange = (value, path, currentValue, updateFn) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      const update = value.endsWith('.') ? value : value === '' ? 0 : value;
      const newState = {...currentValue};
      
      // Handle nested paths (e.g., 'standardAdditions.thirteenthMonth.value')
      const parts = path.split('.');
      let current = newState;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = update;
      
      updateFn(newState);
    }
  };

  const handleNumericBlur = (value, path, currentValue, updateFn) => {
    let finalValue;
    if (value === '' || value === '.') {
      finalValue = 0;
    } else {
      const cleanVal = value.endsWith('.') ? value.slice(0, -1) : value;
      finalValue = parseFloat(cleanVal);
    }

    const newState = {...currentValue};
    const parts = path.split('.');
    let current = newState;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = finalValue;
    
    updateFn(newState);
  };

  // State management
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const defaultNewType = {
    name: '',
    salaryType: 'monthly',
    rate: 0,
    overtimeRate: {
      value: '',
      isPercentage: true,
      defaultPercentage: 125
    },
    lateDeduction: 0,
    maxOvertimeHours: 2,
    customFields: {},
    leaveInformation: {
      credits: 5, // Default 5 days
      conversionRate: {
        value: '',
        isPercentage: true,
        defaultPercentage: 4.55
      }
    },
    standardAdditions: {
      thirteenthMonth: {
        value: '',
        isPercentage: true,
        defaultPercentage: 8.33
      },
      nightDifferential: {
        value: '',
        isPercentage: true,
        defaultPercentage: 10
      },
      holidayPay: {
        value: '',
        isPercentage: true,
        defaultPercentage: 100
      },
      specialHolidayPay: {
        value: '',
        isPercentage: true,
        defaultPercentage: 130
      },
      bonus: {
        value: '',
        isPercentage: false
      }
    },
    standardDeductions: {
      sss: {
        value: '',
        isPercentage: true,
        defaultPercentage: 4
      },
      philHealth: {
        value: '',
        isPercentage: true,
        defaultPercentage: 1.75
      },
      pagIbig: {
        value: '',
        isPercentage: true,
        defaultPercentage: 2,
        maxAmount: 100
      },
      tax: {
        bracket: '',
        rate: 0,
        baseAmount: 0,
        excessOver: 0,
        isProgressive: true
      }
    }
  };
  
  const [newType, setNewType] = useState(defaultNewType);
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [specialHolidayDateInput, setSpecialHolidayDateInput] = useState('');

  // Expand DB-shaped employee type into UI-friendly shape (reusable)
  const expandEmployeeType = (t) => {
    const defaults = {
      overtimeRate: 125,
      leaveConversion: 4.55,
      thirteenthMonth: 8.33,
      nightDifferential: 10,
      holidayPay: 100,
      specialHolidayPay: 130
    };

    const copy = { ...(t || {}) };
    // overtimeRate
    if (copy.overtimeRate === undefined || copy.overtimeRate === null) {
      copy.overtimeRate = { value: '', isPercentage: true, defaultPercentage: defaults.overtimeRate };
    } else if (typeof copy.overtimeRate === 'number') {
      copy.overtimeRate = { value: copy.overtimeRate, isPercentage: true, defaultPercentage: defaults.overtimeRate };
    } else if (typeof copy.overtimeRate === 'object') {
      copy.overtimeRate = { value: copy.overtimeRate.value || 0, isPercentage: !!copy.overtimeRate.isPercentage, defaultPercentage: copy.overtimeRate.defaultPercentage || defaults.overtimeRate };
    }

    // leaveInformation.conversionRate
    if (!copy.leaveInformation) copy.leaveInformation = { credits: 5, conversionRate: { value: '', isPercentage: true, defaultPercentage: defaults.leaveConversion } };
    else {
      const conv = copy.leaveInformation.conversionRate;
      if (conv === undefined || conv === null) {
        copy.leaveInformation.conversionRate = { value: '', isPercentage: true, defaultPercentage: defaults.leaveConversion };
      } else if (typeof conv === 'number') {
        copy.leaveInformation.conversionRate = { value: conv, isPercentage: true, defaultPercentage: defaults.leaveConversion };
      } else {
        copy.leaveInformation.conversionRate = { value: conv.value || 0, isPercentage: !!conv.isPercentage, defaultPercentage: conv.defaultPercentage || defaults.leaveConversion };
        if (conv.applyMonths && Array.isArray(conv.applyMonths) && conv.applyMonths.length > 0) copy.leaveInformation.conversionRate.applyMonths = conv.applyMonths.slice();
        if (conv.period && typeof conv.period === 'object') copy.leaveInformation.conversionRate.period = { ...conv.period };
        if (conv.applyDates && Array.isArray(conv.applyDates) && conv.applyDates.length > 0) copy.leaveInformation.conversionRate.applyDates = conv.applyDates.slice();
      }
    }

    // standardAdditions
    copy.standardAdditions = copy.standardAdditions || {};
    ['thirteenthMonth','nightDifferential','holidayPay','specialHolidayPay'].forEach(k => {
      const v = copy.standardAdditions[k];
      if (v === undefined || v === null) {
        copy.standardAdditions[k] = { value: '', isPercentage: true, defaultPercentage: defaults[k] };
      } else if (typeof v === 'number') {
        copy.standardAdditions[k] = { value: v, isPercentage: true, defaultPercentage: defaults[k] };
      } else {
        copy.standardAdditions[k] = { value: v.value || 0, isPercentage: !!v.isPercentage, defaultPercentage: v.defaultPercentage || defaults[k] };
        if (v.applyMonths && Array.isArray(v.applyMonths) && v.applyMonths.length > 0) copy.standardAdditions[k].applyMonths = v.applyMonths.slice();
        if (v.period && typeof v.period === 'object') copy.standardAdditions[k].period = { ...v.period };
        if (v.applyDates && Array.isArray(v.applyDates) && v.applyDates.length > 0) copy.standardAdditions[k].applyDates = v.applyDates.slice();
      }
    });
    // bonus
    if (copy.standardAdditions.bonus === undefined) copy.standardAdditions.bonus = { value: '', isPercentage: false };
    else if (typeof copy.standardAdditions.bonus === 'number') copy.standardAdditions.bonus = { value: copy.standardAdditions.bonus, isPercentage: false };
    else if (typeof copy.standardAdditions.bonus === 'object') {
      copy.standardAdditions.bonus = { value: copy.standardAdditions.bonus.value || 0, isPercentage: !!copy.standardAdditions.bonus.isPercentage };
      const rawBonus = t.standardAdditions && t.standardAdditions.bonus;
      if (rawBonus && rawBonus.applyMonths && Array.isArray(rawBonus.applyMonths) && rawBonus.applyMonths.length > 0) copy.standardAdditions.bonus.applyMonths = rawBonus.applyMonths.slice();
      if (rawBonus && rawBonus.period && typeof rawBonus.period === 'object') copy.standardAdditions.bonus.period = { ...rawBonus.period };
      if (rawBonus && rawBonus.applyDates && Array.isArray(rawBonus.applyDates) && rawBonus.applyDates.length > 0) copy.standardAdditions.bonus.applyDates = rawBonus.applyDates.slice();
    }

    // standardDeductions
    copy.standardDeductions = copy.standardDeductions || {};
    ['sss','philHealth','pagIbig'].forEach(k => {
      const v = copy.standardDeductions[k];
      if (v === undefined || v === null) {
        copy.standardDeductions[k] = { value: '', isPercentage: true, defaultPercentage: (k === 'sss' ? 4 : k === 'philHealth' ? 1.75 : 2) };
      } else if (typeof v === 'number') {
        copy.standardDeductions[k] = { value: v, isPercentage: true, defaultPercentage: (k === 'sss' ? 4 : k === 'philHealth' ? 1.75 : 2) };
      } else {
        copy.standardDeductions[k] = { value: v.value || 0, isPercentage: !!v.isPercentage, defaultPercentage: v.defaultPercentage || (k === 'sss' ? 4 : k === 'philHealth' ? 1.75 : 2) };
      }
    });

    // customFields
    copy.customFields = copy.customFields || {};
    Object.keys(copy.customFields).forEach(k => {
      const f = copy.customFields[k];
      if (typeof f === 'number') copy.customFields[k] = { type: 'addition', value: f, isPercentage: false };
      else {
        copy.customFields[k] = { type: f.type || 'addition', value: f.value || 0, isPercentage: !!f.isPercentage };
        if (f.applyMonths && Array.isArray(f.applyMonths) && f.applyMonths.length > 0) copy.customFields[k].applyMonths = f.applyMonths.slice();
        if (f.applyRange && typeof f.applyRange === 'object') copy.customFields[k].applyRange = { ...f.applyRange };
        if (f.applyDates && Array.isArray(f.applyDates) && f.applyDates.length > 0) copy.customFields[k].applyDates = f.applyDates.slice();
      }
    });

    return copy;
  };

  useEffect(() => {
    const fetchEmployeeTypes = async () => {
      try {
        const types = await firebaseService.getEmployeeTypes();
        // Expand compact DB shape into UI-friendly shape expected by this component
        const defaults = {
          overtimeRate: 125,
          leaveConversion: 4.55,
          thirteenthMonth: 8.33,
          nightDifferential: 10,
          holidayPay: 100,
          specialHolidayPay: 130
        };

        // map DB types into UI-friendly shapes
        setEmployeeTypes((types || []).map(expandEmployeeType));
      } catch (err) {
        setError('Failed to load employee types');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeTypes();
  }, []);

  // Normalize an employee type object into compact storage before save.
  // Preserve isPercentage flag for all percentage-based fields per the user-provided table.
  const normalizeTypeForSave = (raw = {}) => {
    const copy = JSON.parse(JSON.stringify(raw || {}));

    const normPrimitive = (entry, key) => {
      if (entry && typeof entry === 'object' && 'value' in entry) return Number(entry.value || 0) || 0;
      return Number(entry || 0) || 0;
    };

    // Percentage-based ADDITIONS from user table: all should persist { value, isPercentage }
    const percentageAdditions = new Set([
      'thirteenthmonth', 'thirteenth_month', 'thirteenthmonthpay',
      'nightdifferential', 'night_differential', 'nightdiff',
      'holidaypay', 'holiday_pay', 'regularholidaypay', 'regular_holiday_pay', 'regularholiday',
      'specialholidaypay', 'special_holiday_pay', 'specialholiday',
      'leaveconversion', 'leave_conversion', 'leaveconversionrate'
    ]);

    // Percentage-based DEDUCTIONS from user table: all should persist { value, isPercentage }
    const percentageDeductions = new Set([
      'sss', 'philhealth', 'phil_health', 'pagibig', 'pag_ibig',
      'tax', 'withholding', 'withholdingtax', 'withholding_tax'
    ]);

    // Normalize standardAdditions: persist isPercentage for percentage-based fields
    if (!copy.standardAdditions) copy.standardAdditions = {};
    Object.keys(copy.standardAdditions).forEach(k => {
      const rawEntry = (raw.standardAdditions && raw.standardAdditions[k]) || copy.standardAdditions[k];
      const kLower = String(k).toLowerCase();
      const val = normPrimitive(rawEntry, k);

      if (kLower === 'bonus') {
        // Bonus: always togglable with isPercentage
        copy.standardAdditions[k] = { value: val, isPercentage: Boolean(rawEntry && rawEntry.isPercentage) };
        if (rawEntry && rawEntry.applyMonths && Array.isArray(rawEntry.applyMonths) && rawEntry.applyMonths.length > 0) copy.standardAdditions[k].applyMonths = rawEntry.applyMonths.slice();
        if (rawEntry && rawEntry.period && typeof rawEntry.period === 'object') copy.standardAdditions[k].period = { ...rawEntry.period };
        if (rawEntry && rawEntry.applyDates && Array.isArray(rawEntry.applyDates) && rawEntry.applyDates.length > 0) copy.standardAdditions[k].applyDates = rawEntry.applyDates.slice();
      } else if (percentageAdditions.has(kLower)) {
        // Percentage-based addition: persist { value, isPercentage: true } per user table
        copy.standardAdditions[k] = { value: val, isPercentage: true };
        if (rawEntry && rawEntry.applyMonths && Array.isArray(rawEntry.applyMonths) && rawEntry.applyMonths.length > 0) copy.standardAdditions[k].applyMonths = rawEntry.applyMonths.slice();
        if (rawEntry && rawEntry.period && typeof rawEntry.period === 'object') copy.standardAdditions[k].period = { ...rawEntry.period };
        if (rawEntry && rawEntry.applyDates && Array.isArray(rawEntry.applyDates) && rawEntry.applyDates.length > 0) copy.standardAdditions[k].applyDates = rawEntry.applyDates.slice();
      } else {
        // Fixed-value addition: store as primitive
        if (rawEntry && typeof rawEntry === 'object' && (rawEntry.applyMonths || rawEntry.period || rawEntry.applyDates)) {
          copy.standardAdditions[k] = { value: val };
          if (rawEntry.applyMonths && Array.isArray(rawEntry.applyMonths) && rawEntry.applyMonths.length > 0) copy.standardAdditions[k].applyMonths = rawEntry.applyMonths.slice();
          if (rawEntry.period && typeof rawEntry.period === 'object') copy.standardAdditions[k].period = { ...rawEntry.period };
          if (rawEntry.applyDates && Array.isArray(rawEntry.applyDates) && rawEntry.applyDates.length > 0) copy.standardAdditions[k].applyDates = rawEntry.applyDates.slice();
        } else {
          copy.standardAdditions[k] = val;
        }
      }
    });

    // Move legacy leaveConversion -> leaveInformation.conversionRate
    if (copy.standardAdditions && copy.standardAdditions.leaveConversion) {
      if (!copy.leaveInformation) copy.leaveInformation = {};
      copy.leaveInformation.conversionRate = copy.standardAdditions.leaveConversion;
      delete copy.standardAdditions.leaveConversion;
    }

    // Normalize standardDeductions: preserve isPercentage for percentage-based deductions per user table
    if (!copy.standardDeductions) copy.standardDeductions = {};
    Object.keys(copy.standardDeductions).forEach(k => {
      const kLower = String(k).toLowerCase();
      const rawEntry = (raw.standardDeductions && raw.standardDeductions[k]) || copy.standardDeductions[k];

      if (kLower === 'tax') {
        // Tax: preserve bracket structure with isPercentage: true
        if (rawEntry && typeof rawEntry === 'object' && Object.keys(rawEntry).length > 0) {
          // Preserve the bracket structure (bracket, rate, baseAmount, excessOver, etc.)
          copy.standardDeductions[k] = { ...rawEntry, isPercentage: true };
        } else {
          // Empty or no tax set: initialize with default structure
          copy.standardDeductions[k] = { bracket: '', rate: 0, baseAmount: 0, excessOver: 0, isPercentage: true };
        }
      } else if (percentageDeductions.has(kLower)) {
        // Percentage-based deduction: persist { value, isPercentage: true } per user table
        const val = normPrimitive(rawEntry, k);
        copy.standardDeductions[k] = { value: val, isPercentage: true };
      } else {
        // Fixed-value deduction: store as primitive
        copy.standardDeductions[k] = normPrimitive(copy.standardDeductions[k], k);
      }
    });

    // Overtime rate: persist as { value, isPercentage: true } per user table (125% multiplier)
    if (copy.overtimeRate) {
      const val = normPrimitive(copy.overtimeRate, 'overtimeRate');
      copy.overtimeRate = { value: val, isPercentage: true };
    }

    // Leave conversion rate: persist as { value, isPercentage: true } per user table (4.55% of monthly salary)
    if (!copy.leaveInformation) copy.leaveInformation = {};
    if (copy.leaveInformation.conversionRate) {
      const rawConv = raw.leaveInformation && raw.leaveInformation.conversionRate;
      const prim = normPrimitive(copy.leaveInformation.conversionRate, 'conversionRate');
      copy.leaveInformation.conversionRate = { value: prim, isPercentage: true };
      if (rawConv && rawConv.applyMonths && Array.isArray(rawConv.applyMonths) && rawConv.applyMonths.length > 0) copy.leaveInformation.conversionRate.applyMonths = rawConv.applyMonths.slice();
      if (rawConv && rawConv.period && typeof rawConv.period === 'object') copy.leaveInformation.conversionRate.period = { ...rawConv.period };
      if (rawConv && rawConv.applyDates && Array.isArray(rawConv.applyDates) && rawConv.applyDates.length > 0) copy.leaveInformation.conversionRate.applyDates = rawConv.applyDates.slice();
    }

    // lateDeduction should be a primitive (currency)
    if (copy.lateDeduction && typeof copy.lateDeduction === 'object' && 'value' in copy.lateDeduction) {
      copy.lateDeduction = Number(copy.lateDeduction.value || 0) || 0;
    } else {
      copy.lateDeduction = Number(copy.lateDeduction || 0) || 0;
    }

    // Normalize customFields: preserve type and isPercentage flag, and optional applyMonths/applyRange metadata
    if (!copy.customFields) copy.customFields = {};
    Object.keys(copy.customFields).forEach(k => {
      const field = copy.customFields[k] || {};
      const val = normPrimitive(field, k);
      copy.customFields[k] = { ...(field.type ? { type: field.type } : {}), value: val, isPercentage: Boolean(field.isPercentage) };
      const rawField = raw.customFields && raw.customFields[k];
      if (rawField && rawField.applyMonths && Array.isArray(rawField.applyMonths) && rawField.applyMonths.length > 0) copy.customFields[k].applyMonths = rawField.applyMonths.slice();
      if (rawField && rawField.applyRange && typeof rawField.applyRange === 'object') copy.customFields[k].applyRange = { ...rawField.applyRange };
      if (rawField && rawField.applyDates && Array.isArray(rawField.applyDates) && rawField.applyDates.length > 0) copy.customFields[k].applyDates = rawField.applyDates.slice();
    });

    // Ensure base rate is numeric
    copy.rate = Number(copy.rate || 0) || 0;

    return copy;
  };

  const handleSave = async (type) => {
    if (type.id) {
      // Show warning for editing existing type
      const confirmEdit = window.confirm(
        'Warning: Updating this employee type will affect all employees currently using it.\n\n' +
        'This will:\n' +
        '• Update rates for future calculations\n' +
        '• Apply new deductions in upcoming payrolls\n' +
        '• Change overtime and holiday rates\n\n' +
        'Historical records will not be affected.\n\n' +
        'Do you want to continue?'
      );
      if (!confirmEdit) return;
    }

    try {
  const payload = normalizeTypeForSave(type);
  // mark payload as already-normalized to avoid double-normalization in the service
  payload.__normalized = true;
  console.log('EmployeeTypeManager: handleSave - payload to be saved:', payload);
  console.log('EmployeeTypeManager: handleSave - standardDeductions.tax:', payload.standardDeductions?.tax);
  const savedType = await firebaseService.saveEmployeeType(payload);
      console.log('EmployeeTypeManager: handleSave - savedType from Firebase:', savedType);
      // Refresh the full list from Firebase and expand to UI-friendly shapes to avoid mixed shapes
      try {
        const types = await firebaseService.getEmployeeTypes();
        setEmployeeTypes((types || []).map(expandEmployeeType));
      } catch (e) {
        // fallback: attempt to merge savedType (best-effort)
        setEmployeeTypes(prev => {
          const index = prev.findIndex(t => t.id === savedType.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = expandEmployeeType(savedType);
            return updated;
          }
          return [...prev, expandEmployeeType(savedType)];
        });
      }
      resetForm();
    } catch (err) {
      setError('Failed to save employee type');
      console.error(err);
    }
  };

  const handleDelete = async (typeId) => {
    if (!window.confirm('Are you sure you want to delete this employee type?')) return;
    try {
      await firebaseService.deleteEmployeeType(typeId);
      setEmployeeTypes(prev => prev.filter(t => t.id !== typeId));
    } catch (err) {
      setError('Failed to delete employee type');
      console.error(err);
    }
  };

  const handleAddCustomField = (type) => {
    // Create a modal-like div for better UX
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom: 15px; font-size: 16px; font-weight: 600;">Add Custom Field</h3>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Field Name:</label>
          <input type="text" id="fieldName" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Field Type:</label>
          <select id="fieldType" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="addition">Addition</option>
            <option value="deduction">Deduction</option>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="cancelBtn" style="padding: 8px 16px; border-radius: 4px; border: 1px solid #ddd;">Cancel</button>
          <button id="addBtn" style="padding: 8px 16px; border-radius: 4px; background: #3B82F6; color: white; border: none;">Add Field</button>
        </div>
      </div>
    `;
    modalDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    document.body.appendChild(modalDiv);

    // Handle modal actions
    const handleAdd = () => {
      const fieldName = document.getElementById('fieldName').value.trim();
      const fieldType = document.getElementById('fieldType').value;

      if (!fieldName) return;

      const updatedType = {
        ...type,
        customFields: {
          ...(type.customFields || {}),
          [fieldName]: {
            type: fieldType,
            value: 0,
            isPercentage: false
          }
        }
      };

      if (type.id) {
        setEditingType(updatedType);
      } else {
        setNewType(updatedType);
      }

      modalDiv.remove();
    };

    // Event listeners
    document.getElementById('addBtn').addEventListener('click', handleAdd);
    document.getElementById('cancelBtn').addEventListener('click', () => modalDiv.remove());
    document.getElementById('fieldName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAdd();
    });
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingType(null);
    setNewType({...defaultNewType});
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg h-48"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2">
        <X className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  const currentType = editingType || newType;
  const isEditing = Boolean(editingType);

  return (
    <div className="p-4 space-y-6 dark:text-gray-100">
      {/* Action Bar */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end mb-6"
      >
        <motion.button 
          onClick={() => {
            if (!showAddForm) {
              resetForm();
              setShowAddForm(true);
            } else {
              setShowAddForm(false);
            }
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`px-4 py-2 ${
            showAddForm 
              ? 'bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-700 text-white' 
              : 'approve-button border-2 rounded-lg font-medium transition-all hover:bg-blue-50 dark:hover:bg-blue-900/30'
          } rounded-lg flex items-center gap-2 transition-colors shadow-sm`}
        >
          {showAddForm ? (
            <X className="w-5 h-5" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
          <span>{showAddForm ? 'Cancel' : 'Add Employee Type'}</span>
        </motion.button>
      </motion.div>

      {/* Add/Edit Form */}
      <AnimatePresence mode="wait">
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6"
          >
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSave(currentType);
            }}>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-4">Employee Type Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Regular, Part-time, Contract"
                    value={currentType.name}
                    onChange={e => isEditing 
                      ? setEditingType({...currentType, name: e.target.value})
                      : setNewType({...currentType, name: e.target.value})
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Salary Basis</label>
                  <select
                    value={currentType.salaryType}
                    onChange={e => isEditing
                      ? setEditingType({...currentType, salaryType: e.target.value})
                      : setNewType({...currentType, salaryType: e.target.value})
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base Rate (₱)</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="0.00"
                      value={currentType.rate === 0 ? '' : currentType.rate}
                      onChange={e => {
                        const val = e.target.value;
                        // Allow numbers, decimal points, and maintain decimal state
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          const update = val.endsWith('.') ? val : val === '' ? 0 : val;
                          isEditing
                            ? setEditingType({...currentType, rate: update})
                            : setNewType({...currentType, rate: update})
                        }
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        // Don't convert to number if empty or just a decimal point
                        if (val === '' || val === '.') {
                          const update = 0;
                          isEditing
                            ? setEditingType({...currentType, rate: update})
                            : setNewType({...currentType, rate: update});
                        } else {
                          // Remove trailing decimal point before converting to number
                          const cleanVal = val.endsWith('.') ? val.slice(0, -1) : val;
                          const numericValue = parseFloat(cleanVal);
                          isEditing
                            ? setEditingType({...currentType, rate: numericValue})
                            : setNewType({...currentType, rate: numericValue});
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Overtime Rate</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.overtimeRate?.defaultPercentage + '%'}
                      value={currentType.overtimeRate?.value === 0 ? '' : currentType.overtimeRate?.value}
                      onChange={e => {
                        const val = e.target.value;
                        // Allow numbers, decimal points, and maintain decimal state
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          const update = {
                            ...currentType,
                            overtimeRate: {
                              ...currentType.overtimeRate,
                              value: val.endsWith('.') ? val : val === '' ? 0 : val
                            }
                          };
                          isEditing ? setEditingType(update) : setNewType(update);
                        }
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        let finalValue;
                        if (val === '' || val === '.') {
                          finalValue = 0;
                        } else {
                          const cleanVal = val.endsWith('.') ? val.slice(0, -1) : val;
                          finalValue = parseFloat(cleanVal);
                        }
                        const update = {
                          ...currentType,
                          overtimeRate: {
                            ...currentType.overtimeRate,
                            value: finalValue
                          }
                        };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 125% of base rate</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Late Deduction (₱)</label>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={currentType.lateDeduction === 0 ? '' : currentType.lateDeduction}
                      onChange={e => {
                      const val = e.target.value;
                      // Allow numbers, decimal points, and maintain decimal state
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        const update = val.endsWith('.') ? val : val === '' ? 0 : val;
                        isEditing
                          ? setEditingType({...currentType, lateDeduction: update})
                          : setNewType({...currentType, lateDeduction: update});
                      }
                    }}
                    onBlur={e => {
                      const val = e.target.value;
                      if (val === '' || val === '.') {
                        const update = 0;
                        isEditing
                          ? setEditingType({...currentType, lateDeduction: update})
                          : setNewType({...currentType, lateDeduction: update});
                      } else {
                        const cleanVal = val.endsWith('.') ? val.slice(0, -1) : val;
                        const numericValue = parseFloat(cleanVal);
                        isEditing
                          ? setEditingType({...currentType, lateDeduction: numericValue})
                          : setNewType({...currentType, lateDeduction: numericValue});
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Overtime Hours/Day</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="2"
                    value={currentType.maxOvertimeHours === undefined ? 2 : currentType.maxOvertimeHours}
                    onChange={e => {
                      const val = e.target.value;
                      const numVal = val === '' ? 2 : parseFloat(val);
                      isEditing
                        ? setEditingType({...currentType, maxOvertimeHours: numVal})
                        : setNewType({...currentType, maxOvertimeHours: numVal});
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default: 2 hours (maximum overtime hours per day)</p>
                </div>
              </div>
            </div>

            {/* Leave Information Section */}
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 mb-6 border border-blue-100 dark:border-blue-800">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-4">Leave Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leave Credits (Days)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="5"
                      value={currentType.leaveInformation?.credits || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const update = {
                          ...currentType,
                          leaveInformation: {
                            ...currentType.leaveInformation,
                            credits: val === '' ? 0 : parseInt(val)
                          }
                        };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">days</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Available leave days for the year</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leave Conversion Rate</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.leaveInformation?.conversionRate?.defaultPercentage + '%'}
                      value={currentType.leaveInformation?.conversionRate?.value === 0 ? '' : currentType.leaveInformation?.conversionRate?.value}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          const update = {
                            ...currentType,
                            leaveInformation: {
                              ...currentType.leaveInformation,
                              conversionRate: {
                                ...currentType.leaveInformation?.conversionRate,
                                value: val.endsWith('.') ? val : val === '' ? 0 : val
                              }
                            }
                          };
                          isEditing ? setEditingType(update) : setNewType(update);
                        }
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        let finalValue;
                        if (val === '' || val === '.') {
                          finalValue = 0;
                        } else {
                          const cleanVal = val.endsWith('.') ? val.slice(0, -1) : val;
                          finalValue = parseFloat(cleanVal);
                        }
                        const update = {
                          ...currentType,
                          leaveInformation: {
                            ...currentType.leaveInformation,
                            conversionRate: {
                              ...currentType.leaveInformation?.conversionRate,
                              value: finalValue
                            }
                          }
                        };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="w-full px-3 pr-8 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 4.55% of monthly salary per day</p>
                  
                </div>
              </div>
            </div>

            {/* Standard Additions Section */}
            <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-4 mb-6 border border-green-100 dark:border-green-800">
              <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-4">Standard Additions</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">13th Month Pay</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardAdditions?.thirteenthMonth?.defaultPercentage + '%'}
                      value={currentType.standardAdditions?.thirteenthMonth?.value === 0 ? '' : currentType.standardAdditions?.thirteenthMonth?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardAdditions.thirteenthMonth.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardAdditions.thirteenthMonth.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 8.33% of annual basic pay</p>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Apply Months (optional)</p>
                    <div className="flex flex-wrap gap-1">
                      {MONTHS.map((m, idx) => {
                        const monthNum = idx + 1;
                        const selected = (currentType.standardAdditions?.thirteenthMonth?.applyMonths || []).includes(monthNum);
                        return (
                          <button
                            key={monthNum}
                            type="button"
                            onClick={() => toggleMonthAt('standardAdditions.thirteenthMonth', monthNum)}
                            className={`px-2 py-1 text-xs rounded ${selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                          >{m}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Night Differential</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardAdditions?.nightDifferential?.defaultPercentage + '%'}
                      value={currentType.standardAdditions?.nightDifferential?.value === 0 ? '' : currentType.standardAdditions?.nightDifferential?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardAdditions.nightDifferential.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardAdditions.nightDifferential.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 10% of hourly rate (10PM-6AM)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regular Holiday Pay</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardAdditions?.holidayPay?.defaultPercentage + '%'}
                      value={currentType.standardAdditions?.holidayPay?.value === 0 ? '' : currentType.standardAdditions?.holidayPay?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardAdditions.holidayPay.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardAdditions.holidayPay.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 100% of daily rate</p>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">Exact Holiday Dates (optional)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={holidayDateInput}
                        onChange={e => setHolidayDateInput(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!holidayDateInput) return;
                          const existing = currentType.standardAdditions?.holidayPay?.applyDates || [];
                          const newDates = Array.from(new Set([...existing, holidayDateInput]));
                          if (isEditing && currentType.id) {
                            try {
                              await firebaseService.saveEmployeeTypeHolidayDates(currentType.id, 'holidayPay', newDates);
                            } catch (e) {
                              console.error('Failed to persist holiday date', e);
                            }
                          }
                          addDateAt('standardAdditions.holidayPay', holidayDateInput);
                          setHolidayDateInput('');
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md"
                      >Add</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(currentType.standardAdditions?.holidayPay?.applyDates || []).map((d, i) => (
                        <div key={d + i} className="px-2 py-1 bg-gray-100 rounded text-xs flex items-center gap-2">
                          <span>{d}</span>
                          <button type="button" onClick={async () => {
                            const existing = currentType.standardAdditions?.holidayPay?.applyDates || [];
                            const newDates = existing.slice();
                            if (i >= 0 && i < newDates.length) newDates.splice(i, 1);
                            if (isEditing && currentType.id) {
                              try {
                                await firebaseService.saveEmployeeTypeHolidayDates(currentType.id, 'holidayPay', newDates);
                              } catch (e) { console.error('Failed to persist holiday date removal', e); }
                            }
                            removeDateAt('standardAdditions.holidayPay', i);
                          }} className="text-red-600">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Special Holiday Pay</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardAdditions?.specialHolidayPay?.defaultPercentage + '%'}
                      value={currentType.standardAdditions?.specialHolidayPay?.value === 0 ? '' : currentType.standardAdditions?.specialHolidayPay?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardAdditions.specialHolidayPay.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardAdditions.specialHolidayPay.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 130% of daily rate</p>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 mb-1 block">Exact Special Holiday Dates (optional)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={specialHolidayDateInput}
                        onChange={e => setSpecialHolidayDateInput(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!specialHolidayDateInput) return;
                          const existing = currentType.standardAdditions?.specialHolidayPay?.applyDates || [];
                          const newDates = Array.from(new Set([...existing, specialHolidayDateInput]));
                          if (isEditing && currentType.id) {
                            try {
                              await firebaseService.saveEmployeeTypeHolidayDates(currentType.id, 'specialHolidayPay', newDates);
                            } catch (e) {
                              console.error('Failed to persist special holiday date', e);
                            }
                          }
                          addDateAt('standardAdditions.specialHolidayPay', specialHolidayDateInput);
                          setSpecialHolidayDateInput('');
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md"
                      >Add</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(currentType.standardAdditions?.specialHolidayPay?.applyDates || []).map((d, i) => (
                        <div key={d + i} className="px-2 py-1 bg-gray-100 rounded text-xs flex items-center gap-2">
                          <span>{d}</span>
                          <button type="button" onClick={async () => {
                            const existing = currentType.standardAdditions?.specialHolidayPay?.applyDates || [];
                            const newDates = existing.slice();
                            if (i >= 0 && i < newDates.length) newDates.splice(i, 1);
                            if (isEditing && currentType.id) {
                              try {
                                await firebaseService.saveEmployeeTypeHolidayDates(currentType.id, 'specialHolidayPay', newDates);
                              } catch (e) { console.error('Failed to persist special holiday date removal', e); }
                            }
                            removeDateAt('standardAdditions.specialHolidayPay', i);
                          }} className="text-red-600">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bonus</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="0.00"
                        value={currentType.standardAdditions?.bonus?.value === 0 ? '' : currentType.standardAdditions?.bonus?.value}
                        onChange={e => {
                          const val = e.target.value;
                          handleNumericChange(
                            val,
                            'standardAdditions.bonus.value',
                            currentType,
                            isEditing ? setEditingType : setNewType
                          );
                        }}
                        onBlur={e => {
                          const val = e.target.value;
                          handleNumericBlur(
                            val,
                            'standardAdditions.bonus.value',
                            currentType,
                            isEditing ? setEditingType : setNewType
                          );
                        }}
                        className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                        {currentType.standardAdditions?.bonus?.isPercentage ? '%' : '₱'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const update = {
                          ...currentType,
                          standardAdditions: {
                            ...currentType.standardAdditions,
                            bonus: {
                              ...currentType.standardAdditions?.bonus,
                              isPercentage: !currentType.standardAdditions?.bonus?.isPercentage
                            }
                          }
                        };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      {currentType.standardAdditions?.bonus?.isPercentage ? 'Switch to Fixed' : 'Switch to %'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Optional: Can be fixed amount or percentage</p>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Apply Months (optional)</p>
                    <div className="flex flex-wrap gap-1">
                      {MONTHS.map((m, idx) => {
                        const monthNum = idx + 1;
                        const selected = (currentType.standardAdditions?.bonus?.applyMonths || []).includes(monthNum);
                        return (
                          <button
                            key={monthNum}
                            type="button"
                            onClick={() => toggleMonthAt('standardAdditions.bonus', monthNum)}
                            className={`px-2 py-1 text-xs rounded ${selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                          >{m}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Leave Conversion is managed in the Leave Information section above to avoid duplication */}
              </div>
            </div>

            {/* Standard Deductions Section */}
            <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 mb-6 border border-red-100 dark:border-red-800">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-4">Standard Deductions</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSS Contribution</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardDeductions?.sss?.defaultPercentage + '%'}
                      value={currentType.standardDeductions?.sss?.value === 0 ? '' : currentType.standardDeductions?.sss?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardDeductions.sss.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardDeductions.sss.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 4% of monthly salary (with cap)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PhilHealth Contribution</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardDeductions?.philHealth?.defaultPercentage + '%'}
                      value={currentType.standardDeductions?.philHealth?.value === 0 ? '' : currentType.standardDeductions?.philHealth?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardDeductions.philHealth.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardDeductions.philHealth.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 1.75% (employee share)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pag-IBIG Contribution</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={currentType.standardDeductions?.pagIbig?.defaultPercentage + '%'}
                      value={currentType.standardDeductions?.pagIbig?.value === 0 ? '' : currentType.standardDeductions?.pagIbig?.value}
                      onChange={e => {
                        const val = e.target.value;
                        handleNumericChange(
                          val,
                          'standardDeductions.pagIbig.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      onBlur={e => {
                        const val = e.target.value;
                        handleNumericBlur(
                          val,
                          'standardDeductions.pagIbig.value',
                          currentType,
                          isEditing ? setEditingType : setNewType
                        );
                      }}
                      className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Default: 2% (capped at ₱100)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Deduction</label>
                  <div className="relative">
                    <select
                      value={currentType.standardDeductions?.tax?.bracket || ''}
                      onChange={e => {
                        const bracketValue = e.target.value;
                        let taxInfo;
                        switch(bracketValue) {
                          case '0':
                            taxInfo = { bracket: '0', rate: 0, baseAmount: 0, excessOver: 0 };
                            break;
                          case '20':
                            taxInfo = { bracket: '20', rate: 20, baseAmount: 0, excessOver: 20833 };
                            break;
                          case '25':
                            taxInfo = { bracket: '25', rate: 25, baseAmount: 2500, excessOver: 33333 };
                            break;
                          case '30':
                            taxInfo = { bracket: '30', rate: 30, baseAmount: 10833, excessOver: 66667 };
                            break;
                          case '32':
                            taxInfo = { bracket: '32', rate: 32, baseAmount: 40833, excessOver: 166667 };
                            break;
                          case '35':
                            taxInfo = { bracket: '35', rate: 35, baseAmount: 200833, excessOver: 666667 };
                            break;
                          default:
                            taxInfo = { bracket: '', rate: 0, baseAmount: 0, excessOver: 0 };
                        }
                        
                        const update = {
                          ...currentType,
                          standardDeductions: {
                            ...currentType.standardDeductions,
                            tax: {
                              ...currentType.standardDeductions?.tax,
                              ...taxInfo,
                              isProgressive: true
                            }
                          }
                        };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="">Select Monthly Income Bracket</option>
                      <option value="0">0% (₱0 - ₱20,833)</option>
                      <option value="20">20% of excess over ₱20,833 (₱20,834 - ₱33,333)</option>
                      <option value="25">₱2,500 + 25% of excess over ₱33,333 (₱33,334 - ₱66,667)</option>
                      <option value="30">₱10,833 + 30% of excess over ₱66,667 (₱66,668 - ₱166,667)</option>
                      <option value="32">₱40,833 + 32% of excess over ₱166,667 (₱166,668 - ₱666,667)</option>
                      <option value="35">₱200,833 + 35% of excess over ₱666,667 (₱666,668+)</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Progressive rate based on annual income</p>
                </div>
              </div>
            </div>

            {/* Custom Fields Section */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6 border border-gray-100 dark:border-gray-600">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200">Custom Fields</h4>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => handleAddCustomField(currentType)}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Custom Field
                </motion.button>
              </div>

              <div className="space-y-4">
                {Object.entries(currentType.customFields || {}).map(([field, fieldData]) => (
                  <div key={field} className={`flex gap-4 items-center ${
                    fieldData.type === 'addition' ? 'bg-green-50/50' : 'bg-red-50/50'
                  } p-4 rounded-lg`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="block text-sm font-medium text-gray-700">{field}</label>
                        <span className={`text-xs px-2 py-1 rounded ${
                          fieldData.type === 'addition' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {fieldData.type === 'addition' ? 'Addition' : 'Deduction'}
                        </span>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 mb-1">Apply Months (optional)</p>
                        <div className="flex flex-wrap gap-1">
                          {MONTHS.map((m, idx) => {
                            const monthNum = idx + 1;
                            const selected = (fieldData.applyMonths || []).includes(monthNum);
                            return (
                              <button
                                key={monthNum}
                                type="button"
                                onClick={() => toggleMonthAt(`customFields.${field}`, monthNum)}
                                className={`px-2 py-1 text-xs rounded ${selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                              >{m}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="0.00"
                            value={fieldData.value === 0 ? '' : fieldData.value}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                const update = {
                                  ...currentType,
                                  customFields: {
                                    ...currentType.customFields,
                                    [field]: {
                                      ...fieldData,
                                      value: val.endsWith('.') ? val : val === '' ? 0 : val
                                    }
                                  }
                                };
                                isEditing ? setEditingType(update) : setNewType(update);
                              }
                            }}
                            onBlur={e => {
                              const val = e.target.value;
                              let finalValue;
                              if (val === '' || val === '.') {
                                finalValue = 0;
                              } else {
                                const cleanVal = val.endsWith('.') ? val.slice(0, -1) : val;
                                finalValue = parseFloat(cleanVal);
                              }
                              const update = {
                                ...currentType,
                                customFields: {
                                  ...currentType.customFields,
                                  [field]: {
                                    ...fieldData,
                                    value: finalValue
                                  }
                                }
                              };
                              isEditing ? setEditingType(update) : setNewType(update);
                            }}
                            className={`w-full px-3 pr-8 py-2 border rounded-md focus:outline-none focus:ring-1 ${
                              fieldData.type === 'addition'
                                ? 'border-green-300 focus:ring-green-500'
                                : 'border-red-300 focus:ring-red-500'
                            }`}
                          />
                          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                            {fieldData.isPercentage ? '%' : '₱'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const update = {
                              ...currentType,
                              customFields: {
                                ...currentType.customFields,
                                [field]: {
                                  ...fieldData,
                                  isPercentage: !fieldData.isPercentage
                                }
                              }
                            };
                            isEditing ? setEditingType(update) : setNewType(update);
                          }}
                          className="px-3 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          {fieldData.isPercentage ? 'Switch to Fixed' : 'Switch to %'}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const { [field]: removed, ...rest } = currentType.customFields;
                        const update = { ...currentType, customFields: rest };
                        isEditing ? setEditingType(update) : setNewType(update);
                      }}
                      className="self-end px-3 py-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 border border-transparent rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-sm"
              >
                {isEditing ? 'Save Changes' : 'Add Employee Type'}
              </motion.button>
            </div>
          </form>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Employee Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employeeTypes.map((type, index) => (
          <motion.div 
            key={type.id} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-200"
          >
            <div className="flex flex-col h-full">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{type.name}</h3>
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm rounded-full capitalize">
                    {type.salaryType}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <p>Base Rate: ₱{type.rate.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <p>Overtime Rate: {type.overtimeRate?.value || type.overtimeRate?.defaultPercentage || 125}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <p>Max OT Hours/Day: {type.maxOvertimeHours || 2} hrs</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <p>Late Deduction: ₱{type.lateDeduction.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400 dark:text-blue-500" />
                    <p>Leave Credits: {type.leaveInformation?.credits || 0} days ({type.leaveInformation?.conversionRate?.value || type.leaveInformation?.conversionRate?.defaultPercentage}% conversion)</p>
                  </div>
                  {type.standardDeductions?.tax?.bracket && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 dark:text-red-500" />
                      <p>Tax Bracket: {
                        type.standardDeductions.tax.rate === 0
                          ? '0%'
                          : `${type.standardDeductions.tax.baseAmount > 0 ? '₱' + type.standardDeductions.tax.baseAmount.toLocaleString() + ' + ' : ''}${type.standardDeductions.tax.rate}% over ₱${type.standardDeductions.tax.excessOver.toLocaleString()}`
                      }</p>
                    </div>
                  )}
                </div>
                {Object.keys(type.customFields || {}).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Custom Fields</p>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                      {Object.entries(type.customFields).map(([field, value]) => (
                        <div key={field} className="flex items-center gap-2">
                          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <p>
                            <span className="font-medium">{field}:</span> ₱{
                              typeof value === 'object' && value.value !== undefined 
                                ? value.value.toLocaleString() 
                                : (typeof value === 'number' ? value.toLocaleString() : '0')
                            }
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-auto pt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setEditingType(type);
                    setShowAddForm(true);
                  }}
                  className="approve-button flex-1 px-3 py-1.5 border-2 rounded-md text-sm font-medium transition-all"
                >
                  Edit
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleDelete(type.id)}
                  className="reject-button px-3 py-1.5 border-2 rounded-md text-sm font-medium transition-all"
                >
                  Delete
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}