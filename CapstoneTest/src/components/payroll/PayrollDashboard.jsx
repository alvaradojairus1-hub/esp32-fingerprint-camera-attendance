import React, { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { calculatePayrollDateRange, appliesToPeriod } from '../../utils/periodUtils';
import useAuth from '../../contexts/authcontext';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';
import { firebaseService } from '../../services/firebaseService';
import { calculatePayrollFromFirebase, savePayrollRecord } from '../../services/payrollService';
import { payslipService } from '../../services/payslipService';
import { motion } from 'framer-motion';
import {
  Calculator,
  FileText,
  Download,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Info,
  Filter,
  User,
  Eye,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { normalizeAttendanceForUI, pairAttendanceRecords } from '../../utils/attendanceUtils';
import { computeHourlyEarnings } from '../../services/hourlyCalculator';

const PayrollDashboard = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [facultyProfiles, setFacultyProfiles] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedEmployeeType, setSelectedEmployeeType] = useState(null);
  const [calculationPreview, setCalculationPreview] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [payrollConfigExpanded, setPayrollConfigExpanded] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [recurrenceDays, setRecurrenceDays] = useState([]);
  const [payrollDay, setPayrollDay] = useState('monday');
  const [payrollConfig, setPayrollConfig] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [computeAllRunning, setComputeAllRunning] = useState(false);
  const [computeAllProgress, setComputeAllProgress] = useState({ processed: 0, total: 0 });
  const computeAllCancelRef = useRef(false);
  const [savingAllRunning, setSavingAllRunning] = useState(false);
  const [savingAllProgress, setSavingAllProgress] = useState({ processed: 0, total: 0, succeeded: 0, failed: 0 });
  const saveAllCancelRef = useRef(false);

  // Derived display values for rates/units (kept here so JSX stays compact)
  const displayHourlyRateNumber = (() => {
    try {
      const hourly = calculationPreview?.breakdown?.hourly;
      const empRate = calculationPreview?.employeeInfo?.rate;
      // If we have baseEarnings and totalHours from breakdown, derive an hourly rate
      if (hourly && hourly.baseEarnings !== undefined && hourly.totalHours) {
        const be = Number(hourly.baseEarnings || 0);
        const th = Number(hourly.totalHours || 0) || 1;
        return Math.round((be / th) * 100) / 100;
      }
      if (empRate !== undefined && empRate !== null) return Number(empRate || 0);
      // fallback: try selectedEmployeeType rate
      if (selectedEmployeeType && selectedEmployeeType.rate !== undefined) return Number(selectedEmployeeType.rate || 0);
      return 0;
    } catch (e) { return 0; }
  })();

  // Use useMemo to ensure display values update when employee or calculation changes
  const { displayHourlyUnit, displayRateLabel } = React.useMemo(() => {
    const salaryType = String(calculationPreview?.employeeInfo?.salaryType || selectedEmployeeType?.salaryType || '').toLowerCase();
    const isHourly = salaryType === 'hourly';
    return {
      displayHourlyUnit: isHourly ? '/hr' : '/mo',
      displayRateLabel: isHourly ? 'Hourly Rate' : 'Monthly Rate'
    };
  }, [calculationPreview?.employeeInfo?.salaryType, selectedEmployeeType?.salaryType]);

  const displayBaseSalaryNumber = (() => {
    try {
      return Number(calculationPreview?.breakdown?.baseSalary ?? calculationPreview?.breakdown?.hourly?.baseEarnings ?? 0);
    } catch (e) { return 0; }
  })();

  // If payroll service indicates zero attendance or base is zero, show zeros everywhere
  const isZeroBase = (() => {
    try {
      const baseNum = Number(displayBaseSalaryNumber || calculationPreview?.breakdown?.baseSalary || calculationPreview?.grossSalary || 0);
      return baseNum <= 0 || calculationPreview?.zeroAttendance === true;
    } catch (e) { return true; }
  })();

  const displayAmount = (val) => {
    try {
      if (isZeroBase) return 0;
      return Number(val || 0);
    } catch (e) { return 0; }
  };

  // Helper to compute display value for an addition key using the same heuristics as payrollService
  const computeAdditionDisplay = (key, val) => {
    try {
      // If payroll service returned a zero-attendance result or the canonical base is zero,
      // do not compute heuristic additions — show 0 for all additions when base pay is zero.
      if (calculationPreview?.zeroAttendance === true) return 0;
      // isZeroBase is a boolean (computed above). If true, force additions to 0.
      if (isZeroBase === true) return 0;

      const keyLower = String(key || '').toLowerCase();

      // If the calculation preview already includes a numeric amount for this addition,
      // trust it as authoritative and return it directly. This prevents the UI from
      // reinterpreting a server-provided peso amount as a percent.
      const existingAdd = calculationPreview?.additions && calculationPreview.additions[key];
      if (existingAdd !== undefined && existingAdd !== null && typeof existingAdd === 'number') {
        return existingAdd;
      }

      const rawVal = (val === undefined || val === null) ? (Number(existingAdd || 0)) : Number(val || 0);

      // sensible base to compute percentage-based additions (mirror logic used elsewhere)
      let baseForAdditions = Number(calculationPreview.grossSalary || calculationPreview.breakdown?.baseSalary || displayBaseSalaryNumber || 0);
      try {
        const salaryType = (selectedEmployeeType?.salaryType || calculationPreview?.employeeInfo?.salaryType || '').toLowerCase();
        const rate = Number(selectedEmployeeType?.rate || calculationPreview?.employeeInfo?.rate || 0);
        const expectedDailyHours = Number(selectedEmployeeType?.expectedDailyHours || calculationPreview?.employeeInfo?.salaryInfo?.expectedDailyHours || 8);

        if (salaryType === 'monthly') {
          baseForAdditions = Number(selectedEmployeeType?.rate || rate || baseForAdditions || 0);
        } else if (salaryType === 'daily') {
          baseForAdditions = Number(selectedEmployeeType?.rate || rate || baseForAdditions || 0);
        } else if (salaryType === 'hourly') {
          const hourlyBaseEarnings = Number(calculationPreview.breakdown?.hourly?.baseEarnings || 0);
          if (hourlyBaseEarnings > 0) baseForAdditions = hourlyBaseEarnings;
          else baseForAdditions = Number(rate * expectedDailyHours || baseForAdditions || 0);
        } else {
          baseForAdditions = Number(rate || baseForAdditions || 0);
        }
      } catch (e) { baseForAdditions = Number(baseForAdditions || 0); }

      // Look up employeeType config for this addition key
      const cfg = selectedEmployeeType?.standardAdditions ? (selectedEmployeeType.standardAdditions[key] ?? selectedEmployeeType.standardAdditions[key.charAt(0).toLowerCase() + key.slice(1)] ?? selectedEmployeeType.standardAdditions[keyLower]) : undefined;

      // Special handling for 13th month
      if (/thirteenth|13th/.test(keyLower)) {
        if (cfg && typeof cfg === 'object') {
          const value = cfg.value !== undefined ? Number(cfg.value) : (typeof cfg === 'number' ? Number(cfg) : rawVal);
          const isPerc = cfg.isPercentage === true || cfg.isPercentage === 'true' || (value > 0 && value <= 100);
          if (isPerc && baseForAdditions > 0) return Math.round((baseForAdditions * (value / 100)) * 100) / 100;
          return Number(value) || 0;
        }
        // if primitive or no cfg, treat small rawVal as percent when base available
        if (rawVal > 0 && rawVal <= 100 && baseForAdditions > 0) return Math.round((baseForAdditions * (rawVal / 100)) * 100) / 100;
        // fallback default
        if ((!rawVal || rawVal === 0) && baseForAdditions > 0) return Math.round((baseForAdditions * 8.33 / 100) * 100) / 100;
        return rawVal;
      }

      // Generic handling: if cfg is object
      if (cfg && typeof cfg === 'object') {
        if (cfg.applyMonths || cfg.period || cfg.applyRange || cfg.applyDates) {
          if (!appliesToPeriod(format(new Date(selectedPeriod.start), 'yyyy-MM'), cfg)) return 0;
        }
        if (cfg.isPercentage) return Math.round((baseForAdditions * (Number(cfg.value || 0) / 100)) * 100) / 100;
        if (cfg.value !== undefined) {
          const assumePercent = (cfg.isPercentage === undefined) && /holiday|special|thirteenth|night|differential|nd|overtime|ot|percent|rate/i.test(key);
          if (assumePercent && baseForAdditions > 0) return Math.round((baseForAdditions * (Number(cfg.value || 0) / 100)) * 100) / 100;
          return Number(cfg.value || 0);
        }
      }

      // primitive number handling - treat <=100 as percent if base available
      if (!isNaN(rawVal)) {
        if (rawVal > 0 && rawVal <= 100 && baseForAdditions > 0) return Math.round((baseForAdditions * (rawVal / 100)) * 100) / 100;
        return rawVal || 0;
      }

      return 0;
    } catch (e) { return 0; }
  };

  // Precompute night differential display value for use in subtotal and rendering
  const nightDifferentialDisplay = computeAdditionDisplay('nightDifferential', calculationPreview?.additions && (calculationPreview.additions.nightDifferential || calculationPreview.additions.nightdifferential || calculationPreview.additions['nightDifferential']) );

  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalGrossPay: 0,
    totalNetPay: 0,
    totalDeductions: 0,
    processedCount: 0,
    pendingCount: 0
  });

  const { user } = useAuth();
  const { companyBranding, themeColors } = useSystemSettings();

  // Debug: log the preview state to understand what the UI receives
  useEffect(() => {
    if (calculationPreview) {
      console.debug('DEBUG: PayrollDashboard calculationPreview.additions:', calculationPreview.additions);
      console.debug('DEBUG: Full calculationPreview:', calculationPreview);
    }
  }, [calculationPreview]);

  // Load payroll config on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await firebaseService.getPayrollConfig();
        if (mounted && cfg) {
          setFrequency(cfg.frequency || 'monthly');
          setPayrollDay(cfg.week || 'monday');
          if (cfg.recurrence && Array.isArray(cfg.recurrence.days)) setRecurrenceDays(cfg.recurrence.days.slice(0, 2));
          setPayrollConfig(cfg); // Store full config for use in calculations
        }
      } catch (e) {
        console.error('Failed to load payroll config', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Track mounted state so async callbacks don't set state after unmount
  const isMountedRef = useRef(true);

  // Cancelable compute-all ref (used by Compute All action)

  // Exposed loader so other handlers (save, refresh) can reload payroll list.
  const loadPayroll = async () => {
    setLoading(true);
    try {
      const payroll = await firebaseService.getPayroll();
      if (!isMountedRef.current) return;

      // payroll may return array of payroll periods or employee entries; normalize a bit
      setPayrollData(Array.isArray(payroll) ? payroll : []);

      // Try to build facultyProfiles from payroll when possible
      // For display, prefer active employee accounts (exclude HR)
      // ensure `employees` is defined in this scope for stats computation
      let employees = [];
      try {
        const employeesList = await firebaseService.getEmployees();
        employees = Array.isArray(employeesList) ? employeesList : [];
        if (!isMountedRef.current) return;
        setFacultyProfiles(employees);
      } catch (err) {
        employees = payroll && payroll.length > 0 && payroll[0].employees ? Object.values(payroll[0].employees) : [];
        if (!isMountedRef.current) return;
        setFacultyProfiles(employees);
      }

      // compute aggregated totals resilient to different saved field names
      const sumEmployeeField = (list, keys) => {
        return list.reduce((sum, item) => {
          if (!item) return sum;
          for (const k of keys) {
            const v = item[k];
            if (v !== undefined && v !== null) {
              const n = Number(v) || 0;
              return sum + n;
            }
          }
          return sum;
        }, 0);
      };

      const totalEmployees = employees.length || (stats && stats.totalEmployees) || 0;
      const totalGrossPay = sumEmployeeField(employees, ['gross', 'grossSalary', 'calculatedGross', 'calculated_gross', 'payableGross']) || (stats && stats.totalGrossPay) || 0;
      const totalNetPay = sumEmployeeField(employees, ['net', 'netSalary', 'calculatedNet', 'calculated_net', 'payableNet']) || (stats && stats.totalNetPay) || 0;
      const totalDeductions = sumEmployeeField(employees, ['deductions', 'totalDeductions', 'total_deductions']) || (stats && stats.totalDeductions) || 0;

      setStats(prev => ({
        ...prev,
        totalEmployees,
        totalGrossPay,
        totalNetPay,
        totalDeductions
      }));
    } catch (err) {
      console.error('Failed to load payroll', err);
      alert('Failed to load payroll data.');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleComputeAll = async () => {
    if (computeAllRunning) return;
    setComputeAllRunning(true);
    computeAllCancelRef.current = false;
    try {
      // ensure we have a list of employees to compute for
      let employees = Array.isArray(facultyProfiles) && facultyProfiles.length ? facultyProfiles : [];
      if (!employees || employees.length === 0) {
        try {
          const list = await firebaseService.getEmployees();
          employees = Array.isArray(list) ? list : [];
        } catch (e) {
          console.error('Compute All: failed to load employees', e);
          employees = [];
        }
      }

      setComputeAllProgress({ processed: 0, total: employees.length });
      let totalGross = 0;
      let totalNet = 0;
      let processed = 0;

      for (let i = 0; i < employees.length; i++) {
        if (!isMountedRef.current) break;
        if (computeAllCancelRef.current) break;
        const emp = employees[i];
        try {
          const computed = await calculatePayrollFromFirebase(emp.id, selectedPeriod, null, payrollConfig);
          // Prefer canonical computed fields, fallbacks if needed
          let gross = (computed && (computed.grossSalary ?? computed.gross ?? computed.calculatedGross)) || 0;
          let net = (computed && (computed.netSalary ?? computed.net ?? computed.calculatedNet)) || 0;

          // If gross still zero for hourly employees, try client-side fallback
          const salaryType = String(emp?.salaryType || emp?.employeeType || '').toLowerCase();
          if ((!gross || Number(gross) === 0) && salaryType === 'hourly') {
            try {
              const fallback = await computeHourlyEarnings(emp.id, selectedPeriod.start, selectedPeriod.end);
              gross = gross || fallback?.gross || fallback?.total || 0;
              net = net || fallback?.net || 0;
            } catch (e) {
              console.warn('Compute All: hourly fallback failed for', emp.id, e);
            }
          }

          totalGross += Number(gross) || 0;
          totalNet += Number(net) || 0;
        } catch (e) {
          console.error('Compute All: calculation failed for', emp.id, e);
        }
        processed++;
        setComputeAllProgress({ processed, total: employees.length });
      }

      // If not cancelled, update visible stats with computed totals
      if (!computeAllCancelRef.current) {
        setStats(prev => ({ ...prev, totalGrossPay: totalGross, totalNetPay: totalNet, processedCount: processed }));
      }
    } finally {
      setComputeAllRunning(false);
      computeAllCancelRef.current = false;
    }
  };

  const cancelComputeAll = () => {
    computeAllCancelRef.current = true;
    setComputeAllRunning(false);
  };

  const handleSaveAllPayrolls = async () => {
    if (savingAllRunning) return;
    if (!window.confirm('This will compute and save payroll for ALL employees for the selected period. Proceed?')) return;
    setSavingAllRunning(true);
    saveAllCancelRef.current = false;
    try {
      // ensure employees list
      let employees = Array.isArray(facultyProfiles) && facultyProfiles.length ? facultyProfiles : [];
      if (!employees || employees.length === 0) {
        try {
          const list = await firebaseService.getEmployees();
          employees = Array.isArray(list) ? list : [];
        } catch (e) {
          console.error('Save All: failed to load employees', e);
          employees = [];
        }
      }

      const total = employees.length;
      setSavingAllProgress({ processed: 0, total, succeeded: 0, failed: 0 });

      let processed = 0, succeeded = 0, failed = 0;
      const period = format(new Date(selectedPeriod.start), 'yyyy-MM');

      for (let i = 0; i < employees.length; i++) {
        if (!isMountedRef.current) break;
        if (saveAllCancelRef.current) break;
        const emp = employees[i];
        try {
          
          // determine employeeTypeCfg for accurate mapping
          let employeeTypeCfg = null;
          try {
            const types = await firebaseService.getEmployeeTypes();
            employeeTypeCfg = Array.isArray(types) ? types.find(t => String(t.id) === String(emp.employeeType) || String(t.id) === String(emp.employeeType)) : null;
          } catch (e) {
            employeeTypeCfg = null;
          }
          // Build the same preview shape the UI uses (without mutating UI state)
          const preview = await calculatePreview(emp.id, employeeTypeCfg, { returnOnly: true });
          // ensure preview carries the employee's position so payslips show it
          const safePreview = preview || {};
          safePreview.employeeInfo = safePreview.employeeInfo || {};
          safePreview.employeeInfo.position = emp.position || safePreview.employeeInfo.position || safePreview.employeeInfo.type || '';
          const payload = {
            preview: safePreview,
            // also include a simple facultyProfile snapshot for payslip rendering convenience
            facultyProfile: {
              name: emp.name || safePreview.employeeInfo?.name || '',
              employeeId: emp.facultyId || emp.id || '',
              position: safePreview.employeeInfo.position || '',
              department: emp.department || ''
            },
            forceSavePreview: true,
            periodStart: selectedPeriod.start,
            periodEnd: selectedPeriod.end,
            status: 'pending'
          };
          await savePayrollRecord(emp.id, period, payload);
          succeeded++;
        } catch (e) {
          console.error('Save All: failed for', emp.id, e);
          failed++;
        }
        processed++;
        setSavingAllProgress({ processed, total, succeeded, failed });
      }

      // refresh payroll listing so header totals pick up persisted values
      await loadPayroll();

      alert(`Save All complete. succeeded: ${succeeded}, failed: ${failed}`);
    } finally {
      setSavingAllRunning(false);
      saveAllCancelRef.current = false;
    }
  };

  const cancelSaveAll = () => {
    saveAllCancelRef.current = true;
    setSavingAllRunning(false);
  };

  const handleSavePayrollConfig = async () => {
    setSavingConfig(true);
    try {
      const payload = { frequency: frequency, updatedAt: new Date().toISOString() };
      if (frequency === 'weekly') {
        payload.week = payrollDay || null;
      } else {
        const days = Array.isArray(recurrenceDays) ? recurrenceDays.map(d => Number(d)).filter(Boolean) : [];
        if (frequency === 'monthly' && days.length !== 1) {
          alert('Please provide a single day for monthly payroll');
          setSavingConfig(false);
          return;
        }
        if (frequency === 'semimonthly' && days.length !== 2) {
          alert('Please provide two different days for semimonthly payroll');
          setSavingConfig(false);
          return;
        }
        payload.recurrence = { type: frequency === 'monthly' ? 'monthly' : 'semimonthly', days };
      }
      await firebaseService.savePayrollConfig(payload);
      alert('Payroll schedule saved');
    } catch (e) {
      console.error('Failed to save payroll config', e);
      alert('Failed to save payroll schedule');
    } finally {
      setSavingConfig(false);
    }
  };

  // Helper to format labels consistently across the dashboard
  const formatLabel = (k) => {
    if (!k) return '';
    const map = {
      thirteenthMonth: '13th Month',
      nightDifferential: 'Night Differential',
      holidayPay: 'Regular Holiday Pay',
      specialHolidayPay: 'Special Holiday Pay',
      serviceCredits: 'Service Credits',
      bonus: 'Bonus',
      leaveConversion: 'Leave Conversion'
    };
    if (map[k]) return map[k];
    // split camelCase or snake_case and title case
    const split = k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim();
    return split.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  // Mock data for demonstration
  useEffect(() => {
    isMountedRef.current = true;
    loadPayroll();
    return () => { isMountedRef.current = false; };
  }, []);

  const handlePeriodChange = (monthsBack) => {
    const newDate = subMonths(new Date(), monthsBack);
    setSelectedPeriod({
      start: format(startOfMonth(newDate), 'yyyy-MM-dd'),
      end: format(endOfMonth(newDate), 'yyyy-MM-dd')
    });
  };

  const handleEmployeeSelect = async (employeeId) => {
    setSelectedEmployee(employeeId);
    setSelectedEmployeeType(null);
    setCalculationPreview(null);
    
    if (employeeId) {
      const employee = facultyProfiles.find(f => f.id === employeeId);
      console.log("Selected employee:", employee); // Debug log
      
      if (employee?.employeeType) {
        try {
          // Use firebaseService helper to fetch employee types and find the selected type
          const types = await firebaseService.getEmployeeTypes();
          const employeeTypeData = Array.isArray(types) ? types.find(t => String(t.id) === String(employee.employeeType) || String(t.id) === String(employee.employeeType)) : null;
          console.log("=== DEBUG: Employee Type Data ===");
          console.log("Employee:", employee);
          console.log("EmployeeType fetched:", employeeTypeData);
          console.log("===============================");
          if (employeeTypeData) {
            setSelectedEmployeeType(employeeTypeData);
            await calculatePreview(employeeId, employeeTypeData);
          }
        } catch (error) {
          console.error('Failed to fetch employee type:', error);
        }
      } else {
        console.error('No employee type found for employee:', employeeId);
      }
    }
  };

  const calculatePreview = async (employeeId, employeeTypeCfg, options = {}) => {
    setCalculating(true);
    try {
      const period = format(new Date(selectedPeriod.start), 'yyyy-MM');
      console.log('calculatePreview called with:', { employeeId, period, employeeTypeCfgName: employeeTypeCfg?.name, payrollConfigAvailable: !!payrollConfig, payrollConfig });

      // Use the centralized payroll calculation which already respects
      // employeeType shapes, applyMonths/period/applyDates and percentage heuristics.
      const computed = await calculatePayrollFromFirebase(employeeId, period, null, payrollConfig);

      console.log('calculatePayrollFromFirebase returned:', {
        grossSalary: computed.grossSalary,
        baseEarnings: computed.breakdown?.baseEarnings,
        additions: Object.entries(computed.additions || {}).map(([k, v]) => `${k}: ${v}`),
        additionsBreakdown: Object.keys(computed.additionsBreakdown || {}),
        deductions: computed.deductions,
        deductionsKeys: Object.keys(computed.deductions || {})
      });

      console.error('🟠🟠🟠 COMPLETE MONTHLY BREAKDOWN 🟠🟠🟠', JSON.stringify(computed, null, 2));
      console.error('🟠 grossSalary:', computed.grossSalary);
      console.error('🟠 breakdown:', computed.breakdown);
      console.error('🟠 breakdown.overtimeEarnings:', computed.breakdown?.overtimeEarnings);
      console.error('🟠 additions:', computed.additions);
      console.error('🟠 additions.leaveConversion:', computed.additions?.leaveConversion);

      // If the employee is hourly and the canonical computed result lacks hourly breakdown
      // (or baseEarnings is zero), attempt a frontend fallback: compute base and overtime
      // from saved attendance so the dashboard shows attendance-derived base pay immediately.
      try {
        const salaryType = (employeeTypeCfg?.salaryType || '').toString().toLowerCase();
        const hasHourlyBreakdown = computed.breakdown && computed.breakdown.hourly && Number(computed.breakdown.hourly.baseEarnings || 0) > 0;
        console.error('🔵 FALLBACK CHECK:', { salaryType, hasHourlyBreakdown, 'computed.breakdown.hourly': computed.breakdown?.hourly });
        if (salaryType === 'hourly' && !hasHourlyBreakdown) {
          console.error('🔵 RUNNING FALLBACK - fetching attendance for employeeId:', employeeId, 'period:', period);
          try {
            const allAttendance = await firebaseService.getAttendance();
            console.error('🔵 Got attendance records:', allAttendance.length);
            
            // Calculate payroll date range based on payroll config
            const dateRange = calculatePayrollDateRange(payrollConfig, new Date());
            console.error('🔵 Payroll date range:', { start: dateRange.startDateStr, end: dateRange.endDateStr });
            
            // normalize and filter attendance for this user and payroll period
            const normalized = (allAttendance || []).map(normalizeAttendanceForUI).filter(r => {
              const uid = String(r.userId || r.facultyId || r.id || '');
              if (!uid) return false;
              if (String(uid) !== String(employeeId)) {
                return false;
              }
              // Filter by payroll date range instead of just YYYY-MM
              try {
                const d = new Date(r.rawTimestamp || r.timestamp || r.date || null);
                if (isNaN(d.getTime())) return false;
                return d >= dateRange.startDate && d <= dateRange.endDate;
              } catch (e) { return false; }
            });
            console.error('🔵 Filtered attendance (normalized):', normalized.length, normalized.slice(0, 2).map(r => ({ userId: r.userId, date: r.date, checkIn: r.checkIn, checkOut: r.checkOut, type: r.type, timestamp: r.timestamp })));

            // Pair attendance records - ONLY include pairs with both check-in AND check-out
            const paired = pairAttendanceRecords(normalized || []).filter(p => {
              // Only count records with BOTH check-in and check-out times
              const hasCheckIn = p.checkIn && (p.checkIn.trim() !== '');
              const hasCheckOut = p.checkOut && (p.checkOut.trim() !== '');
              return hasCheckIn && hasCheckOut;
            });
            console.error('🔵 Paired records (with complete check-in/out):', paired.length, paired.slice(0, 2));
            
            const baseRate = Number(employeeTypeCfg?.rate || computed.breakdown?.salaryRate || 0);
            const overtimeRate = Number(employeeTypeCfg?.overtimeRate || (baseRate * 1.25) || 0);
            const lateDeduction = Number(employeeTypeCfg?.lateDeduction || 0);
            const expectedDailyHours = Number(employeeTypeCfg?.expectedDailyHours || 8);
            const maxOvertimeHours = Number(employeeTypeCfg?.maxOvertimeHours || 2);
            console.error('🔵 Rates:', { baseRate, overtimeRate, lateDeduction, expectedDailyHours, maxOvertimeHours });
            const hourlyResult = computeHourlyEarnings(paired, {
              baseRate,
              overtimeRate: Math.max(0, overtimeRate) || (baseRate * 1.25),
              lateDeduction,
              expectedDailyHours,
              maxOvertimeHours
            });
            console.error('🔵 Hourly result:', hourlyResult);
            console.error('🔵 Base Pay Calculation: totalHours:', hourlyResult.totalHours, '× baseRate:', baseRate, '= baseEarnings:', hourlyResult.baseEarnings);
            console.error('🔵 Paired details (first 3):', paired.slice(0, 3).map(p => ({ date: p.date, checkIn: p.checkIn, checkOut: p.checkOut, hours: p.hours, status: p.status })));

            // Merge fallback hourly result into computed for display purposes
            computed.breakdown = computed.breakdown || {};
            computed.breakdown.hourly = {
              totalHours: hourlyResult.totalHours,
              overtimeHours: hourlyResult.totalOvertime,
              baseEarnings: hourlyResult.baseEarnings,
              overtimeEarnings: hourlyResult.overtimeEarnings,
              lateDeductions: hourlyResult.totalLateDeductions
            };
            // update gross to reflect attendance-derived gross
            computed.grossSalary = Math.max(0, Number(hourlyResult.computedGross || computed.grossSalary || 0));
            console.error('🔵 FALLBACK COMPLETE - new computed:', { grossSalary: computed.grossSalary, 'breakdown.hourly': computed.breakdown.hourly });
          } catch (e) {
            console.error('🔴 Failed to compute fallback hourly from attendance:', e);
          }
        } else {
          console.error('🔵 FALLBACK SKIPPED - salaryType:', salaryType, 'hasHourlyBreakdown:', hasHourlyBreakdown);
        }
      } catch (e) {
        console.error('🔴 Error checking hourly fallback conditions:', e);
      }

      // Map the canonical computed result into the shape used by this component
      const employee = facultyProfiles.find(f => f.id === employeeId) || {};

      // Normalize deductions so the UI can reliably display common deduction fields
      const rawDeductions = (computed.deductions && typeof computed.deductions === 'object') ? computed.deductions : {};
      const breakdown = computed.breakdown || {};

      // Helper to extract numeric amounts from various possible shapes
      const getAmount = (v) => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const n = Number(v);
          return isNaN(n) ? 0 : n;
        }
        if (typeof v === 'object') {
          // common fields used in deductions objects
          if (v.total !== undefined) return Number(v.total) || 0;
          if (v.amount !== undefined) return Number(v.amount) || 0;
          if (v.value !== undefined) return Number(v.value) || 0;
          if (v.employee_share_amount !== undefined) return Number(v.employee_share_amount) || 0;
          if (v.employee_share !== undefined) return Number(v.employee_share) || 0;
          if (v.brackets !== undefined && Array.isArray(v.brackets)) return 0; // brackets are not a single amount
          // try to coerce fallback
          const coerced = Number(JSON.stringify(v));
          return isNaN(coerced) ? 0 : coerced;
        }
        return 0;
      };

      const sss = getAmount(rawDeductions.sss ?? rawDeductions.SSS ?? breakdown?.statutory?.sss ?? breakdown?.sss);
      const philhealth = getAmount(rawDeductions.philhealth ?? rawDeductions.PhilHealth ?? breakdown?.statutory?.philhealth ?? breakdown?.philhealth);
      const pagibig = getAmount(rawDeductions.pagibig ?? rawDeductions.PagIBIG ?? breakdown?.statutory?.pagibig ?? breakdown?.pagibig);

      // Prefer TRAIN/Withholding tax sources, fallback to dhvsu or generic tax fields
      const withholding = getAmount(rawDeductions.WithholdingTax ?? rawDeductions.withholdingtax ?? rawDeductions.tax ?? breakdown?.trainTax ?? breakdown?.traintax);
      const dhvsu = getAmount(rawDeductions.DHVSUTax ?? rawDeductions.dhvsutax ?? breakdown?.dhvsuTax);

      const total = getAmount(rawDeductions.total ?? breakdown?.totalDeductions);

      const normalizedDeductions = {
        // keep original keys so nothing is lost
        ...rawDeductions,
        // canonical fields used by the dashboard UI
        sss,
        philhealth,
        pagibig,
        // `tax` is a generic key the UI looks for — set to TRAIN/withholding when available, else DHVSU
        tax: withholding || dhvsu || 0,
        // preserve explicit dhvsu/withholding keys as well for completeness
        withholding: withholding,
        dhvsu: dhvsu,
        total
      };

      // Debug: log computed deductions and normalized result so we can verify keys/values
      console.debug('PayrollDashboard: computed.deductions ->', computed.deductions);
      console.debug('PayrollDashboard: normalizedDeductions ->', normalizedDeductions);

      // Deductions from payrollService already respect isPercentage and computed bases.
      // ONLY fall back to standardDeductions if the service did not compute any deductions at all
      // (this should be rare since payrollService computes them from employeeType rules)
      // For monthly employees with zero base pay, the payrollService INTENTIONALLY computed zeros,
      // so do NOT fallback to heuristic-based calculation
      const hasComputedDeductions = normalizedDeductions && (normalizedDeductions.sss > 0 || normalizedDeductions.philhealth > 0 || normalizedDeductions.pagibig > 0 || normalizedDeductions.tax > 0);
      const salaryType = (employeeTypeCfg?.salaryType || '').toString().toLowerCase();
      const isMonthlyEmployee = salaryType === 'monthly';
      const computedBase = Number(computed.grossSalary || computed.breakdown?.baseSalary || 0);
      const isZeroBasePay = computedBase === 0;
      const shouldSkipFallback = isMonthlyEmployee && isZeroBasePay; // For monthly with zero base, use service's zero deductions, don't fallback
      
      if (!hasComputedDeductions && !shouldSkipFallback && employeeTypeCfg && employeeTypeCfg.standardDeductions) {
        try {
          const std = employeeTypeCfg.standardDeductions || {};
          // sensible base to compute percentage-based deductions:
          // prefer computed gross, then computed breakdown baseSalary,
          // then employeeType.rate or employee salaryRate. If we still don't have a base
          // and employeeTypeCfg contains a salaryType, try to estimate a monthly base
          // using heuristics (daily->22 days, hourly->8*22 hours). This avoids treating
          // percentage values as peso amounts when computed gross is 0.
          let baseForDeductions = Number(computed.grossSalary || computed.breakdown?.baseSalary || employeeTypeCfg.rate || employee.salaryInfo?.salaryRate || employee.salaryRate || 0);
          console.error('🔴 DASHBOARD baseForDeductions initial:', baseForDeductions, 'computed.grossSalary:', computed.grossSalary, 'computed.breakdown?.baseSalary:', computed.breakdown?.baseSalary, 'employeeTypeCfg.rate:', employeeTypeCfg.rate);
          if (!baseForDeductions && employeeTypeCfg && employeeTypeCfg.rate) {
            const rate = Number(employeeTypeCfg.rate || 0);
            const salaryType = (employeeTypeCfg.salaryType || '').toLowerCase();
            const expectedDailyHours = Number(employee.salaryInfo?.expectedDailyHours || employeeTypeCfg.expectedDailyHours || 8);
            console.error('🔴 DASHBOARD heuristic - rate:', rate, 'salaryType:', salaryType, 'expectedDailyHours:', expectedDailyHours);
            switch (salaryType) {
              case 'monthly':
                baseForDeductions = rate;
                break;
              case 'daily':
                baseForDeductions = rate * 22; // assume 22 working days per month
                break;
              case 'hourly':
                // convert hourly rate to monthly by expectedDailyHours * 22 working days
                baseForDeductions = rate * expectedDailyHours * 22;
                console.error('🔴 DASHBOARD hourly heuristic:', baseForDeductions);
                break;
              default:
                baseForDeductions = rate;
            }
          }
          baseForDeductions = Number(baseForDeductions || 0);
          console.error('🔴 DASHBOARD final baseForDeductions:', baseForDeductions);

          const pickStd = (k) => {
            const lookupKeys = [k, k.charAt(0).toLowerCase() + k.slice(1), k.toLowerCase()];
            let v;
            for (const key of lookupKeys) {
              if (std[key] !== undefined) { v = std[key]; break; }
            }
            if (v == null) return 0;

            // If primitive number: treat as percentage when value <= 100 (common for deduction %s)
            if (typeof v === 'number') {
              if (v > 0 && v <= 100 && baseForDeductions > 0) return Math.round(((baseForDeductions * v) / 100) * 100) / 100;
              return Math.round(Number(v) * 100) / 100;
            }

            // If object, prefer explicit isPercentage/value flags
            if (typeof v === 'object') {
              const value = v.value !== undefined ? Number(v.value) : (v.amount !== undefined ? Number(v.amount) : undefined);
              const isPerc = v.isPercentage === true || v.isPercentage === 'true';
              if (value !== undefined) {
                if (isPerc && baseForDeductions > 0) return Math.round(((baseForDeductions * value) / 100) * 100) / 100;
                // heuristic: if value <=100 treat as percent
                if (value > 0 && value <= 100 && baseForDeductions > 0) return Math.round(((baseForDeductions * value) / 100) * 100) / 100;
                return Math.round(value * 100) / 100;
              }
              if (v.employee_share_amount !== undefined) return Math.round(Number(v.employee_share_amount || 0) * 100) / 100;
              if (v.employee_share !== undefined) return Math.round(Number(v.employee_share || 0) * 100) / 100;
            }

            // fallback: coerce to number
            const coerced = Number(v);
            return isNaN(coerced) ? 0 : Math.round(coerced * 100) / 100;
          };

          const fallbackSss = pickStd('sss');
          const fallbackPhil = pickStd('philHealth') || pickStd('philhealth');
          const fallbackPagibig = pickStd('pagIbig') || pickStd('pagibig');
          const fallbackTax = pickStd('tax') || pickStd('WithholdingTax') || pickStd('withholdingtax');

          // Merge fallbacks into normalizedDeductions (without removing original keys)
          normalizedDeductions.sss = Number(normalizedDeductions.sss || fallbackSss || 0);
          normalizedDeductions.philhealth = Number(normalizedDeductions.philhealth || fallbackPhil || 0);
          normalizedDeductions.pagibig = Number(normalizedDeductions.pagibig || fallbackPagibig || 0);
          normalizedDeductions.tax = Number(normalizedDeductions.tax || fallbackTax || 0);
          normalizedDeductions.total = Number(normalizedDeductions.total || ((normalizedDeductions.sss || 0) + (normalizedDeductions.philhealth || 0) + (normalizedDeductions.pagibig || 0) + (normalizedDeductions.tax || 0)));

          console.debug('PayrollDashboard: applied employeeType standardDeductions fallback ->', {
            fallbackSss, fallbackPhil, fallbackPagibig, fallbackTax, normalizedDeductions
          });
        } catch (e) {
          console.warn('Failed to apply employeeType.standardDeductions fallback', e);
        }
      }

      // Merge computed additions with employeeType.standardAdditions when available.
      // This ensures the dashboard shows expected addition entries (holiday pay, special holiday, 13th month, etc.)
      const computedAdditions = (computed.additions && typeof computed.additions === 'object') ? { ...computed.additions } : {};
      let finalAdditions = { ...computedAdditions };

      try {
        if (employeeTypeCfg && employeeTypeCfg.standardAdditions) {
          const stdAdd = employeeTypeCfg.standardAdditions || {};

          // sensible base to compute percentage-based additions (same heuristic as deductions)
          let baseForAdditions = Number(computed.grossSalary || computed.breakdown?.baseSalary || employeeTypeCfg.rate || employee.salaryInfo?.salaryRate || employee.salaryRate || 0);
          if (!baseForAdditions && employeeTypeCfg && employeeTypeCfg.rate) {
            const rate = Number(employeeTypeCfg.rate || 0);
            const salaryType = (employeeTypeCfg.salaryType || '').toLowerCase();
            const expectedDailyHours = Number(employee.salaryInfo?.expectedDailyHours || employeeTypeCfg.expectedDailyHours || 8);
            switch (salaryType) {
              case 'monthly':
                baseForAdditions = rate;
                break;
              case 'daily':
                baseForAdditions = rate * 22;
                break;
              case 'hourly':
                baseForAdditions = rate * expectedDailyHours * 22;
                break;
              default:
                baseForAdditions = rate;
            }
          }
          baseForAdditions = Number(baseForAdditions || 0);

          const pickAdd = (k) => {
            const lookupKeys = [k, k.charAt(0).toLowerCase() + k.slice(1), k.toLowerCase()];
            let v;
            for (const key of lookupKeys) {
              if (stdAdd[key] !== undefined) { v = stdAdd[key]; break; }
            }
            if (v == null) return 0;

            if (typeof v === 'number') {
              if (v > 0 && v <= 100 && baseForAdditions > 0) return Math.round(((baseForAdditions * v) / 100) * 100) / 100;
              return Math.round(Number(v) * 100) / 100;
            }

            if (typeof v === 'object') {
              const value = v.value !== undefined ? Number(v.value) : (v.amount !== undefined ? Number(v.amount) : undefined);
              const isPerc = v.isPercentage === true || v.isPercentage === 'true';
              if (value !== undefined) {
                if (isPerc && baseForAdditions > 0) return Math.round(((baseForAdditions * value) / 100) * 100) / 100;
                if (value > 0 && value <= 100 && baseForAdditions > 0) return Math.round(((baseForAdditions * value) / 100) * 100) / 100;
                return Math.round(value * 100) / 100;
              }
              if (v.employee_share_amount !== undefined) return Math.round(Number(v.employee_share_amount || 0) * 100) / 100;
              if (v.employee_share !== undefined) return Math.round(Number(v.employee_share || 0) * 100) / 100;
            }

            const coerced = Number(v);
            return isNaN(coerced) ? 0 : Math.round(coerced * 100) / 100;
          };

          for (const key of Object.keys(stdAdd)) {
            const existing = Number(finalAdditions[key] || 0);
            if (!existing || existing === 0) {
              finalAdditions[key] = pickAdd(key);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to apply employeeType.standardAdditions fallback', e);
      }

      // Calculate total earnings = base + overtime + additions (no allowances)
      const baseSalaryValue = computed.breakdown?.baseSalary || computed.breakdown?.hourly?.baseEarnings || computed.breakdown?.salaryRate || 0;
      const overtimeValue = computed.breakdown?.overtimeEarnings || computed.breakdown?.hourly?.overtimeEarnings || 0;
      const additionsTotalValue = computed.additions?.total || Object.entries(computed.additions || {}).filter(([k]) => k !== 'total').reduce((s, [, v]) => s + (Number(v) || 0), 0);
      const totalEarningsValue = baseSalaryValue + overtimeValue + additionsTotalValue;

      const preview = {
        grossSalary: computed.grossSalary,
        netSalary: computed.netSalary,
        totalEarnings: totalEarningsValue,
        employeeInfo: {
          name: employee.name || computed.employeeInfo?.name,
          type: computed.employeeInfo?.salaryInfo?.employeeType || (employeeTypeCfg?.name || selectedEmployeeType?.name) || computed.employeeInfo?.type,
          salaryType: computed.employeeInfo?.salaryInfo?.salaryType || (employeeTypeCfg?.salaryType || selectedEmployeeType?.salaryType) || computed.employeeInfo?.salaryType,
          rate: computed.employeeInfo?.salaryInfo?.rate || (employeeTypeCfg?.rate || selectedEmployeeType?.rate) || computed.employeeInfo?.rate
        },
        breakdown: {
          baseSalary: baseSalaryValue,
          overtimeEarnings: overtimeValue,
          serviceCredits: computed.breakdown?.serviceCredits || 0,
          totalAdditions: additionsTotalValue,
          totalDeductions: normalizedDeductions.total || 0,
          netSalary: computed.netSalary,
          totalEarnings: totalEarningsValue,
          computationDetails: computed.breakdown || {}
        },
        additions: { ...(finalAdditions || {}), ...(computed.additions || {}) },
        allowances: computed.allowances || {},
        deductions: normalizedDeductions,
        leaveInformation: computed.leaveInformation || null,
        customFields: computed.customFields || {},
        additionsBreakdown: computed.additionsBreakdown || {}
      };
      if (!options.returnOnly) setCalculationPreview(preview);
      return preview;
    } catch (error) {
      console.error('Calculation preview failed:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        employeeId,
        period: selectedPeriod
      });
      
      // Provide more specific error message to user
      let userMessage = 'Failed to calculate preview.';
      if (error?.message?.includes('not found')) {
        userMessage = `Employee data not found. Please ensure the employee is properly configured in the system.`;
      } else if (error?.message?.includes('employee type')) {
        userMessage = `Employee type configuration is missing. Please assign an employee type to this employee.`;
      } else if (error?.message) {
        userMessage = `Calculation error: ${error.message}`;
      }
      
      alert(`${userMessage} Please try again or contact support.`);
    } finally {
      setCalculating(false);
    }
  };

  const handleSavePayroll = async () => {
    if (!selectedEmployee || !calculationPreview) return;
    
    setLoading(true);
    try {
      const period = format(new Date(selectedPeriod.start), 'yyyy-MM');
      // Persist the exact dashboard preview so saved DB values match what's shown in the UI.
      await savePayrollRecord(selectedEmployee, period, {
        preview: calculationPreview,
        forceSavePreview: true,
        periodStart: selectedPeriod.start,
        periodEnd: selectedPeriod.end,
        status: 'pending'
      });
      
      alert('Payroll saved successfully!');
      await loadPayroll(); // Refresh the list
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save payroll. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewPayslip = () => {
    console.log('handlePreviewPayslip called');
    console.log('🎨 PAYROLL DASHBOARD - themeColors from hook:', JSON.stringify(themeColors, null, 2));
    console.log('companyBranding:', companyBranding);
    
    if (!calculationPreview) return;

    // Build a faculty profile lookup from loaded facultyProfiles if possible
    const faculty = facultyProfiles.find(f => f.id === selectedEmployee) || {};

    const payrollData = {
      ...calculationPreview,
      preview: calculationPreview,
      periodStart: selectedPeriod.start,
      periodEnd: selectedPeriod.end,
      generatedAt: new Date().toISOString()
    };

    // include currently logged-in HR user name when building printable payslip
    if (user && user.name) {
      payrollData.hrName = user.name;
    }

    const facultyProfile = {
      name: faculty.name || calculationPreview.employeeInfo?.name || '',
      employeeId: faculty.facultyId || faculty.id || selectedEmployee,
      position: faculty.position || calculationPreview.employeeInfo?.type || '' ,
      department: faculty.department || '',
      companyBranding: companyBranding || {},
      themeColors: themeColors || {}
    };

    console.log('🎨 PAYROLL DASHBOARD - facultyProfile.themeColors being passed:', JSON.stringify(facultyProfile.themeColors, null, 2));

    try {
      const html = payslipService.buildPrintablePayslipHtml(payrollData, facultyProfile);
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
      } else {
        alert('Popup blocked: enable popups to preview payslip');
      }
    } catch (err) {
      console.error('Failed to build payslip preview', err);
      alert('Failed to preview payslip');
    }
  };

  const handleProcessPayroll = async () => {
    setLoading(true);
    try {
      // In real implementation, this would call payrollService.generatePayroll
      // for each faculty member and save to database
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing

      // Update stats
      setStats(prev => ({
        ...prev,
        processedCount: prev.totalEmployees,
        pendingCount: 0
      }));

      alert('Payroll processing completed successfully!');
    } catch (error) {
      alert('Error processing payroll. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPayslips = async (format) => {
    try {
      // In real implementation, this would generate payslips for all processed payroll
      alert(`Downloading payslips in ${format.toUpperCase()} format...`);
    } catch (error) {
      alert('Error downloading payslips. Please try again.');
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${color}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            {typeof value === 'number' ? `₱${(value ?? 0).toLocaleString()}` : value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Payroll Dashboard</h1>
          <p className="text-gray-600 text-lg">Quick individual payroll calculation & preview</p>
        </motion.div>

        

        

        

        {/* Summary Cards (HR-style) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Employees</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalEmployees ?? 0}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-gray-500">Total employees</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Gross</p>
                <p className="text-2xl font-bold text-gray-800">₱{(stats.totalGrossPay ?? 0).toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-gray-500">Estimated gross</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Net</p>
                <p className="text-2xl font-bold text-gray-800">₱{(stats.totalNetPay ?? 0).toLocaleString()}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-gray-500">Estimated net</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Compute All controls: runs calculatePayrollFromFirebase for each employee and aggregates totals */}
        <div className="mb-6 flex justify-center">
          {computeAllRunning ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-300">Computing payrolls...</div>
              <div className="text-sm text-gray-300">{computeAllProgress.processed}/{computeAllProgress.total}</div>
              <button onClick={cancelComputeAll} className="inline-flex items-center px-3 py-2 border border-red-600 rounded-md text-sm text-red-600 bg-white/5 hover:bg-red-600/10">
                Cancel
              </button>
            </div>
          ) : savingAllRunning ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-300">Saving payrolls...</div>
              <div className="text-sm text-gray-300">{savingAllProgress.processed}/{savingAllProgress.total}</div>
              <div className="text-sm text-gray-300">ok: {savingAllProgress.succeeded} fail: {savingAllProgress.failed}</div>
              <button onClick={cancelSaveAll} className="inline-flex items-center px-3 py-2 border border-red-600 rounded-md text-sm text-red-600 bg-white/5 hover:bg-red-600/10">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <button onClick={handleComputeAll} className="inline-flex items-center px-4 py-2 border-2 rounded-lg text-sm font-medium border-blue-600 text-blue-600 bg-transparent hover:bg-blue-600/5">
                  Compute All
                </button>
                <button onClick={handleSaveAllPayrolls} className="inline-flex items-center px-4 py-2 border-2 rounded-lg text-sm font-medium border-green-600 text-green-600 bg-transparent hover:bg-green-600/5">
                  Save All Payrolls
                </button>
              </div>
              <div className="text-sm text-gray-400 mt-1">Run payroll calculation for all employees and update totals</div>
            </div>
          )}
        </div>

        {/* Payroll Schedule Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8 border border-gray-100 dark:border-gray-700"
        >
          <motion.button
            onClick={() => setPayrollConfigExpanded(!payrollConfigExpanded)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Payroll Schedule Configuration</h2>
            <motion.div animate={{ rotate: payrollConfigExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </motion.div>
          </motion.button>

          {payrollConfigExpanded && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-56 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="semimonthly">Twice a month (Semi-monthly)</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              {frequency !== 'weekly' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recurring day(s) of month</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="31" value={recurrenceDays[0] || ''} onChange={e => setRecurrenceDays([Number(e.target.value) || 0, recurrenceDays[1] || null].filter(Boolean))} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500" />
                    {frequency === 'semimonthly' && (
                      <input type="number" min="1" max="31" value={recurrenceDays[1] || ''} onChange={e => setRecurrenceDays([recurrenceDays[0] || null, Number(e.target.value) || 0].filter(Boolean))} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">These day(s) will repeat every month until changed. For example 12 → 12th of each month.</p>
                </div>
              ) : null}

              {frequency === 'weekly' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payroll Weekday</label>
                  <select value={payrollDay} onChange={e => setPayrollDay(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-56 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose the weekday payroll will run for weekly frequency (e.g., Monday).</p>
                </div>
              ) : null}

              <div className="pt-4">
                <motion.button 
                  onClick={handleSavePayrollConfig} 
                  disabled={savingConfig}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="approve-button flex items-center gap-2 px-6 py-3 border-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {savingConfig ? 'Saving...' : 'Save Payroll Schedule'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Main Calculation Card (simplified) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Select + Earnings */}
            <div className="flex-1">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Employee</label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => handleEmployeeSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Please Select an Employee</option>
                  {facultyProfiles.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} - {employee.position}
                    </option>
                  ))}
                </select>
              </div>

              {!calculationPreview && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="role-assignment-card bg-white dark:bg-gray-800 rounded-lg p-6 border text-center">
                  <div className="flex items-center justify-center mb-4">
                    <div className="p-2 rounded-full" style={{ backgroundColor: 'transparent' }}>
                      <Info className="h-10 w-10" style={{ color: 'var(--color-role-assignment-text)' }} />
                    </div>
                  </div>
                  <h3 className="role-assignment-title text-lg font-semibold">No employee selected</h3>
                  <p className="role-assignment-text text-sm mt-2">Select an employee from the dropdown to view payroll details and run calculations. You can preview and save payroll once a calculation is available.</p>
                </motion.div>
              )}

              {calculationPreview && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-3">Earnings</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Base Pay</span>
                      <span className="text-green-600 dark:text-green-400">₱{displayAmount(displayBaseSalaryNumber || calculationPreview?.breakdown?.baseSalary || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    {/* Always show Overtime (may be 0.00) */}
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Overtime</span>
                      <span className="text-green-600 dark:text-green-400">₱{displayAmount(calculationPreview?.breakdown?.overtimeEarnings || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>

                    {/* Render night differential separately (primary earning under Earnings) */}
                    {(() => {
                      const ndKey = Object.keys(calculationPreview.additions || {}).find(k => /night|differential|nightDifferential/i.test(k));
                      const ndVal = ndKey ? calculationPreview.additions[ndKey] : (calculationPreview?.additions?.nightDifferential ?? 0);
                      const ndDisplay = computeAdditionDisplay(ndKey || 'nightDifferential', ndVal || 0);
                      return (
                        <div key={ndKey || 'nightDifferential'} className="flex justify-between">
                          <span className="text-gray-600">{formatLabel('nightDifferential')}</span>
                          <span className="text-green-600">₱{displayAmount(ndDisplay || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      );
                    })()}

                    {/* Leave Credits / Leave Conversion */}
                    {(() => {
                      // Show leave conversion (show 0.00 if none)
                      const leaveConversionFromAdditions = Number(calculationPreview?.additions?.leaveConversion || 0);
                      if (leaveConversionFromAdditions !== undefined) {
                        return (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Leave Conversion</span>
                            <span className="text-green-600">₱{displayAmount(leaveConversionFromAdditions || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                        );
                      }
                      // Fallback: compute from leave info if not in additions
                      const leaveInfo = selectedEmployeeType?.leaveInformation;
                      const conv = leaveInfo?.conversionRate;
                      if (!conv) return null;
                      const convVal = Number(conv.value || 0);
                      const isPerc = conv.isPercentage === true || (convVal > 0 && convVal <= 100);
                      if (!isPerc || convVal <= 0) return null;
                      const baseEarningsForLeave = Number(calculationPreview?.breakdown?.baseEarnings ?? displayBaseSalaryNumber ?? 0);
                      const leaveAmount = Math.round((baseEarningsForLeave * (convVal / 100)) * 100) / 100;
                      if (!leaveAmount || leaveAmount === 0) return null;
                      return (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Leave Conversion ({convVal}%)</span>
                          <span className="text-green-600">₱{displayAmount(leaveAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      );
                    })()}

                    <div className="border-t border-green-200 pt-2 mt-2 flex justify-between font-medium">
                      <span className="text-green-800">Subtotal Earnings</span>
                      <span className="text-green-800">₱{(
                        // Subtotal includes: base pay + overtime + night differential + leave conversion
                        (displayAmount(displayBaseSalaryNumber || 0) +
                        displayAmount(calculationPreview.breakdown.overtimeEarnings || 0) +
                        displayAmount(nightDifferentialDisplay || 0) +
                        displayAmount(calculationPreview?.additions?.leaveConversion || 0)) +
                        (function(){
                          try {
                            const conv = selectedEmployeeType?.leaveInformation?.conversionRate;
                            const convVal = Number(conv?.value || 0);
                            const isPerc = conv?.isPercentage === true || (convVal > 0 && convVal <= 100);
                            if (!isPerc || convVal <= 0) return 0;
                            // For cases where leave conversion isn't in additions, compute it
                            if (Number(calculationPreview?.additions?.leaveConversion || 0) > 0) return 0; // already added above
                            // use canonical base earnings (exclude overtime and night differential)
                            const base = displayAmount(calculationPreview?.breakdown?.baseEarnings ?? displayBaseSalaryNumber ?? 0);
                            return Math.round((base * (convVal / 100)) * 100) / 100;
                          } catch (e) { return 0; }
                        })()
                      ).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>

                    {/* Render remaining additions (exclude nightDifferential and internal total key) */}
                    {Object.entries(calculationPreview.additions || {}).filter(([key]) => !/night|differential|nightDifferential|overtime|leave|conversion/i.test(key) && String(key).toLowerCase() !== 'total').map(([key, val]) => {
                      const keyLower = String(key || '').toLowerCase();

                      // If this is the 13th month entry, only show it for the configured months (handled elsewhere)
                      if (/thirteenth|13th/.test(keyLower)) {
                        try {
                          // If payrollService computed a non-zero 13th month amount, always show it
                          if (Number(val || 0) > 0) {
                            // show regardless of applyMonths
                          } else {
                            const periodStartDate = new Date(selectedPeriod.start);
                            if (isNaN(periodStartDate.getTime())) return null;
                            const monthNum = periodStartDate.getMonth() + 1; // 1-12
                            const applyMonths = selectedEmployeeType?.standardAdditions?.thirteenthMonth?.applyMonths || [];
                            if (Array.isArray(applyMonths) && applyMonths.length > 0) {
                              if (!applyMonths.includes(monthNum)) return null;
                            } else {
                              if (monthNum !== 12) return null;
                            }
                          }
                        } catch (e) { return null; }
                      }

                      const displayValue = computeAdditionDisplay(key, val);
                      return (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{formatLabel(key)}</span>
                          <span className="text-green-600 dark:text-green-400">₱{displayValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      );
                    })}

                    {(() => {
                      // Use canonical totals returned by the payroll service to avoid recomputation mismatches.
                          const baseGross = displayAmount(Number(calculationPreview?.grossSalary || 0));
                          const additionsTotal = displayAmount(Number(calculationPreview?.additions?.total || 0));
                          const totalEarnings = baseGross + additionsTotal;
                      return (
                        <div className="border-t border-green-200 dark:border-green-800 pt-2 mt-2 flex justify-between font-medium">
                          <span className="text-green-800 dark:text-green-300">Total Earnings</span>
                          <span className="text-green-800 dark:text-green-300">₱{totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      );
                    })()}

                  </div>
                </motion.div>
              )}

              {/* Payroll Summary as its own box under Earnings */}
              {calculationPreview && (
                <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Payroll Summary</h4>
                  <div className="space-y-2">
                    {(() => {
                      const baseGross = displayAmount(Number(calculationPreview?.grossSalary || 0));
                      const additionsTotal = displayAmount(Number(calculationPreview?.additions?.total || 0));
                      const totalEarnings = baseGross + additionsTotal;
                      return (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Total Earnings</span>
                          <span className="font-medium text-gray-900 dark:text-white">₱{totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                      );
                    })()}

                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Deductions</span>
                      <span className="font-medium text-gray-900 dark:text-white">₱{displayAmount(calculationPreview?.deductions?.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Other Payables</span>
                      <span className="font-medium text-gray-900 dark:text-white">₱{(Object.values(calculationPreview?.customFields || {}).reduce((s, f) => s + (Number(f.value) || 0), 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>

                    <div className="border-t border-blue-200 dark:border-blue-800 pt-2 mt-2 flex justify-between font-bold text-blue-800 dark:text-blue-300">
                      <span>Net Salary</span>
                      <span>₱{displayAmount(calculationPreview?.netSalary || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Overview & breakdown */}
            {calculationPreview ? (
              <aside className="w-full lg:w-80 flex-shrink-0">
                <div className="space-y-4">
                {/* Salary / Net */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{displayRateLabel}</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">₱{(Number(displayHourlyRateNumber || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}{displayHourlyUnit}</p>
                  </div>
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Net Salary</p>
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">₱{displayAmount(calculationPreview?.netSalary || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                  </div>
                </div>

                {/* Employee Info */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Employee Information</h4>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Employee Type</span>
                      <span className="font-medium">{selectedEmployeeType?.name || calculationPreview?.employeeInfo?.type || 'Not Set'}</span>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span>Salary Type</span>
                      <span className="font-medium capitalize">{selectedEmployeeType?.salaryType || calculationPreview?.employeeInfo?.salaryType || 'Not Set'}</span>
                    </div>
                  </div>
                </div>

                {/* Other Payables */}
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">Other Payables</h4>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {Object.entries(calculationPreview?.customFields || {}).map(([key, field]) => (
                      <div key={key} className="flex justify-between mt-2">
                        <span>{formatLabel(key)}</span>
                        <span className="text-purple-600 dark:text-purple-400">₱{displayAmount(Number(field.value || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    ))}
                    {Object.keys(calculationPreview?.customFields || {}).length === 0 && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">No other payables</div>
                    )}
                  </div>
                </div>

                {/* Deductions */}
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Deductions</h4>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {(() => {
                      console.error('🔴 RENDERING DEDUCTIONS - calculationPreview?.deductions:', calculationPreview?.deductions);
                      const standardDeductions = ['sss', 'philhealth', 'pagibig', 'tax', 'latedeductions'];
                      const excludeDeductions = ['total', 'breakdown', 'latededuction', 'withholding', 'WithholdingTax']; // Exclude latededuction (the rate), only show latedeductions (calculated amount)

                      const baseGross = Number(calculationPreview?.breakdown?.baseSalary || 0);

                      // Render standard deductions rows always (show 0.00 when amounts are zero)
                      return standardDeductions
                        .map((k) => {
                          const v = calculationPreview?.deductions?.[k] ?? calculationPreview?.deductions?.[k.charAt(0).toUpperCase() + k.slice(1)] ?? 0;
                          return [k, Number(v || 0)];
                        })
                        .map(([key, value]) => {
                          console.error('🔴 RENDERING', key, '=', value);
                          return (
                            <div key={key} className="flex justify-between mt-2">
                              <span>{({sss: 'SSS Contribution', philhealth: 'Phil Health', pagibig: 'Pag IBIG', tax: 'Withholding Tax', latedeductions: 'Late Deduction'}[key.toLowerCase()] || key)}</span>
                              <span className="text-red-600 dark:text-red-400">₱{displayAmount(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                          );
                        });
                    })()}



                    <div className="border-t border-red-200 dark:border-red-800 pt-2 mt-3 flex justify-between font-medium">
                      <span className="text-red-800 dark:text-red-300">Total Deductions</span>
                      <span className="text-red-800 dark:text-red-300">₱{displayAmount(calculationPreview?.deductions?.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleSavePayroll}
                    disabled={loading}
                    className="flex flex-col items-center gap-2 px-3 py-3 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2"
                    style={{
                      borderColor: loading ? '#6ee7b7' : '#10b981',
                      color: loading ? '#6ee7b7' : '#10b981'
                    }}
                  >
                    <Save className="w-4 h-4" />
                    <span>{loading ? 'Saving...' : 'Save Payroll'}</span>
                  </button>

                  <button
                    onClick={handlePreviewPayslip}
                    className="flex flex-col items-center gap-2 px-3 py-3 text-xs font-semibold rounded-lg transition-colors border-2"
                    style={{
                      borderColor: '#3b82f6',
                      color: '#3b82f6'
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    <span>Preview Payslip</span>
                  </button>
                </div>
                </div>
              </aside>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PayrollDashboard;
