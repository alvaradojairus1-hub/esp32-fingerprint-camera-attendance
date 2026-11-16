import { ref, set, get, update } from "firebase/database";
import { database, dbRef } from "../firebase";
import { firebaseService } from './firebaseService';
import { pairAttendanceRecords } from '../utils/attendanceUtils';
import { computeHourlyEarnings } from './hourlyCalculator';
import { scheduleService } from './scheduleService';
import { appliesToPeriod } from '../utils/periodUtils';

/**
 * Saves a new payroll record or updates an existing one for a specific user and period.
 * Fetches deductions and allowances from Firebase and computes net salary.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The payroll period (e.g., "2025-09").
 * @param {object} payrollInput - Object containing grossSalary and other data.
 * @param {number} payrollInput.grossSalary - The employee's gross salary.
 * @param {string} [payrollInput.status="pending"] - The status of the payroll record.
 * @param {string} [payrollInput.periodStart] - The start date of the payroll period.
 * @param {string} [payrollInput.periodEnd] - The end date of the payroll period.
 * @returns {Promise<void>}
 */
export const savePayrollRecord = async (userId, period, payrollInput) => {
    // Accept optional preview and a forceSavePreview flag so callers (UI) can persist the exact preview values.
    const { grossSalary, status = "pending", periodStart = null, periodEnd = null, preview = null, forceSavePreview = false } = payrollInput;

    try {
        // Helper: recursively remove properties with `undefined` so Firebase set() doesn't reject
        // - keeps null values (Firebase accepts null)
        // - removes object keys that sanitize to undefined
        // - for arrays: sanitizes items and removes items that become undefined
        const sanitizeForFirebase = (value) => {
            if (value === undefined) return undefined; // caller will skip keys with undefined
            if (value === null) return null;
            if (Array.isArray(value)) {
                // sanitize each item and filter out undefined entries
                const arr = value.map(v => sanitizeForFirebase(v)).filter(v => v !== undefined);
                return arr;
            }
            if (typeof value === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(value)) {
                    const sv = sanitizeForFirebase(v);
                    if (sv !== undefined) out[k] = sv;
                }
                return out;
            }
            // primitive (number/string/boolean)
            return value;
        };
        if (forceSavePreview && preview && typeof preview === 'object') {
            // If the UI passed a preview, persist it verbatim (with minimal metadata)
            // so saved values match the dashboard exactly. Avoid transforming keys.
            const round2 = (v) => {
                if (v === undefined || v === null) return v;
                if (typeof v === 'number') return Math.round((v + Number.EPSILON) * 100) / 100;
                const n = Number(v);
                return isNaN(n) ? v : Math.round((n + Number.EPSILON) * 100) / 100;
            };

            // shallow clone preview to avoid mutating caller state
            const previewCopy = JSON.parse(JSON.stringify(preview || {}));

            // Ensure numeric fields are numbers and rounded similarly to the UI
            if (previewCopy.grossSalary !== undefined) previewCopy.grossSalary = round2(previewCopy.grossSalary);
            if (previewCopy.netSalary !== undefined) previewCopy.netSalary = round2(previewCopy.netSalary);
            if (previewCopy.additions && typeof previewCopy.additions === 'object') {
                for (const k of Object.keys(previewCopy.additions)) {
                    if (k === 'total') continue;
                    previewCopy.additions[k] = round2(previewCopy.additions[k]);
                }
                if (previewCopy.additions.total !== undefined) previewCopy.additions.total = round2(previewCopy.additions.total);
            }
            if (previewCopy.deductions && typeof previewCopy.deductions === 'object') {
                for (const k of Object.keys(previewCopy.deductions)) {
                    if (k === 'total') continue;
                    previewCopy.deductions[k] = round2(previewCopy.deductions[k]);
                }
                if (previewCopy.deductions.total !== undefined) previewCopy.deductions.total = round2(previewCopy.deductions.total);
            }
            if (previewCopy.allowances && typeof previewCopy.allowances === 'object') {
                for (const k of Object.keys(previewCopy.allowances)) previewCopy.allowances[k] = round2(previewCopy.allowances[k]);
                if (previewCopy.allowances.total !== undefined) previewCopy.allowances.total = round2(previewCopy.allowances.total);
            }
            if (previewCopy.breakdown && typeof previewCopy.breakdown === 'object') {
                for (const k of Object.keys(previewCopy.breakdown)) previewCopy.breakdown[k] = round2(previewCopy.breakdown[k]);
                if (previewCopy.breakdown.totalAdditions !== undefined) previewCopy.breakdown.totalAdditions = round2(previewCopy.breakdown.totalAdditions);
                if (previewCopy.breakdown.totalDeductions !== undefined) previewCopy.breakdown.totalDeductions = round2(previewCopy.breakdown.totalDeductions);
            }

            const payrollRecord = {
                // copy preview keys verbatim so the database contains exactly what the UI displayed
                ...previewCopy,
                // also keep preview object nested for compatibility with payslipService logic
                preview: previewCopy,
                userId: userId,
                periodStart: periodStart || previewCopy.periodStart || null,
                periodEnd: periodEnd || previewCopy.periodEnd || null,
                status: status || previewCopy.status || 'pending',
                createdAt: new Date().toISOString(),
                timestamp: new Date().toISOString()
            };

            // Ensure nested objects exist to avoid surprises in DB
            payrollRecord.deductions = payrollRecord.deductions || {};
            payrollRecord.additions = payrollRecord.additions || {};
            payrollRecord.allowances = payrollRecord.allowances || {};
            payrollRecord.breakdown = payrollRecord.breakdown || {};
            payrollRecord.customFields = payrollRecord.customFields || {};

            // Ensure we write payroll under a canonical id (prefer facultyId if available)
            // Also write a secondary copy under the employee's auth/userId so the employee account (auth uid) can discover the payslip.
            let targetId = userId;
            let secondaryId = null;
            let match = null;
            try {
                const employees = await firebaseService.getEmployees(); // Use getEmployees for consistency
                match = (employees || []).find(u => String(u.userId) === String(userId) || String(u.id) === String(userId) || String(u.facultyId) === String(userId));
                if (match && match.facultyId) targetId = match.facultyId;
                // decide a secondary id to write under (prefer auth userId if available)
                if (match) {
                    // match.userId is typically the auth uid; use it as a secondary index so employees see their payslips
                    secondaryId = match.userId || match.id || null;
                }
            } catch (err) {
                // if user lookup fails, fall back to provided userId
            }

            // Remove duplicate/unwanted fields and zero-valued redundancies before saving
            const pruneForSave = (obj) => {
                if (!obj || typeof obj !== 'object') return obj;
                // Names to explicitly remove wherever they appear
                const removeNames = new Set(['allowances', 'totalAllowances', 'serviceCredits', 'salaryRate', 'grossSalary']);

                const out = Array.isArray(obj) ? [] : {};
                for (const [k, v] of Object.entries(obj)) {
                    // drop singular lateDeduction only when its value is exactly 50 (per request)
                    if (k === 'lateDeduction' && typeof v === 'number' && v === 50) continue;
                    if (removeNames.has(k)) continue; // drop this key entirely

                    // recurse into objects/arrays
                    if (v && typeof v === 'object') {
                        const pruned = pruneForSave(v);
                        // If object/array became empty after pruning, skip it
                        if (pruned && typeof pruned === 'object') {
                            if (Array.isArray(pruned) && pruned.length === 0) continue;
                            if (!Array.isArray(pruned) && Object.keys(pruned).length === 0) continue;
                        } else if (pruned === undefined) {
                            continue;
                        }
                        out[k] = pruned;
                        continue;
                    }

                    // remove numeric zeros as redundant (but keep booleans/strings/null)
                    if (typeof v === 'number' && v === 0) continue;

                    // keep everything else
                    out[k] = v;
                }
                return out;
            };

            const prunedRecord = pruneForSave(payrollRecord);

            // sanitize preview payload before writing to prevent Firebase rejecting undefined values
            const sanitizedPreviewRecord = sanitizeForFirebase(prunedRecord);
            // write primary record (prefer facultyId key)
            await set(ref(database, dbRef(`payroll/${period}/${targetId}`)), sanitizedPreviewRecord);
            // also write a secondary copy under the employee auth/userId so the employee's "My Payslips" view can find it
            try {
                if (secondaryId && String(secondaryId) !== String(targetId)) {
                    const secondaryRecord = JSON.parse(JSON.stringify(sanitizedPreviewRecord));
                    // ensure userId on the secondary copy points to the auth/userId so lookup matches
                    secondaryRecord.userId = String(secondaryId);
                    // preserve original facultyId on the copy for reference
                    secondaryRecord.facultyId = secondaryRecord.facultyId || String(targetId);
                    await set(ref(database, dbRef(`payroll/${period}/${secondaryId}`)), secondaryRecord);
                }
            } catch (e) {
                // ignore secondary write failures
            }
            return;
        }

        // Default: compute a full payroll breakdown using the canonical calculation function
        // This centralizes statutory, TRAIN, DHVSU tax, other deductions, allowances, and service credits
        const computed = await calculatePayrollFromFirebase(userId, period, grossSalary);

        // computed is expected to include: breakdown, netSalary, deductions, allowances, employeeInfo
        // Prefer computed gross from calculation (useful for hourly employees); fall back to provided grossSalary
        const basicPay = (computed && (computed.grossSalary !== undefined && computed.grossSalary !== null)) ? Number(computed.grossSalary) : Number(grossSalary || 0);
        const adjustment = payrollInput && (payrollInput.adjustment || payrollInput.adjustment === 0) ? Number(payrollInput.adjustment) : 0;
        const otherPayables = payrollInput && payrollInput.otherPayables ? payrollInput.otherPayables : {};
        const otherPayablesTotal = Object.values(otherPayables || {}).reduce((s, v) => s + (Number(v) || 0), 0);

        const breakdown = computed.breakdown || {};
        const statutory = breakdown.statutory || {};

        // Base deduction entries from computed.deductions (if any)
        const baseDeductions = (computed.deductions && typeof computed.deductions === 'object') ? { ...computed.deductions } : {};

        // Ensure canonical deduction keys expected by the payslip UI
        const dedMap = { ...(baseDeductions || {}) };
        dedMap.SSS = Number(statutory.sss || breakdown.sss || 0);
        dedMap.PhilHealth = Number(statutory.philhealth || breakdown.philhealth || 0);
        dedMap.PagIBIG = Number(statutory.pagibig || breakdown.pagibig || 0);
        // TRAIN withholding
        dedMap.WithholdingTax = Number(breakdown.trainTax || 0);
        // DHVSU institutional tax
        dedMap.DHVSUTax = Number(breakdown.dhvsuTax || 0);

        // Remove nested 'total' from baseDeductions to avoid duplication; we'll set total explicitly
        delete dedMap.total;

        const totalDeductions = Number((computed.deductions && computed.deductions.total) || breakdown.totalDeductions || Object.values(dedMap).reduce((s, v) => s + (Number(v) || 0), 0));

        const allowances = computed.allowances || {};
        const totalAllowances = Number(allowances.total || breakdown.totalAllowances || Object.values(allowances).reduce((s, v) => s + (Number(v) || 0), 0));

        const payrollRecord = {
            userId: userId,
            periodStart: periodStart,
            periodEnd: periodEnd,
            basicPay: basicPay,
            adjustment: adjustment,
            grossSalary: basicPay,
            breakdown: breakdown,
            netSalary: computed.netSalary || 0,
            deductions: {
                ...dedMap,
                total: totalDeductions
            },
            allowances: {
                ...(computed.allowances || {}),
                total: totalAllowances
            },
            otherPayables: otherPayables,
            otherPayablesTotal: otherPayablesTotal,
            employeeInfo: computed.employeeInfo || {},
            status: status,
            createdAt: new Date().toISOString()
        };

        // Ensure we write payroll under a canonical id (prefer facultyId if available)
        // Also write a secondary copy under the employee's auth/userId so the employee account (auth uid) can discover the payslip.
        let targetId = userId;
        let secondaryId = null;
        let match = null;
        try {
            const employees = await firebaseService.getEmployees(); // Use getEmployees for consistency
            match = (employees || []).find(u => String(u.userId) === String(userId) || String(u.id) === String(userId) || String(u.facultyId) === String(userId));
            if (match && match.facultyId) targetId = match.facultyId;
            // decide a secondary id to write under (prefer auth userId if available)
            if (match) {
                // match.userId is typically the auth uid; use it as a secondary index so employees see their payslips
                secondaryId = match.userId || match.id || null;
            }
        } catch (err) {
            // if user lookup fails, fall back to provided userId
        }

        // Remove duplicate/unwanted fields and zero-valued redundancies before saving computed record
        const pruneForSave = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            const removeNames = new Set(['allowances', 'totalAllowances', 'serviceCredits', 'salaryRate', 'grossSalary']);
            const out = Array.isArray(obj) ? [] : {};
            for (const [k, v] of Object.entries(obj)) {
                // drop singular lateDeduction only when its value is exactly 50 (per request)
                if (k === 'lateDeduction' && typeof v === 'number' && v === 50) continue;
                if (removeNames.has(k)) continue;
                if (v && typeof v === 'object') {
                    const pruned = pruneForSave(v);
                    if (pruned && typeof pruned === 'object') {
                        if (Array.isArray(pruned) && pruned.length === 0) continue;
                        if (!Array.isArray(pruned) && Object.keys(pruned).length === 0) continue;
                    } else if (pruned === undefined) {
                        continue;
                    }
                    out[k] = pruned;
                    continue;
                }
                if (typeof v === 'number' && v === 0) continue;
                out[k] = v;
            }
            return out;
        };

        const prunedComputed = pruneForSave(payrollRecord);
        // sanitize computed payload before writing to prevent Firebase rejecting undefined values
        const sanitizedComputedRecord = sanitizeForFirebase(prunedComputed);
        // write primary record
        await set(ref(database, dbRef(`payroll/${period}/${targetId}`)), sanitizedComputedRecord);
        // also write secondary copy under auth/userId for employee discoverability
        try {
            if (secondaryId && String(secondaryId) !== String(targetId)) {
                const secondaryRecord = JSON.parse(JSON.stringify(sanitizedComputedRecord));
                secondaryRecord.userId = String(secondaryId);
                secondaryRecord.facultyId = secondaryRecord.facultyId || String(targetId);
                await set(ref(database, dbRef(`payroll/${period}/${secondaryId}`)), secondaryRecord);
            }
        } catch (e) {
            // ignore secondary write failures
        }
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves a single payroll record for a specific user and period.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The payroll period (e.g., "2025-09").
 * @returns {Promise<object|null>} The payroll record, or null if not found.
 */
export const getPayrollRecord = async (userId, period) => {
    try {
    const snapshot = await get(ref(database, dbRef(`payroll/${period}/${userId}`)));
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            return null;
        }
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all payroll records for a given period, including user names and positions.
 *
 * @param {string} period - The payroll period (e.g., "2025-09").
 * @returns {Promise<Array<object>>} An array of payroll records with user details.
 */
/**
 * Retrieves all payroll records for a given period, including user names and positions.
 * If `viewerId` is provided, returns only records that belong to that user (matched against userId/facultyId/id).
 *
 * @param {string} period - The payroll period (e.g., "2025-09").
 * @param {string} [viewerId] - Optional: filter results to this user id (auth uid or facultyId).
 * @returns {Promise<Array<object>>} An array of payroll records with user details.
 */
export const getPayrollRecordsForPeriod = async (period, viewerId = null) => {
    try {
    const payrollSnapshot = await get(ref(database, dbRef(`payroll/${period}`)));
        if (!payrollSnapshot.exists()) {
            return [];
        }

        const payrollData = payrollSnapshot.val();
        const userIds = Object.keys(payrollData);

    // use employee accounts only (exclude HR admin accounts)
            // prefer employee accounts for user metadata lookups (exclude HR)
            const users = await firebaseService.getEmployees();
        const usersMap = (users || []).reduce((acc, u) => {
            const key = u.facultyId || u.userId || u.id;
            acc[key] = u;
            return acc;
        }, {});

        let records = Object.values(payrollData).map(record => {
            const user = usersMap[record.userId] || usersMap[record.facultyId] || usersMap[record.id] || null;
            // Ensure periodStart/periodEnd exist for legacy records: default to the provided period month
            let periodStart = record.periodStart;
            let periodEnd = record.periodEnd;
            if (!periodStart || !periodEnd) {
                try {
                    const [y, m] = (period || '').split('-').map(Number);
                    if (y && m) {
                        periodStart = periodStart || `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-01`;
                        // compute last day of month
                        const last = new Date(y, m, 0).getDate();
                        periodEnd = periodEnd || `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
                    }
                } catch (e) {
                    // fall back to existing record values
                }
            }

            return {
                ...record,
                periodStart: periodStart || record.periodStart || null,
                periodEnd: periodEnd || record.periodEnd || null,
                name: user ? (user.name || user.displayName || 'Unknown User') : (record.name || 'Unknown User'),
                facultyId: user ? (user.facultyId || record.facultyId) : (record.facultyId || 'N/A'),
            };
        }).filter(Boolean);

        // If a viewerId is provided, filter to records that belong to that viewer (match userId/facultyId/id)
        if (viewerId) {
            const vid = String(viewerId);
            records = records.filter(r => {
                try {
                    return String(r.userId || '').toLowerCase() === vid.toLowerCase()
                        || String(r.facultyId || '').toLowerCase() === vid.toLowerCase()
                        || String(r.id || '').toLowerCase() === vid.toLowerCase();
                } catch (e) { return false; }
            });
        }
        
        return records;
    } catch (error) {
        throw error;
    }
};

    /**
     * Updates the status of a specific payroll record.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The payroll period (e.g., "2025-09").
 * @param {string} newStatus - The new status (e.g., "approved", "processed").
 * @returns {Promise<void>}
 */
export const updatePayrollStatus = async (userId, period, newStatus) => {
    try {
    await update(ref(database, dbRef(`payroll/${period}/${userId}`)), { status: newStatus });
    } catch (error) {
    throw error;
    }
};

/**
 * Mark a payslip as printed (adds a lastPrintedAt timestamp) for audit purposes.
 * @param {string} userId
 * @param {string} period
 */
export const markPayslipPrinted = async (userId, period) => {
    try {
        await update(ref(database, dbRef(`payroll/${period}/${userId}`)), { lastPrintedAt: new Date().toISOString() });
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves an employee's salary info, deductions, and allowances from Firebase.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<object|null>} An object containing salaryInfo, deductions, and allowances.
 */
export const getEmployeePayrollData = async (userId) => {
    try {
        // Attempt to resolve the canonical users/{id} key for deductions/allowances lookups.
    let resolvedId = userId;
    let userSnapshot = await get(ref(database, dbRef(`users/${resolvedId}`)));
    let userData = null;
    if (userSnapshot.exists()) {
        userData = userSnapshot.val();
        resolvedId = resolvedId;
    } else {
        // fall back: try to find the user by facultyId or alternative id via cached employees list
        try {
            const employees = await firebaseService.getEmployees();
            if (Array.isArray(employees) && employees.length > 0) {
                const found = employees.find(u => String(u.facultyId) === String(userId) || String(u.id) === String(userId) || String(u.userId) === String(userId));
                if (found) {
                    userData = found;
                    // prefer explicit userId if available on the found object
                    resolvedId = String(found.userId || found.id || found.facultyId || userId);
                }
            }
        } catch (e) {
            // ignore and continue
        }

        // If still not found, return null to signal missing employee record
        if (!userData) return null;
    }

        // Fetch deductions and allowances from Firebase using resolvedId
        const [deductionsSnapshot, allowancesSnapshot] = await Promise.all([
            get(ref(database, dbRef(`deductions/${resolvedId}`))),
            get(ref(database, dbRef(`allowances/${resolvedId}`)))
        ]);

        const deductions = deductionsSnapshot.exists() ? deductionsSnapshot.val() : {};
        const allowances = allowancesSnapshot.exists() ? allowancesSnapshot.val() : {};

        // Fetch employeeType config if reference exists
        let employeeType = null;
        if (userData.employeeType) {
            try {
                const etSnap = await get(ref(database, dbRef(`employeeTypes/${userData.employeeType}`)));
                if (etSnap.exists()) employeeType = etSnap.val();
            } catch (e) {
                console.warn('Failed to fetch employeeType:', userData.employeeType, e);
            }
        }

        // Provide defaults for new fields
        const salaryRate = (userData.salaryRate !== undefined) ? Number(userData.salaryRate) : (userData.salaryInfo && (userData.salaryInfo.salaryRate || userData.salaryInfo.rate)) || 0;
        const serviceCredits = (userData.serviceCredits !== undefined) ? Number(userData.serviceCredits) : 0;
        const taxRate = (userData.taxRate !== undefined) ? Number(userData.taxRate) : 0.02; // default 2% DHVSU institutional tax

        return {
            userId: resolvedId,
            name: userData.name,
            facultyId: userData.facultyId,
            salaryInfo: userData.salaryInfo || {},
            salaryRate,
            serviceCredits,
            taxRate,
            deductions: deductions,
            allowances: allowances,
            employeeType: employeeType,
            roleData: userData.roleData || {},
        };

    } catch (error) {
        throw error;
    }
};

/**
 * Calculates payroll using Firebase data (no hardcoded calculations).
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The payroll period.
 * @param {number} grossSalary - The gross salary.
 * @returns {Promise<object>} Calculated payroll data.
 */
export const calculatePayrollFromFirebase = async (userId, period, grossSalary) => {
    try {
        const employeeData = await getEmployeePayrollData(userId);
        if (!employeeData) {
            throw new Error(`Employee data not found for user ${userId}`);
        }
        
        // Validate that employee has required configuration
        if (!employeeData.employeeType) {
            console.error('❌ Employee', userId, 'has no employeeType configured');
            throw new Error(`Employee ${userId} has no employee type configured. Please assign an employee type in the system.`);
        }
        
        console.error('🔴🔴🔴 PAYROLL SERVICE START - userId:', userId, 'employeeData.employeeType:', employeeData.employeeType?.name, 'standardDeductions:', Object.keys(employeeData.employeeType?.standardDeductions || {}));
        
        // TRAIN withholding tax calculation removed - only use Firebase-stored deductions

    // Determine statutory contribution AMOUNTS (fixed pesos) with proper fallbacks
        // Load global tax configuration with error handling
        let globalTaxCfg = {};
        try {
            const cfgSnap = await get(ref(database, dbRef('payroll_config/tax')));
            if (cfgSnap.exists()) globalTaxCfg = cfgSnap.val();
        } catch (err) {
            console.warn('Failed to load global tax config:', err);
        }

        // Helper function to safely get nested values
        const getNestedValue = (obj, path, defaultValue = 0) => {
            try {
                return path.split('.').reduce((acc, key) => acc[key], obj) || defaultValue;
            } catch (e) {
                return defaultValue;
            }
        };

        // Defer deduction calculation until after computedGross is known.
        const computeSssAmount = () => {
            const etCfg = employeeData.employeeType;
            
            console.error('🔴 SSS: START - etCfg exists?', !!etCfg, 'etCfg.name:', etCfg?.name, 'etCfg.salaryType:', etCfg?.salaryType, 'etCfg.rate:', etCfg?.rate);
            console.error('🔴 SSS: employeeData.salaryRate:', employeeData.salaryRate, 'computedGross:', computedGross, 'baseEarnings:', baseEarnings);
            
            // Determine base for percentage conversion
            const isMonthlyEmployee = etCfg && String(etCfg.salaryType).toLowerCase() === 'monthly';
            
            // For monthly employees, NEVER use the rate heuristic - use baseEarnings only
            if (isMonthlyEmployee) {
                console.error('🔴 SSS: MONTHLY EMPLOYEE - using baseEarnings only, NO HEURISTIC');
                let baseForDeductions = Number(baseEarnings || 0);
                
                // Try employee-specific SSS amount first
                if (employeeData.sssAmount !== undefined) {
                    const value = Number(employeeData.sssAmount);
                    const isPercentage = employeeData.sssIsPercentage === true;
                    const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                    console.error('🔴 SSS: Monthly - EARLY RETURN from employeeData.sssAmount, result=' + result);
                    return result;
                }
                
                // Try existing SSS deduction record
                const employeeShare = getNestedValue(employeeData, 'deductions.SSS.employee_share_amount') ||
                                    getNestedValue(employeeData, 'deductions.SSS.employee_share');
                console.error('🔴 SSS: Monthly - employeeShare=' + employeeShare);
                if (employeeShare) {
                    const value = Number(employeeShare);
                    const isPercentage = getNestedValue(employeeData, 'deductions.SSS.isPercentage') === true;
                    const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                    console.error('🔴 SSS: Monthly - EARLY RETURN from employeeData.deductions.SSS, result=' + result);
                    return result;
                }
                
                // Use standardDeductions from employeeType config (calculate from baseEarnings only)
                console.error('🔴 SSS: Monthly - Checking standardDeductions, etCfg=' + (!!etCfg) + ', standardDeductions=' + (!!etCfg?.standardDeductions) + ', sss=' + (!!etCfg?.standardDeductions?.sss));
                if (etCfg && etCfg.standardDeductions && etCfg.standardDeductions.sss) {
                    const cfg = etCfg.standardDeductions.sss;
                    const value = Number(cfg.value || cfg || 0);
                    const isPercentage = cfg.isPercentage !== false; // default to percentage if not explicitly false
                    const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                    console.error('🔴 SSS: Monthly - FINAL from standardDeductions, value=' + value + ', isPercentage=' + isPercentage + ', baseForDeductions=' + baseForDeductions + ', result=' + result);
                    return result;
                }
                
                // For monthly: return 0 if no deduction found
                console.error('🔴 SSS: Monthly - RETURN 0 - no deduction found');
                return 0;
            }
            
            // For non-monthly (hourly/daily), use baseEarnings or apply heuristic
            // Use baseEarnings (canonical base pay from attendance) as the primary base for percentage deductions.
            // For hourly/daily rates, fall back to rate heuristic only if baseEarnings is not available.
            let baseForDeductions = Number(baseEarnings || computedGross || employeeData.salaryRate || 0);
            console.error('🔴 SSS: baseForDeductions after initial calc:', baseForDeductions, 'isMonthlyEmployee:', isMonthlyEmployee);
            
            // If no base yet, use heuristic based on salary type (non-monthly only)
            if (!baseForDeductions && etCfg && etCfg.rate) {
                const rate = Number(etCfg.rate || 0);
                const salaryType = (etCfg.salaryType || '').toLowerCase();
                // Only use Firebase-provided expectedDailyHours; do NOT default to 8
                const expectedDailyHours = (employeeData && employeeData.salaryInfo && employeeData.salaryInfo.expectedDailyHours !== undefined)
                    ? Number(employeeData.salaryInfo.expectedDailyHours)
                    : (etCfg && etCfg.expectedDailyHours !== undefined ? Number(etCfg.expectedDailyHours) : undefined);
                console.error('🔴 SSS: Applying heuristic - rate:', rate, 'salaryType:', salaryType, 'expectedDailyHours(from Firebase):', expectedDailyHours);
                switch (salaryType) {
                    case 'daily':
                        // only apply if workingDaysPerMonth exists in Firebase
                        if (typeof workingDaysPerMonth !== 'undefined' && Number(workingDaysPerMonth) > 0) {
                            baseForDeductions = rate * Number(workingDaysPerMonth);
                        } else {
                            console.error('🔴 SSS: DAILY heuristic skipped - missing workingDaysPerMonth from Firebase');
                            baseForDeductions = 0;
                        }
                        break;
                    case 'hourly': {
                        // Only apply hourly->monthly heuristic when both expectedDailyHours and workingDaysPerMonth are available from Firebase
                        const wdpm = (typeof workingDaysPerMonth !== 'undefined' && Number(workingDaysPerMonth) > 0) ? Number(workingDaysPerMonth) : undefined;
                        if (typeof expectedDailyHours !== 'undefined' && typeof wdpm !== 'undefined') {
                            baseForDeductions = rate * expectedDailyHours * wdpm;
                            console.error('🔴 SSS: HOURLY calc (using Firebase values):', rate, '*', expectedDailyHours, '*', wdpm, '=', baseForDeductions);
                        } else {
                            console.error('🔴 SSS: HOURLY heuristic skipped - missing expectedDailyHours or workingDaysPerMonth from Firebase');
                            baseForDeductions = 0;
                        }
                        break;
                    }
                    default: baseForDeductions = rate;
                }
            } else {
                console.error('🔴 SSS: NOT applying heuristic - baseForDeductions:', baseForDeductions, 'etCfg:', !!etCfg, 'etCfg.rate:', etCfg?.rate);
            }
            baseForDeductions = Number(baseForDeductions || 0);
            console.error('🔴 SSS: FINAL baseForDeductions:', baseForDeductions);
            
            // Try employee-specific SSS amount first
            if (employeeData.sssAmount !== undefined) {
                const value = Number(employeeData.sssAmount);
                const isPercentage = employeeData.sssIsPercentage === true;
                const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                console.error('🔴 SSS: EARLY RETURN from employeeData.sssAmount, result=' + result);
                return result;
            }
            
            // Try existing SSS deduction record
            const employeeShare = getNestedValue(employeeData, 'deductions.SSS.employee_share_amount') ||
                                getNestedValue(employeeData, 'deductions.SSS.employee_share');
            console.error('🔴 SSS: employeeShare=' + employeeShare);
            if (employeeShare) {
                const value = Number(employeeShare);
                const isPercentage = getNestedValue(employeeData, 'deductions.SSS.isPercentage') === true;
                const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                console.error('🔴 SSS: EARLY RETURN from employeeData.deductions.SSS, result=' + result);
                return result;
            }
            
            // Use standardDeductions from employeeType config
            console.error('🔴 SSS: Checking standardDeductions, etCfg=' + (!!etCfg) + ', standardDeductions=' + (!!etCfg?.standardDeductions) + ', sss=' + (!!etCfg?.standardDeductions?.sss));
            if (etCfg && etCfg.standardDeductions && etCfg.standardDeductions.sss) {
                const cfg = etCfg.standardDeductions.sss;
                const value = Number(cfg.value || cfg || 0);
                const isPercentage = cfg.isPercentage !== false; // default to percentage if not explicitly false
                const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                console.error('🔴 SSS: FINAL from standardDeductions, value=' + value + ', isPercentage=' + isPercentage + ', baseForDeductions=' + baseForDeductions + ', result=' + result);
                return result;
            }
            
            console.error('🔴 SSS: RETURN 0 - no deduction found');
            return 0;
        };

        const computePhilAmount = () => {
            const etCfg = employeeData.employeeType;
            
            // Determine base for percentage conversion
            // For monthly employees, NEVER use the rate heuristic - use baseEarnings only
            const isMonthlyEmployee = etCfg && String(etCfg.salaryType).toLowerCase() === 'monthly';
            
            if (isMonthlyEmployee) {
                let baseForDeductions = Number(baseEarnings || 0);
                
                // Try employee-specific PhilHealth amount first
                if (employeeData.philAmount !== undefined) {
                    const value = Number(employeeData.philAmount);
                    const isPercentage = employeeData.philIsPercentage === true;
                    return isPercentage ? (baseForDeductions * (value / 100)) : value;
                }
                
                // Try existing PhilHealth deduction record
                const employeeShare = getNestedValue(employeeData, 'deductions.PhilHealth.employee_share_amount') ||
                                    getNestedValue(employeeData, 'deductions.PhilHealth.employee_share');
                if (employeeShare) {
                    const value = Number(employeeShare);
                    const isPercentage = getNestedValue(employeeData, 'deductions.PhilHealth.isPercentage') === true;
                    return isPercentage ? (baseForDeductions * (value / 100)) : value;
                }
                
                // Use standardDeductions from employeeType config
                if (etCfg && etCfg.standardDeductions && (etCfg.standardDeductions.philHealth || etCfg.standardDeductions.philhealth)) {
                    const cfg = etCfg.standardDeductions.philHealth || etCfg.standardDeductions.philhealth;
                    const value = Number((cfg && (cfg.value !== undefined ? cfg.value : cfg)) || 0);
                    const isPercentage = cfg && cfg.isPercentage !== false ? true : false;
                    const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                    console.debug('PhilHealth from standardDeductions:', { cfg, value, isPercentage, baseForDeductions, result });
                    return result;
                }
                
                // For monthly: return 0 if no deduction found
                return 0;
            }
            
            // For non-monthly (hourly/daily), use baseEarnings or apply heuristic
            let baseForDeductions = Number(baseEarnings || computedGross || employeeData.salaryRate || 0);
            
            // If no base yet, DO NOT apply broad heuristics that estimate monthly equivalents
            // Heuristics caused non-zero previews for no-attendance users. Skip them and leave deductions at 0.
            if (!baseForDeductions && etCfg && etCfg.rate) {
                console.error('payrollService: skipping heuristic baseForDeductions for non-monthly employeeType.rate to avoid false non-zero deductions');
                baseForDeductions = 0;
            }
            baseForDeductions = Number(baseForDeductions || 0);
            
            // Try employee-specific PhilHealth amount first
            if (employeeData.philAmount !== undefined) {
                const value = Number(employeeData.philAmount);
                const isPercentage = employeeData.philIsPercentage === true;
                return isPercentage ? (baseForDeductions * (value / 100)) : value;
            }
            
            // Try existing PhilHealth deduction record
            const employeeShare = getNestedValue(employeeData, 'deductions.PhilHealth.employee_share_amount') ||
                                getNestedValue(employeeData, 'deductions.PhilHealth.employee_share');
            if (employeeShare) {
                const value = Number(employeeShare);
                const isPercentage = getNestedValue(employeeData, 'deductions.PhilHealth.isPercentage') === true;
                return isPercentage ? (baseForDeductions * (value / 100)) : value;
            }
            
            // Use standardDeductions from employeeType config
            if (etCfg && etCfg.standardDeductions && (etCfg.standardDeductions.philHealth || etCfg.standardDeductions.philhealth)) {
                const cfg = etCfg.standardDeductions.philHealth || etCfg.standardDeductions.philhealth;
                const value = Number((cfg && (cfg.value !== undefined ? cfg.value : cfg)) || 0);
                const isPercentage = cfg && cfg.isPercentage !== false ? true : false;
                const result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                console.debug('PhilHealth from standardDeductions:', { cfg, value, isPercentage, baseForDeductions, result });
                return result;
            }
            
            return 0;
        };

        const computePagibigAmount = () => {
            const etCfg = employeeData.employeeType;
            
            // Determine base for percentage conversion
            // For monthly employees, NEVER use the rate heuristic - use baseEarnings only
            const isMonthlyEmployee = etCfg && String(etCfg.salaryType).toLowerCase() === 'monthly';
            
            if (isMonthlyEmployee) {
                let baseForDeductions = Number(baseEarnings || 0);
                
                // Try employee-specific Pag-IBIG amount first
                if (employeeData.pagibigAmount !== undefined) {
                    const value = Number(employeeData.pagibigAmount);
                    const isPercentage = employeeData.pagibigIsPercentage === true;
                    return isPercentage ? (baseForDeductions * (value / 100)) : value;
                }
                
                // Try existing Pag-IBIG deduction record
                const employeeShare = getNestedValue(employeeData, 'deductions.PagIBIG.employee_share_amount') ||
                                    getNestedValue(employeeData, 'deductions.PagIBIG.employee_share');
                if (employeeShare) {
                    const value = Number(employeeShare);
                    const isPercentage = getNestedValue(employeeData, 'deductions.PagIBIG.isPercentage') === true;
                    return isPercentage ? (baseForDeductions * (value / 100)) : value;
                }
                
                // Use standardDeductions from employeeType config
                if (etCfg && etCfg.standardDeductions && (etCfg.standardDeductions.pagIbig || etCfg.standardDeductions.pagibig)) {
                    const cfg = etCfg.standardDeductions.pagIbig || etCfg.standardDeductions.pagibig;
                    const value = Number((cfg && (cfg.value !== undefined ? cfg.value : cfg)) || 0);
                    const isPercentage = cfg && cfg.isPercentage !== false ? true : false;
                    let result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                    // PagIBIG has a cap of ₱100
                    result = Math.min(result, 100);
                    console.debug('PagIBIG from standardDeductions:', { cfg, value, isPercentage, baseForDeductions, result, capped: result === 100 });
                    return result;
                }
                
                // For monthly: return 0 if no deduction found
                return 0;
            }
            
            // For non-monthly (hourly/daily), use baseEarnings or apply heuristic
            let baseForDeductions = Number(baseEarnings || computedGross || employeeData.salaryRate || 0);
            
            // If no base yet, use heuristic based on salary type (non-monthly only)
            if (!baseForDeductions && etCfg && etCfg.rate) {
                const rate = Number(etCfg.rate || 0);
                const salaryType = (etCfg.salaryType || '').toLowerCase();
                const expectedDailyHours = Number(employeeData.salaryInfo?.expectedDailyHours || etCfg.expectedDailyHours || 8);
                switch (salaryType) {
                    case 'daily': baseForDeductions = rate * 22; break;
                    case 'hourly': baseForDeductions = rate * expectedDailyHours * 22; break;
                    default: baseForDeductions = rate;
                }
            }
            baseForDeductions = Number(baseForDeductions || 0);
            
            // Try employee-specific Pag-IBIG amount first
            if (employeeData.pagibigAmount !== undefined) {
                const value = Number(employeeData.pagibigAmount);
                const isPercentage = employeeData.pagibigIsPercentage === true;
                return isPercentage ? (baseForDeductions * (value / 100)) : value;
            }
            
            // Try existing Pag-IBIG deduction record
            const employeeShare = getNestedValue(employeeData, 'deductions.PagIBIG.employee_share_amount') ||
                                getNestedValue(employeeData, 'deductions.PagIBIG.employee_share');
            if (employeeShare) {
                const value = Number(employeeShare);
                const isPercentage = getNestedValue(employeeData, 'deductions.PagIBIG.isPercentage') === true;
                return isPercentage ? (baseForDeductions * (value / 100)) : value;
            }
            
            // Use standardDeductions from employeeType config
            if (etCfg && etCfg.standardDeductions && (etCfg.standardDeductions.pagIbig || etCfg.standardDeductions.pagibig)) {
                const cfg = etCfg.standardDeductions.pagIbig || etCfg.standardDeductions.pagibig;
                const value = Number((cfg && (cfg.value !== undefined ? cfg.value : cfg)) || 0);
                const isPercentage = cfg && cfg.isPercentage !== false ? true : false;
                let result = isPercentage ? (baseForDeductions * (value / 100)) : value;
                // PagIBIG has a cap of ₱100
                result = Math.min(result, 100);
                console.debug('PagIBIG from standardDeductions:', { cfg, value, isPercentage, baseForDeductions, result, capped: result === 100 });
                return result;
            }
            
            return 0;
        };

        // If this employee is hourly/part-time, compute grossSalary from attendance hours
    let computedGross = Number(grossSalary || 0);
    let summaryHours = { totalHours: 0, totalOvertimeHours: 0, lateCount: 0 };
    let baseEarnings = 0;
    let overtimeEarnings = 0;
    let totalLateDeductions = 0;

        // Determine if hourly: prefer explicit salaryInfo.salaryType, then employeeTypes lookup
        const salaryInfo = employeeData.salaryInfo || {};
        let isHourly = (salaryInfo.salaryType && String(salaryInfo.salaryType).toLowerCase() === 'hourly');
        // Use employeeType already fetched in getEmployeePayrollData (avoids duplicate Firebase call)
        let employeeTypeCfg = employeeData.employeeType || null;
        
        if (!employeeTypeCfg) {
            console.error('❌ employeeTypeCfg is NULL or undefined for userId:', userId);
            throw new Error(`Employee type configuration is missing for user ${userId}`);
        }
        
        // Ensure employeeTypeCfg has a valid salaryType (fallback to 'monthly' if missing)
        if (!employeeTypeCfg.salaryType) {
            console.warn('⚠️ employeeTypeCfg.salaryType is missing, defaulting to monthly');
            employeeTypeCfg.salaryType = 'monthly';
        }        console.debug('Employee salary type detection:', {
            salaryInfoType: salaryInfo.salaryType,
            employeeTypeCfg: employeeTypeCfg ? {
                name: employeeTypeCfg.name,
                salaryType: employeeTypeCfg.salaryType,
                rate: employeeTypeCfg.rate,
                overtimeRate: employeeTypeCfg.overtimeRate,
                lateDeduction: employeeTypeCfg.lateDeduction,
                standardAdditions: Object.keys(employeeTypeCfg.standardAdditions || {})
            } : 'NULL',
            isHourly,
            employeeDataSalaryRate: employeeData.salaryRate
        });
        
        if (employeeTypeCfg && employeeTypeCfg.salaryType && String(employeeTypeCfg.salaryType).toLowerCase() === 'hourly') {
            isHourly = true;
        }

        if (isHourly) {
            // gather rates from salaryInfo then fallback to employeeTypeCfg
            const baseRate = Number(salaryInfo.rate || salaryInfo.salaryRate || (employeeTypeCfg && employeeTypeCfg.rate) || employeeData.salaryRate || 0);
            
            // Fetch overtimeRate from Firebase employeeTypeCfg (no fallback to 1.25x)
            let overtimeRate = 0;
            if (employeeTypeCfg && employeeTypeCfg.overtimeRate) {
                if (typeof employeeTypeCfg.overtimeRate === 'number') {
                    overtimeRate = Number(employeeTypeCfg.overtimeRate);
                } else if (employeeTypeCfg.overtimeRate.isPercentage) {
                    // If percentage (e.g., 125%), apply to baseRate
                    overtimeRate = Math.round(baseRate * (Number(employeeTypeCfg.overtimeRate.value || 0) / 100) * 100) / 100;
                } else {
                    overtimeRate = Number(employeeTypeCfg.overtimeRate.value || 0);
                }
            }
            
            const lateDeduction = Number(salaryInfo.lateDeduction || (employeeTypeCfg && employeeTypeCfg.lateDeduction) || 0);
            // Only use expectedDailyHours if provided by Firebase (salaryInfo or employeeTypeCfg)
            const expectedDailyHours = (salaryInfo && salaryInfo.expectedDailyHours !== undefined)
                ? Number(salaryInfo.expectedDailyHours)
                : (employeeTypeCfg && employeeTypeCfg.expectedDailyHours !== undefined ? Number(employeeTypeCfg.expectedDailyHours) : undefined);

            // Fetch working days per month from payroll_config/current/recurrence/days — do NOT default to 22
            let workingDaysPerMonth; // undefined unless found in Firebase
            try {
                const payrollConfigSnap = await get(ref(database, dbRef('payroll_config/current')));
                if (payrollConfigSnap.exists()) {
                    const config = payrollConfigSnap.val();
                    if (config?.recurrence?.days && Array.isArray(config.recurrence.days)) {
                        workingDaysPerMonth = config.recurrence.days.length || undefined;
                    }
                }
            } catch (e) {
                // use default
            }
            
            // Fetch hours per day from user's schedule — do NOT default to 8
            let hoursPerDay; // undefined unless we can calculate from schedule
            try {
                if (employeeData?.roleData?.schedule?.weekly && Array.isArray(employeeData.roleData.schedule.weekly)) {
                    const firstWorkDay = employeeData.roleData.schedule.weekly.find(day => day && day.length > 0);
                    if (firstWorkDay && firstWorkDay[0]?.startTime && firstWorkDay[0]?.endTime) {
                        const [startHour, startMin] = firstWorkDay[0].startTime.split(':').map(Number);
                        const [endHour, endMin] = firstWorkDay[0].endTime.split(':').map(Number);
                        hoursPerDay = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) / 60;
                    }
                }
            } catch (e) {
                // use default
            }

            // Fetch flattened attendance records and pair them into daily rows
            let attendance = [];
            try {
                attendance = await firebaseService.getAttendance();
            } catch (e) {
                attendance = [];
            }

            // Fetch user's schedule (if any) so we can compute schedule-aware overtime
            let scheduleObj = null;
            try {
                // Prefer employeeData.userId, fallback to facultyId or id
                const scheduleId = employeeData.userId || employeeData.facultyId || employeeData.id || userId;
                scheduleObj = await scheduleService.getSchedule(scheduleId);
                // Make schedule fetch visibility explicit: warn when no schedule found
                if (scheduleObj) {
                    console.debug('[payrollService] fetched scheduleObj for', scheduleId, scheduleObj);
                } else {
                    console.error('[payrollService] NO schedule found for', scheduleId, '- scheduleObj is null; attempting fallback search across schedules');
                    
                    // Fallback 1: Check if schedule is embedded in employeeData.roleData.schedule
                    console.error('[payrollService] DEBUG Fallback 1: employeeData keys:', Object.keys(employeeData));
                    console.error('[payrollService] DEBUG: employeeData.roleData:', employeeData?.roleData);
                    console.error('[payrollService] DEBUG: employeeData.roleData.schedule:', employeeData?.roleData?.schedule);
                    if (employeeData?.roleData?.schedule) {
                        scheduleObj = employeeData.roleData.schedule;
                        console.debug('[payrollService] fallback: found schedule in employeeData.roleData.schedule:', scheduleObj);
                    } else {
                        // Fallback 2: search all schedules to find a match using alternate candidate keys
                        try {
                            const candidates = [String(employeeData.userId || ''), String(employeeData.facultyId || ''), String(employeeData.id || ''), String(userId || '')].filter(Boolean);
                            const allSchedules = await scheduleService.getStaffSchedules();
                            const match = (allSchedules || []).find(s => candidates.includes(String(s.userId)));
                            if (match) {
                                // match contains { userId, ...schedule }
                                scheduleObj = match;
                                console.debug('[payrollService] fallback: found schedule via getStaffSchedules for', match.userId, match);
                            } else {
                                console.error('[payrollService] fallback: no schedule found among all schedules for candidates', candidates);
                            }
                        } catch (e2) {
                            console.error('[payrollService] fallback schedule search failed:', e2);
                        }
                    }
                }
            } catch (e) {
                scheduleObj = null;
            }

            // Determine period date range if provided
            let periodStart = null;
            let periodEnd = null;
            if (period && typeof period === 'string' && /^\d{4}-\d{2}$/.test(period)) {
                const [y, m] = period.split('-').map(Number);
                periodStart = new Date(y, m - 1, 1);
                periodEnd = new Date(y, m, 0); // last day of month
            }

            // Filter attendance to period and to this user (match userId, facultyId or id)
            const uidCandidates = new Set([String(employeeData.userId || ''), String(employeeData.facultyId || ''), String(employeeData.id || '')].filter(Boolean));
            
            console.debug('Attendance filtering:', {
                uidCandidates: Array.from(uidCandidates),
                totalRecords: attendance.length,
                sampleRecords: attendance.slice(0, 3).map(a => ({
                    userId: a.userId,
                    facultyId: a.facultyId,
                    id: a.id,
                    date: a.date || a.check_in || a.rawTimestamp,
                    hours: a.hours
                }))
            });
            
            const filtered = attendance.filter(a => {
                try {
                    const uid = String(a.userId || a.facultyId || a.id || '');
                    if (!uidCandidates.has(uid)) return false;
                        // Include all attendance records - payroll config date ranges will filter the actual period
                        return true;
                } catch (e) { return false; }
            });

            const paired = pairAttendanceRecords(filtered);
            // If there are no paired attendance records for this employee in the period,
            // treat this as a new/inactive employee and return a zero-earnings payroll
            // to avoid applying heuristic additions/deductions that rely on attendance.
            if (!paired || paired.length === 0) {
                console.warn(`[payrollService] No paired attendance records for ${userId} — returning zero payroll for period ${period}`);
                const zeroPayroll = {
                    userId,
                    period,
                    grossSalary: 0,
                    zeroAttendance: true,
                    breakdown: {
                        baseSalary: 0,
                        overtimeEarnings: 0,
                        serviceCredits: 0,
                        statutory: { sss: 0, philhealth: 0, pagibig: 0 },
                        totalDeductions: 0,
                        totalAllowances: 0
                    },
                    netSalary: 0,
                    deductions: { sss: 0, philhealth: 0, pagibig: 0, tax: 0, lateDeductions: 0, lateDeduction: 0, total: 0 },
                    allowances: { total: 0 },
                    additions: { total: 0 },
                    additionsBreakdown: {},
                    customFields: {},
                    employeeInfo: {
                        name: employeeData.name || 'Unknown',
                        facultyId: employeeData.facultyId || userId,
                        salaryInfo: employeeData.salaryInfo || {},
                        department: employeeData.department || '',
                        position: employeeData.position || ''
                    },
                    timestamp: new Date().toISOString(),
                    message: 'No attendance records for this period - showing zero payroll'
                };
                return zeroPayroll;
            }
            // Compute total night hours (22:00 - 06:00) across paired records for this user.
            // Night shift is 22:00 on day N to 06:00 on day N+1 (next day morning)
            const computeNightHoursForPair = (checkInIso, checkOutIso) => {
                try {
                    if (!checkInIso || !checkOutIso) return 0;
                    const inDt = new Date(checkInIso);
                    const outDt = new Date(checkOutIso);
                    if (!(inDt && outDt && !isNaN(inDt.getTime()) && !isNaN(outDt.getTime()))) return 0;

                    // Ensure outDt is after inDt
                    if (outDt <= inDt) return 0;

                    // Night window: 22:00 on day N to 06:00 on day N+1 (local time)
                    let totalNightMs = 0;

                    // Start iterating from the date-part of inDt to cover every night window that may overlap
                    const cur = new Date(inDt);
                    cur.setHours(0, 0, 0, 0);

                    // Iterate by day until we've covered outDt
                    while (cur < outDt) {
                        // Night window for this 'cur' day: [cur@22:00, nextDay@06:00]
                        const windowStart = new Date(cur);
                        windowStart.setHours(22, 0, 0, 0);
                        const windowEnd = new Date(cur);
                        windowEnd.setDate(windowEnd.getDate() + 1);
                        windowEnd.setHours(6, 0, 0, 0);

                        const overlapStart = inDt > windowStart ? inDt : windowStart;
                        const overlapEnd = outDt < windowEnd ? outDt : windowEnd;

                        if (overlapEnd > overlapStart) {
                            totalNightMs += (overlapEnd.getTime() - overlapStart.getTime());
                        }

                        // move to next day
                        cur.setDate(cur.getDate() + 1);
                    }

                    const totalNightHours = Math.round((totalNightMs / (1000 * 60 * 60)) * 100) / 100;
                    console.debug('[NIGHT_HOURS] computeNightHoursForPair:', { checkInIso, checkOutIso, totalNightHours });
                    return Math.max(0, totalNightHours);
                } catch (e) {
                    console.error('[NIGHT_HOURS] ERROR:', e);
                    return 0;
                }
            };

            let totalNightHours = 0;
            try {
                (paired || []).forEach(p => {
                    totalNightHours += computeNightHoursForPair(p.checkIn, p.checkOut || (p.checkIn ? new Date(p.checkIn).toISOString() : null));
                });
                totalNightHours = Math.round((totalNightHours || 0) * 100) / 100;
                console.debug('[NIGHT_HOURS] AGGREGATE TOTAL:', { totalNightHours, pairsCount: (paired || []).length });
            } catch (e) { 
                console.error('[NIGHT_HOURS] AGGREGATE ERROR:', e);
                totalNightHours = 0; 
            }
            
            // Debug: log what we're working with
            console.debug('Hourly calculation debug:', {
                userId: employeeData.userId,
                facultyId: employeeData.facultyId,
                period,
                periodStart,
                periodEnd,
                baseRate,
                overtimeRate,
                totalAttendanceRecords: attendance.length,
                filteredAttendanceRecords: filtered.length,
                pairedRecords: paired.length,
                uidCandidates: Array.from(uidCandidates)
            });
            
            const hourlyResult = computeHourlyEarnings(paired, {
                baseRate,
                overtimeRate,
                lateDeduction,
                expectedDailyHours,
                schedule: scheduleObj
            });

            console.debug('Hourly earnings result:', hourlyResult);

            computedGross = hourlyResult.computedGross;
            summaryHours = { totalHours: hourlyResult.totalHours, totalOvertimeHours: hourlyResult.totalOvertime, lateCount: hourlyResult.lateCount };
            baseEarnings = hourlyResult.baseEarnings;
            overtimeEarnings = hourlyResult.overtimeEarnings;
            totalLateDeductions = hourlyResult.totalLateDeductions;
        } else if (!isHourly && employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly') {
            // For monthly salary employees: calculate base pay based on days worked
            // Formula: Daily Rate = Monthly Rate ÷ 26, Base Pay = Daily Rate × Days Worked
            // If Days Worked = 0, then Base Pay = 0
            // Also calculate overtime and late deductions like hourly employees
            try {
                const monthlyRate = Number(employeeTypeCfg.rate || employeeData.salaryRate || 0);
                const workingDaysPerMonth = 26; // Working days per month
                const dailyRate = monthlyRate / workingDaysPerMonth;

                // Fetch attendance records for this employee in the payroll period
                let attendance = [];
                try {
                    attendance = await firebaseService.getAttendance();
                } catch (e) {
                    attendance = [];
                }

                // Filter attendance to this user
                const uidCandidates = new Set([String(employeeData.userId || ''), String(employeeData.facultyId || ''), String(employeeData.id || '')].filter(Boolean));
                const filtered = attendance.filter(a => {
                    try {
                        const uid = String(a.userId || a.facultyId || a.id || '');
                        return uidCandidates.has(uid);
                    } catch (e) { return false; }
                });

                // Determine period date range
                let periodStart = null;
                let periodEnd = null;
                if (period && typeof period === 'string' && /^\d{4}-\d{2}$/.test(period)) {
                    const [y, m] = period.split('-').map(Number);
                    periodStart = new Date(y, m - 1, 1);
                    periodEnd = new Date(y, m, 0);
                }

                // Pair attendance records to identify days with complete check-in/check-out
                const paired = pairAttendanceRecords(filtered);
                const datesWithAttendance = new Set();
                paired.forEach(p => {
                    if (p.checkIn && p.checkOut) {
                        const dateStr = new Date(p.checkIn).toISOString().slice(0, 10);
                        datesWithAttendance.add(dateStr);
                    }
                });

                // Count days worked (any day with complete check-in/check-out)
                let daysWorked = 0;
                if (periodStart && periodEnd) {
                    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
                        const dayOfWeek = d.getDay();
                        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Mon-Fri only
                            const dateStr = d.toISOString().slice(0, 10);
                            if (datesWithAttendance.has(dateStr)) {
                                daysWorked++;
                            }
                        }
                    }
                }

                // Calculate base pay: (Monthly Rate / 26) × Days Worked
                // If daysWorked = 0, then basePay = 0
                const basePay = dailyRate * daysWorked;

                // For monthly employees, also calculate overtime and late deductions using hourly computation
                // Use a calculated hourly rate based on monthly rate (assuming 8 hours/day, 26 days/month)
                const expectedDailyHours = Number((salaryInfo && salaryInfo.expectedDailyHours) || (employeeTypeCfg && employeeTypeCfg.expectedDailyHours) || 8);
                const monthlyHourlyRate = monthlyRate / (expectedDailyHours * workingDaysPerMonth);
                const overtimeRate = monthlyHourlyRate * 1.25; // 1.25x for overtime
                const lateDeduction = Number(employeeTypeCfg?.lateDeduction || employeeData.salaryInfo?.lateDeduction || 0);

                const monthlyHourlyResult = computeHourlyEarnings(paired, {
                    baseRate: monthlyHourlyRate,
                    overtimeRate,
                    lateDeduction,
                    expectedDailyHours,
                    schedule: null // Monthly employees don't use schedule info for overtime calculation
                });

                console.debug('[payrollService] Monthly base pay calculation:', {
                    employeeId: employeeData.userId || employeeData.facultyId,
                    monthlyRate,
                    dailyRate,
                    daysWorked,
                    basePay,
                    overtimeEarnings: monthlyHourlyResult.overtimeEarnings,
                    lateDeductions: monthlyHourlyResult.totalLateDeductions
                });

                computedGross = basePay;
                summaryHours = { totalHours: monthlyHourlyResult.totalHours, totalOvertimeHours: monthlyHourlyResult.totalOvertime, lateCount: monthlyHourlyResult.lateCount };
                baseEarnings = basePay;
                overtimeEarnings = monthlyHourlyResult.overtimeEarnings;
                totalLateDeductions = monthlyHourlyResult.totalLateDeductions;
            } catch (e) {
                console.error('[payrollService] Failed to calculate monthly base pay:', e);
            }
        }

        // Now compute deduction amounts (SSS/PhilHealth/PagIBIG) using computedGross and employeeType rules
        console.debug('[BEFORE deduction calls] computedGross:', computedGross, 'baseEarnings:', baseEarnings, 'employeeTypeCfg.rate:', employeeData.employeeType?.rate);
        const sssAmount = computeSssAmount();
        const philAmount = computePhilAmount();
        const pagibigAmount = computePagibigAmount();

        // Convert to numbers and ensure non-negative values
        const sssDed = Math.max(0, Number(sssAmount || 0));
        const philhealthDed = Math.max(0, Number(philAmount || 0));
        const pagibigDed = Math.max(0, Number(pagibigAmount || 0));

        // Debug logging for deduction calculation
        console.debug('Calculated deductions (AFTER calculations):', {
            computedGross,
            baseEarnings,
            employeeTypeCfgRate: employeeData.employeeType?.rate,
            sssAmount,
            philAmount,
            pagibigAmount,
            sssDed,
            philhealthDed,
            pagibigDed,
            employeeData: {
                id: employeeData.userId,
                name: employeeData.name,
                hasDeductions: !!employeeData.deductions
            }
        });

        // Calculate progressive tax based on tax bracket configuration
        const calculateProgressiveTax = (grossSalary, taxBracket) => {
            if (!taxBracket || !taxBracket.isProgressive) return 0;
            
            const salary = Number(grossSalary || 0);
            const rate = Number(taxBracket.rate || 0);
            const baseAmount = Number(taxBracket.baseAmount || 0);
            const excessOver = Number(taxBracket.excessOver || 0);
            
            console.log('[TAX DEBUG] calculateProgressiveTax input:', { salary, rate, baseAmount, excessOver, isSalaryMoreThanExcess: salary > excessOver });
            
            if (salary <= excessOver || rate === 0) {
                console.log('[TAX DEBUG] Returning 0 - salary <= excessOver or rate === 0');
                return 0;
            }
            
            const excess = salary - excessOver;
            const taxAmount = baseAmount + (excess * (rate / 100));
            console.log('[TAX DEBUG] Calculated tax:', { excess, taxAmount });
            return Math.round(taxAmount * 100) / 100;
        };

        const trainTax = (() => {
            try {
                const taxBracket = employeeData.employeeType?.standardDeductions?.tax;
                console.log('[TAX DEBUG] Initial - taxBracket:', taxBracket, 'employeeTypeCfg:', employeeTypeCfg);
                
                if (!taxBracket || !taxBracket.isProgressive) {
                    console.log('[TAX DEBUG] No valid tax bracket, returning 0');
                    return 0;
                }
                
                // For monthly employees, use baseEarnings (actual pay based on days worked), NOT the configured monthly rate
                // For hourly employees, use computedGross
                let salaryForTaxCalc = computedGross;
                const isMonthly = employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly';
                
                if (isMonthly) {
                    // For monthly employees, use baseEarnings which is already computed based on days worked
                    salaryForTaxCalc = Number(baseEarnings || 0);
                    console.log('[TAX DEBUG] Monthly employee - using baseEarnings:', { 
                        baseEarnings,
                        configRate: employeeTypeCfg.rate,
                        salaryRate: employeeData.salaryRate,
                        computedGross,
                        selected: salaryForTaxCalc
                    });
                } else {
                    console.log('[TAX DEBUG] Hourly employee - using computedGross:', computedGross);
                }
                
                console.log('[TAX DEBUG] trainTax calculation:', { 
                    salaryType: employeeTypeCfg?.salaryType, 
                    salaryForTaxCalc, 
                    configRate: employeeTypeCfg?.rate,
                    computedGross,
                    baseEarnings,
                    isMonthly
                });
                
                return calculateProgressiveTax(salaryForTaxCalc, taxBracket);
            } catch (e) {
                console.warn('Failed to calculate progressive tax:', e);
                return 0;
            }
        })();
        const dhvsuTax = 0;

        // Calculate other deductions from Firebase, but exclude computed ones (SSS/PhilHealth/PagIBIG) 
        // and attendance-based late deductions which are recalculated each period
        const otherDeductionsTotal = Object.entries(employeeData.deductions || {}).reduce((sum, [k, v]) => {
            const lowerK = k.toLowerCase();
            if (['SSS','PhilHealth','PagIBIG','WithholdingTax'].includes(k) || lowerK.includes('late')) return sum;
            return sum + (Number(v) || 0);
        }, 0);

    const totalDeductions = sssDed + philhealthDed + pagibigDed + trainTax + dhvsuTax + otherDeductionsTotal + (Number(totalLateDeductions) || 0);

        const totalAllowances = Object.values(employeeData.allowances || {}).reduce((sum, val) => sum + (val || 0), 0);

        const serviceCredits = Number(employeeData.serviceCredits || 0);

    // Use computedGross (may be derived from attendance for hourly employees)
    const netSalary = computedGross - totalDeductions + totalAllowances + serviceCredits;

        const breakdown = {
            salaryRate: computedGross,
            statutory: {
                sss: sssDed,
                philhealth: philhealthDed,
                pagibig: pagibigDed,
                tax: Math.round((trainTax || 0) * 100) / 100
            },
            otherDeductions: otherDeductionsTotal,
            lateDeductions: Math.round((totalLateDeductions || 0) * 100) / 100,
            totalDeductions,
            totalAllowances,
            serviceCredits
        };

        // If hourly, include hour summary and earnings breakdown
        if (summaryHours && (summaryHours.totalHours || summaryHours.totalOvertimeHours)) {
            breakdown.hourly = {
                totalHours: summaryHours.totalHours,
                overtimeHours: summaryHours.totalOvertimeHours,
                baseEarnings: Math.round((baseEarnings || 0) * 100) / 100,
                overtimeEarnings: Math.round((overtimeEarnings || 0) * 100) / 100,
                lateDeductions: Math.round((totalLateDeductions || 0) * 100) / 100
            };
        }

        // For monthly employees, also include the breakdown
        if (!isHourly && employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly') {
            console.error('🟡🟡🟡 MONTHLY BREAKDOWN SECTION 🟡🟡🟡', {
                baseEarnings,
                overtimeEarnings,
                totalLateDeductions,
                computedGross,
                summaryHours
            });
            breakdown.monthly = {
                baseEarnings: Math.round((baseEarnings || 0) * 100) / 100,
                overtimeEarnings: Math.round((overtimeEarnings || 0) * 100) / 100,
                lateDeductions: Math.round((totalLateDeductions || 0) * 100) / 100
            };
        }

        // Compute additions and HR custom fields from employeeTypeCfg (respect applyMonths/period metadata)
        let additions = {};
        let totalAdditions = 0;
        let customFields = {};
        let totalCustomAdditions = 0;
        let totalCustomDeductions = 0;

        // Determine a sensible baseSalary for percentage-based standard additions:
        // For monthly: use baseEarnings (actual pay based on attendance), not the configured rate
        // For hourly: use baseEarnings (computed from attendance)
        const baseSalaryForAdditions = (() => {
            try {
                // For monthly: use baseEarnings (actual pay based on days worked), not the configured rate
                // This ensures that additions are proportional to actual attendance
                if (employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly') {
                    // Always use baseEarnings for monthly employees, which is computed from attendance
                    return Number(baseEarnings || 0);
                }
                // For hourly: prefer baseEarnings if computed from attendance; otherwise compute monthly equivalent
                if (employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'hourly') {
                    if (baseEarnings > 0) return Number(baseEarnings);
                    if (employeeData.salaryRate && Number(employeeData.salaryRate) > 0) return Number(employeeData.salaryRate);
                    const hourlyRate = Number((salaryInfo && (salaryInfo.rate || salaryInfo.salaryRate)) || (employeeTypeCfg && employeeTypeCfg.rate) || employeeData.salaryRate || 0);
                    const expectedDailyHours = Number((salaryInfo && salaryInfo.expectedDailyHours) || (employeeTypeCfg && employeeTypeCfg.expectedDailyHours) || 8);
                    return hourlyRate * expectedDailyHours * 22; // monthly equivalent
                }
                // For daily: use rate directly
                if (employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'daily') {
                    return Number(employeeTypeCfg.rate || computedGross || 0);
                }
                return Number(employeeTypeCfg?.rate || employeeData.salaryRate || baseEarnings || computedGross || 0);
            } catch (e) { return Number(computedGross || 0); }
        })();

        console.debug('Additions calculation debug:', {
            employeeTypeCfg: employeeTypeCfg ? { name: employeeTypeCfg.name, salaryType: employeeTypeCfg.salaryType, rate: employeeTypeCfg.rate } : null,
            computedGross,
            baseEarnings,
            baseSalaryForAdditions,
            employeeData: { salaryRate: employeeData.salaryRate, name: employeeData.name }
        });

            // temporary container for any per-date addition breakdowns
        let _additionsBreakdown = {};
        try {

            if (employeeTypeCfg && employeeTypeCfg.standardAdditions) {
                // Pre-fetch attendance only once if any applyDates exist (lazy)
                let attendanceCache = null;
                // helper: guess which addition keys are percentage-like when isPercentage is not provided
                const looksLikePercentageKeyLocal = (k) => /holiday|special|thirteenth|thirteenthmonth|thirteenth_month|night|differential|nd|overtime|ot|percent|rate/i.test(k);

                for (const [key, cfg] of Object.entries(employeeTypeCfg.standardAdditions)) {
                    try {
                        if (cfg == null) continue;

                        // If metadata present (months/period/range/dates) and does not apply, skip
                        // EXCEPT for holiday pay / special holiday pay which should be computed even without explicit dates
                        const isHolidayLike = /holiday|special/.test(String(key).toLowerCase());
                        if (typeof cfg === 'object' && (cfg.applyMonths || cfg.period || cfg.applyRange || cfg.applyDates)) {
                            if (!appliesToPeriod(period, cfg)) {
                                // For holidays without explicit dates, default to 0 (they may not apply)
                                // but still set the key so the UI knows it exists
                                if (isHolidayLike && !cfg.applyDates) {
                                    additions[key] = 0;
                                }
                                continue;
                            }
                        }

                        // If cfg has explicit applyDates array, compute per-date amounts and sum them
                        if (cfg && typeof cfg === 'object' && Array.isArray(cfg.applyDates) && cfg.applyDates.length > 0) {
                            // parse and filter dates that fall within the payroll period
                            const matchingDates = cfg.applyDates.map(d => {
                                try { return new Date(String(d)); } catch (e) { return null; }
                            }).filter(dt => dt && !isNaN(dt.getTime())).filter(dt => {
                                if (!period || typeof period !== 'string') return true;
                                try {
                                    const [y, m] = period.split('-').map(Number);
                                    return dt.getFullYear() === y && (dt.getMonth() + 1) === m;
                                } catch (e) { return true; }
                            });

                            if (matchingDates.length === 0) {
                                additions[key] = additions[key] || 0;
                                continue;
                            }

                            // Derive hourly and daily rates
                            const hourlyRate = (salaryInfo && String(salaryInfo.salaryType).toLowerCase() === 'hourly')
                                ? Number(salaryInfo.rate || salaryInfo.salaryRate || employeeTypeCfg.rate || employeeData.salaryRate || 0)
                                : (Number(baseSalaryForAdditions || 0) / (22 * 8)); // fallback: monthly->22 workdays
                            const dailyRate = Number(hourlyRate * 8);

                            // Special handling for holiday pay: use simple percentage (100% or 130%) per holiday date
                            const kLower = String(key || '').toLowerCase();
                            const isHolidayLike = kLower.includes('holiday');
                                if (isHolidayLike) {
                                // Get the percentage from cfg
                                let holidayPercent = 100; // default regular holiday
                                if (kLower.includes('special')) holidayPercent = 130; // special holiday
                                if (cfg && typeof cfg === 'object' && cfg.value !== undefined) {
                                    holidayPercent = Number(cfg.value || holidayPercent);
                                }

                                // For each holiday date: add (dailyRate × percentage)
                                const amountPerDate = Math.round((dailyRate * (holidayPercent / 100)) * 100) / 100;
                                const totalHolidayPay = Math.round((amountPerDate * matchingDates.length) * 100) / 100;
                                additions[key] = totalHolidayPay;

                                // DEBUG: record per-date hourly result so we can inspect discrepancies
                                try {
                                    console.debug('[HOLIDAY_CALC] key=', key, 'percent=', holidayPercent, 'dailyRate=', dailyRate, 'matchingDates=', matchingDates.length);
                                } catch (e) { /* ignore */ }

                                // Optionally track per-date breakdown
                                const breakdown = matchingDates.map(dt => ({
                                    date: dt.toISOString().slice(0, 10),
                                    amount: amountPerDate
                                }));
                                if (breakdown.length > 0) _additionsBreakdown[key] = breakdown;
                                // Also store a light debug structure to inspect attendance-based holiday calculations
                                try {
                                    _additionsBreakdown[`${key}_debug`] = matchingDates.map(dt => ({ date: dt.toISOString().slice(0,10), expectedDailyRate: amountPerDate }));
                                } catch (e) { }
                                continue;
                            }

                            // ensure attendance cache is available (for non-holiday applyDates)
                            if (!attendanceCache) {
                                try { attendanceCache = await firebaseService.getAttendance(); } catch (e) { attendanceCache = []; }
                            }

                            // For each date compute amount
                            const perDateRows = [];
                            for (const dt of matchingDates) {
                                const dateIso = dt.toISOString().slice(0,10);
                                // filter attendance entries for this user and this date
                                const uidCandidates = new Set([String(employeeData.userId || ''), String(employeeData.facultyId || ''), String(employeeData.id || '')].filter(Boolean));
                                const filtered = (attendanceCache || []).filter(a => {
                                    try {
                                        const uid = String(a.userId || a.facultyId || a.id || '');
                                        if (!uidCandidates.has(uid)) return false;
                                        // normalize date for attendance record
                                        const recDate = (a.date && String(a.date).slice(0,10)) || (a.rawTimestamp ? new Date(a.rawTimestamp).toISOString().slice(0,10) : null);
                                        return recDate === dateIso;
                                    } catch (e) { return false; }
                                });

                                // pair records and compute hours using existing helpers
                                const paired = pairAttendanceRecords(filtered);
                                const hourlyResult = computeHourlyEarnings(paired, {
                                    baseRate: hourlyRate,
                                    overtimeRate: Number(salaryInfo && (salaryInfo.overtimeRate || 0)) || Math.round(hourlyRate * 1.25 * 100) / 100,
                                    lateDeduction: Number(salaryInfo && (salaryInfo.lateDeduction || 0)) || 0,
                                    expectedDailyHours: Number(salaryInfo && (salaryInfo.expectedDailyHours || 8)) || 8,
                                    schedule: scheduleObj
                                });

                                const workedHours = Number(hourlyResult.totalHours || 0);
                                const overtimeHours = Number(hourlyResult.totalOvertime || 0);

                                // DEBUG: show per-date hourly computation used for holiday calculations
                                try {
                                    console.debug('[HOLIDAY_DATE_CALC]', { key, date: dateIso, workedHours, overtimeHours, hourlyRate, dailyRate, pairedCount: (paired || []).length });
                                } catch (e) { }

                                // Determine holiday type (regular vs special) using key name heuristics
                                const isRegular = kLower.includes('regular');
                                const isSpecial = kLower.includes('special');

                                let amountForDate = 0;
                                if (isRegular) {
                                    if (workedHours <= 0) {
                                        // Did not work: pay 100% daily rate
                                        amountForDate = dailyRate * 1.0;
                                    } else {
                                        // Worked: 200% for first 8 hours
                                        amountForDate = dailyRate * 2.0;
                                        // OT extra (if any) - paid at 1.3x hourly for OT hours
                                        if (overtimeHours > 0) amountForDate += overtimeHours * hourlyRate * 1.3;
                                    }
                                } else if (isSpecial) {
                                    if (workedHours <= 0) {
                                        // Did not work: default to 0 (company policy may vary)
                                        amountForDate = 0;
                                    } else {
                                        // Worked: 130% for first 8 hours
                                        amountForDate = dailyRate * 1.3;
                                        if (overtimeHours > 0) amountForDate += overtimeHours * hourlyRate * 1.3;
                                    }
                                } else {
                                            // Generic addition: interpret numbers/objects as percentage by default for known percentage-like keys
                                                const looksLikePercentageKeyLocal = (k) => /holiday|special|thirteenth|thirteenthmonth|thirteenth_month|night|differential|nd|overtime|ot|percent|rate/i.test(k);
                                                if (typeof cfg === 'number') {
                                                    // Special-case numeric 13th month configs: treat as 8.33% of accumulated basic pay
                                                    if (/thirteenth|13th/i.test(String(key))) {
                                                        // compute accumulated basic similar to the year-to-date logic below
                                                        let totalBasic_local = 0;
                                                        let monthsFound_local = 0;
                                                        try {
                                                            const payrollYear_local = (period && /^\d{4}-\d{2}$/.test(period)) ? Number(period.split('-')[0]) : (new Date()).getFullYear();
                                                            const currentMonth_local = (period && /^\d{4}-\d{2}$/.test(period)) ? Number(period.split('-')[1]) : ((new Date()).getMonth() + 1);
                                                            const lookupId_local = employeeData.userId || employeeData.facultyId || employeeData.id || userId;
                                                            for (let mi = 1; mi <= currentMonth_local; mi++) {
                                                                const monthKey_local = `${payrollYear_local}-${String(mi).padStart(2, '0')}`;
                                                                try {
                                                                    const snap_local = await get(ref(database, dbRef(`payroll/${monthKey_local}/${lookupId_local}`)));
                                                                    if (snap_local.exists()) {
                                                                        const val_local = snap_local.val();
                                                                        const basicFromRecord_local = Number((val_local && (val_local.basicPay || (val_local.breakdown && val_local.breakdown.baseSalary) || val_local.grossSalary)) || 0);
                                                                        if (basicFromRecord_local > 0) {
                                                                            totalBasic_local += basicFromRecord_local;
                                                                            monthsFound_local += 1;
                                                                        }
                                                                    }
                                                                } catch (e) { /* ignore per-month read errors */ }
                                                            }
                                                        } catch (e) { /* ignore */ }

                                        if (monthsFound_local === 0) {
                                            const explicitMonthly_local = Number(employeeData.salaryRate || 0);
                                            if (explicitMonthly_local > 0) totalBasic_local = explicitMonthly_local;
                                            else if (isHourly && baseEarnings > 0) totalBasic_local = Number(baseEarnings || 0);
                                            else if (isHourly) {
                                                const hourlyRate_local = Number((salaryInfo && (salaryInfo.rate || salaryInfo.salaryRate)) || (employeeTypeCfg && employeeTypeCfg.rate) || employeeData.salaryRate || 0);
                                                const expectedDailyHours_local = Number((salaryInfo && salaryInfo.expectedDailyHours) || (employeeTypeCfg && employeeTypeCfg.expectedDailyHours) || 8);
                                                const monthlyEquivalent_local = hourlyRate_local * expectedDailyHours_local * 22;
                                                totalBasic_local = Number(monthlyEquivalent_local || baseSalaryForAdditions || 0);
                                            } else {
                                                // For non-hourly (monthly): use baseEarnings (actual attendance-based pay), not the configured rate
                                                totalBasic_local = Number(baseEarnings || 0);
                                            }
                                            totalBasic_local = Number(totalBasic_local || 0);
                                        }                                                        // Fetch 13th month percentage from Firebase config
                                                        const thirteenthMonthPercent = (cfg && typeof cfg.value === 'number') ? (Number(cfg.value || 0) / 100) : 0.0833;
                                                        amountForDate = Math.round((totalBasic_local * thirteenthMonthPercent) * 100) / 100;
                                                    } else {
                                                        amountForDate = (baseSalaryForAdditions * Number(cfg || 0)) / 100;
                                                    }
                                                } else if (cfg && typeof cfg.value === 'number') {
                                                    const assumePercent = (cfg.isPercentage === undefined) && looksLikePercentageKeyLocal(key);
                                                    if (cfg.isPercentage || assumePercent) amountForDate = (baseSalaryForAdditions * Number(cfg.value || 0)) / 100;
                                                    else amountForDate = Number(cfg.value || 0);
                                                } else {
                                                    amountForDate = 0;
                                                }
                                }

                                perDateRows.push({ date: dateIso, amount: Math.round((amountForDate || 0) * 100) / 100 });
                            }

                            // sum per-date amounts
                            const totalForKey = perDateRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                            additions[key] = Math.round(totalForKey * 100) / 100;
                            if (perDateRows.length > 0) _additionsBreakdown[key] = perDateRows;
                            continue;
                        }

                        // Legacy/standard handling when no applyDates: treat primitive numbers as percentages
                        // For holiday-like keys, require explicit applyDates. If dates were removed, do NOT compute value.
                        if (isHolidayLike) {
                            // If cfg is an object but has no applyDates, or cfg is a primitive number (legacy),
                            // do not assume a holiday pay — set to 0.
                            if (typeof cfg === 'number' || (cfg && typeof cfg === 'object' && !Array.isArray(cfg.applyDates) && !cfg.applyDates)) {
                                additions[key] = 0;
                                continue;
                            }
                        }

                        if (typeof cfg === 'number') {
                            additions[key] = (baseSalaryForAdditions * Number(cfg || 0)) / 100;
                        } else if (cfg && typeof cfg.value === 'number') {
                            // Special handling for 13th month: always divide by 12, never percentage
                            if (key === 'thirteenthMonth' || /thirteenth|13th/i.test(String(key))) {
                                additions[key] = isHourly ? (baseEarnings / 12) : (baseSalaryForAdditions / 12);
                            } else {
                                const assumePercentLegacy = (cfg.isPercentage === undefined) && looksLikePercentageKeyLocal(key);
                                if (cfg.isPercentage || assumePercentLegacy) additions[key] = (baseSalaryForAdditions * Number(cfg.value || 0)) / 100;
                                else additions[key] = Number(cfg.value || 0);
                            }
                        } else if (cfg === true || (cfg && cfg.value === undefined && cfg.isPercentage === undefined)) {
                            switch (key) {
                                case 'thirteenthMonth': 
                                    // For hourly: 13th month = actual month's base earnings / 12
                                    // For monthly: 13th month = annual salary / 12
                                    additions[key] = isHourly ? (baseEarnings / 12) : (baseSalaryForAdditions / 12); 
                                    break;
                                case 'regularHolidayPay':
                                case 'holidayPay':
                                    // If there are no explicit applyDates for holiday configs, DO NOT assume a default day pay.
                                    // Previously this fallback produced large unexpected values when baseSalaryForAdditions
                                    // was estimated by heuristics. Instead, default to 0 and require explicit dates.
                                    console.debug('[HOLIDAY DEFAULT SKIP] No applyDates - setting holiday pay to 0 for key:', key);
                                    additions[key] = 0;
                                    break;
                                case 'specialHolidayPay':
                                    // If there are no explicit applyDates for special holiday configs, DO NOT assume a default day pay.
                                    // Previously this fallback produced large unexpected values when baseSalaryForAdditions
                                    // was estimated by heuristics. Instead, default to 0 and require explicit dates.
                                    console.debug('[SPECIAL HOLIDAY DEFAULT SKIP] No applyDates - setting special holiday pay to 0 for key:', key);
                                    additions[key] = 0;
                                    break;
                                case 'nightDifferential': 
                                    // Night differential: only include if the employee actually worked night hours
                                    // totalNightHours is computed earlier across paired attendance for this user
                                    try {
                                        if (!totalNightHours || totalNightHours <= 0) {
                                            additions[key] = 0;
                                        } else {
                                            // derive hourly rate to compute peso value for night differential
                                            const hourlyRate = (salaryInfo && String(salaryInfo.salaryType).toLowerCase() === 'hourly')
                                                ? Number(salaryInfo.rate || salaryInfo.salaryRate || employeeTypeCfg.rate || employeeData.salaryRate || 0)
                                                : (Number(baseSalaryForAdditions || 0) / (22 * 8));

                                            // cfg not providing a value here implies percentage default configured in employee type
                                            let ndAmount = 0;
                                            if (typeof cfg === 'number') {
                                                // treat as percentage
                                                ndAmount = (hourlyRate * totalNightHours) * (Number(cfg) / 100);
                                            } else if (cfg && typeof cfg.value === 'number') {
                                                const assumePercent = (cfg.isPercentage === undefined) && looksLikePercentageKeyLocal(key);
                                                if (cfg.isPercentage || assumePercent) ndAmount = (hourlyRate * totalNightHours) * (Number(cfg.value) / 100);
                                                else ndAmount = Number(cfg.value || 0);
                                            } else {
                                                // default: if employeeTypeCfg has a numeric default (e.g., 10 -> 10%), use it
                                                const defaultVal = (employeeTypeCfg.standardAdditions && employeeTypeCfg.standardAdditions.nightDifferential) || 0;
                                                const percent = (typeof defaultVal === 'number') ? defaultVal : (defaultVal && defaultVal.value ? Number(defaultVal.value) : 0);
                                                if (percent > 0) ndAmount = (hourlyRate * totalNightHours) * (percent / 100);
                                            }

                                            additions[key] = Math.round((ndAmount || 0) * 100) / 100;
                                            _additionsBreakdown[key] = [{ date: period, hours: totalNightHours, amount: additions[key] }];
                                        }
                                    } catch (e) { additions[key] = 0; }
                                    break;
                                case 'serviceCredits': additions[key] = serviceCredits; break;
                                case 'bonus': 
                                    // For monthly employees with zero base pay, bonus should be 0
                                    if (!isHourly && employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly' && baseEarnings === 0) {
                                        additions[key] = 0;
                                    } else {
                                        additions[key] = 2000;
                                    }
                                    break;
                                default: additions[key] = 0;
                            }
                        } else {
                            // For object-type configs without value/isPercentage (e.g., applyDates-based), default to 0
                            // unless it's a holiday type, in which case provide a placeholder
                            const kLower = String(key || '').toLowerCase();
                            if (kLower.includes('holiday') || kLower.includes('special')) {
                                const hourlyRateFallback = (salaryInfo && String(salaryInfo.salaryType).toLowerCase() === 'hourly')
                                    ? Number(salaryInfo.rate || salaryInfo.salaryRate || employeeTypeCfg.rate || employeeData.salaryRate || 0)
                                    : (Number(baseSalaryForAdditions || 0) / (22 * 8));
                                additions[key] = Math.round((hourlyRateFallback * 8) * 100) / 100; // 1 day placeholder
                            } else {
                                additions[key] = 0;
                            }
                        }
                    } catch (e) { additions[key] = additions[key] || 0; }
                }

                // attach breakdown if any (stored in _additionsBreakdown)
                if (Object.keys(_additionsBreakdown).length > 0) {
                    // will be appended to result later
                }
            }

            if (employeeTypeCfg && employeeTypeCfg.customFields) {
                Object.entries(employeeTypeCfg.customFields).forEach(([key, field]) => {
                    try {
                        if (!field) return;
                        if (typeof field === 'object' && (field.applyMonths || field.period || field.applyRange || field.applyDates)) {
                            if (!appliesToPeriod(period, field)) return;
                        }
                        // For custom deductions, use baseEarnings (canonical base pay) for percentage calculations.
                        // For custom additions, use computedGross (includes overtime/allowances).
                        const baseForCustom = (field.type === 'deduction' && field.isPercentage) ? baseEarnings : computedGross;
                        const value = field.isPercentage ? (baseForCustom * (field.value / 100)) : Number(field.value);
                        customFields[key] = { type: field.type, value };
                        if (field.type === 'addition') totalCustomAdditions += value;
                        if (field.type === 'deduction') totalCustomDeductions += value;
                    } catch (e) { /* ignore individual field errors */ }
                });
            }
        } catch (e) {
            console.warn('Failed to compute additions/customFields for employeeType:', e);
        }

        // Ensure 13th month addition is present as a computed PESO amount when configured
        try {
            if (employeeTypeCfg && employeeTypeCfg.standardAdditions) {
                const std = employeeTypeCfg.standardAdditions || {};
                // find any key that looks like thirteenth month
                for (const key of Object.keys(std)) {
                    if (/thirteenth|13th/i.test(String(key))) {
                        const cfg = std[key];
                        // determine base used for additions (reuse previously computed baseSalaryForAdditions if available)
                        // For monthly employees: ALWAYS use baseEarnings (actual attendance-based pay)
                        // For hourly employees: use baseEarnings or computed monthly equivalent
                        // For other types: use baseSalaryForAdditions
                        const isMonthlyEmployee = employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly';
                        let baseForAdd = isMonthlyEmployee 
                            ? Number(baseEarnings || 0)
                            : (typeof baseSalaryForAdditions !== 'undefined' ? Number(baseSalaryForAdditions || 0) : Number(computedGross || (breakdown && breakdown.baseSalary) || employeeTypeCfg.rate || employeeData.salaryRate || 0));
                        if (!baseForAdd && employeeTypeCfg && employeeTypeCfg.rate && !isMonthlyEmployee) {
                            const rate = Number(employeeTypeCfg.rate || 0);
                            const salaryType = (employeeTypeCfg.salaryType || '').toLowerCase();
                            const expectedDailyHours = Number(employeeData.salaryInfo?.expectedDailyHours || employeeTypeCfg.expectedDailyHours || 8);
                            switch (salaryType) {
                                case 'monthly': baseForAdd = rate; break;
                                case 'daily': baseForAdd = rate * 22; break;
                                case 'hourly': baseForAdd = rate * expectedDailyHours * 22; break;
                                default: baseForAdd = rate;
                            }
                        }
                        baseForAdd = Number(baseForAdd || 0);

                        let computedValue = null;
                        if (cfg === true) {
                            // 13th month: compute as 8.33% of total basic pay earned for the year-to-date (Jan -> current period month)
                            // Attempt to sum existing saved payroll records for this user for the year up to the current period month.
                            let totalBasic = 0;
                            let monthsFound = 0;
                            try {
                                const payrollYear = (period && /^\d{4}-\d{2}$/.test(period)) ? Number(period.split('-')[0]) : (new Date()).getFullYear();
                                const currentMonth = (period && /^\d{4}-\d{2}$/.test(period)) ? Number(period.split('-')[1]) : ((new Date()).getMonth() + 1);
                                const lookupId = employeeData.userId || employeeData.facultyId || employeeData.id || userId;
                                for (let mi = 1; mi <= currentMonth; mi++) {
                                    const monthKey = `${payrollYear}-${String(mi).padStart(2, '0')}`;
                                    try {
                                        const snap = await get(ref(database, dbRef(`payroll/${monthKey}/${lookupId}`)));
                                        if (snap.exists()) {
                                            const val = snap.val();
                                            const basicFromRecord = Number((val && (val.basicPay || (val.breakdown && val.breakdown.baseSalary) || val.grossSalary)) || 0);
                                            if (basicFromRecord > 0) {
                                                totalBasic += basicFromRecord;
                                                monthsFound += 1;
                                            }
                                        }
                                    } catch (e) {
                                        // ignore per-month read errors
                                    }
                                }
                            } catch (e) {
                                // ignore lookup errors and fallback below
                            }

                            if (monthsFound === 0) {
                                // No prior payroll records found: fall back to a sensible monthly basic.
                                // Prefer computed baseEarnings for this period (actual attendance-derived base),
                                // then prefer an explicit stored monthly salary if available (employeeData.salaryRate),
                                // then for hourly employees compute a monthly equivalent using expected daily hours * 22 working days,
                                // and finally fall back to baseForAdd.
                                if (isHourly && baseEarnings > 0) {
                                    totalBasic = Number(baseEarnings || 0);
                                } else if (isHourly) {
                                    const hourlyRate = Number((salaryInfo && (salaryInfo.rate || salaryInfo.salaryRate)) || (employeeTypeCfg && employeeTypeCfg.rate) || employeeData.salaryRate || 0);
                                    const expectedDailyHours = Number((salaryInfo && salaryInfo.expectedDailyHours) || (employeeTypeCfg && employeeTypeCfg.expectedDailyHours) || 8);
                                    const monthlyEquivalent = hourlyRate * expectedDailyHours * 22;
                                    totalBasic = Number(monthlyEquivalent || baseForAdd || 0);
                                } else {
                                    // For non-hourly (monthly): use baseEarnings (actual attendance-based pay), not the configured rate
                                    totalBasic = Number(baseEarnings || 0);
                                }
                                totalBasic = Number(totalBasic || 0);
                            }

                            // Fetch 13th month percentage from Firebase config
                            const thirteenthMonthPercent = (cfg && typeof cfg.value === 'number') ? (Number(cfg.value || 0) / 100) : 0.0833;
                            computedValue = Math.round((totalBasic * thirteenthMonthPercent) * 100) / 100;
                        } else if (typeof cfg === 'number') {
                            // numeric config: if <=100 treat as percentage of baseForAdd
                            if (cfg > 0 && cfg <= 100 && baseForAdd > 0) computedValue = (baseForAdd * cfg) / 100;
                            else computedValue = Number(cfg) || 0;
                        } else if (cfg && typeof cfg === 'object') {
                            const v = cfg.value !== undefined ? Number(cfg.value) : undefined;
                            const isPerc = cfg.isPercentage === true || cfg.isPercentage === 'true' || (v !== undefined && v > 0 && v <= 100);
                            if (v !== undefined) {
                                computedValue = (isPerc && baseForAdd > 0) ? (baseForAdd * v) / 100 : Number(v) || 0;
                            }
                        }

                        if (computedValue !== null && additions[key] === undefined) {
                            // Only set 13th month if not already computed in the main additions loop above
                            additions[key] = Math.round((Number(computedValue) || 0) * 100) / 100;
                        }
                        // If an addition was already present but stored as a percentage (e.g. 8.33),
                        // convert it to PESO using the same base so UI and saved payrolls are consistent.
                        try {
                            const existing = additions[key];
                            if ((existing === undefined || existing === null) && employeeData.employeeType && employeeData.employeeType.standardAdditions && employeeData.employeeType.standardAdditions[key] != null) {
                                // nothing to do, we already set computedValue above
                            } else if (typeof existing === 'number' && existing > 0 && existing <= 100 && baseForAdd > 0) {
                                additions[key] = Math.round(((baseForAdd * existing) / 100) * 100) / 100;
                            }
                        } catch (e) {
                            // ignore conversion errors
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to ensure computed 13th month in additions:', e);
        }

        // Compute leave conversion addition (if configured) and add to additions
        try {
            const leaveInfo = (employeeTypeCfg && employeeTypeCfg.leaveInformation) || (employeeData && employeeData.leaveInformation) || null;
            // Only calculate leave conversion if:
            // 1. leaveInfo exists AND has a conversionRate
            // 2. conversionRate value is > 0
            // 3. Employee has available leaves to convert (optional check)
            if (leaveInfo && leaveInfo.conversionRate) {
                const conv = leaveInfo.conversionRate;
                const convVal = Number(conv.value || 0);
                // Only proceed if conversion rate is explicitly set and > 0
                if (convVal > 0) {
                    const isPerc = conv.isPercentage === true || (convVal > 0 && convVal <= 100);
                        if (isPerc && convVal > 0) {
                            // Leave conversion should be based on canonical base pay only (exclude overtime and night differential)
                            // If baseEarnings is available (computed from attendance for hourly employees), use it.
                            // Otherwise fall back to the baseSalaryForAdditions heuristic.
                            const baseForLeave = Number(baseEarnings || baseSalaryForAdditions || 0);
                            if (baseForLeave > 0) {
                                const leaveAmount = Math.round((baseForLeave * (convVal / 100)) * 100) / 100;
                                if (leaveAmount > 0) {
                                    additions.leaveConversion = (additions.leaveConversion || 0) + leaveAmount;
                                    _additionsBreakdown.leaveConversion = _additionsBreakdown.leaveConversion || [];
                                    _additionsBreakdown.leaveConversion.push({ date: period, amount: leaveAmount });
                                }
                            }
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to compute leave conversion addition:', e);
        }

        totalAdditions = Object.values(additions || {}).reduce((s, v) => s + (Number(v) || 0), 0);

        // If computedGross is effectively zero, force all additions/allowances/deductions to zero
        // This prevents heuristic fallbacks from producing small non-authoritative values
        // and aligns behavior with deployed Hostinger bundle which treats zero base as authoritative.
        const ZERO_THRESHOLD = 0.01;
        if (Number(computedGross || 0) <= ZERO_THRESHOLD) {
            // Zero out additions
            for (const k of Object.keys(additions || {})) additions[k] = 0;
            totalAdditions = 0;

            // Zero custom fields totals
            totalCustomAdditions = 0;
            totalCustomDeductions = 0;

            // Zero allowances
            // totalAllowances computed later may overwrite; set a local var to 0 so it's used below
            // We'll override breakdown and deduction values before returning
            // Zero statutory/deduction computed values
            // sssDed, philhealthDed, pagibigDed, trainTax are computed earlier; override here
            try {
                // eslint-disable-next-line no-unused-expressions
                (function(){}());
            } catch (e) {}

            // Force late deductions and earnings to zero
            totalLateDeductions = 0;
            baseEarnings = 0;
            overtimeEarnings = 0;
            computedGross = 0;
        }

        // Ensure all standard addition fields are present (show 0 if not calculated)
        if (employeeTypeCfg && employeeTypeCfg.standardAdditions) {
            for (const key of Object.keys(employeeTypeCfg.standardAdditions || {})) {
                if (additions[key] === undefined) {
                    additions[key] = 0;
                }
            }
        }

        // Ensure standard fields always present
        if (additions.bonus === undefined) additions.bonus = 0;
        if (additions.leaveConversion === undefined) additions.leaveConversion = 0;
        if (additions.overtime === undefined) additions.overtime = 0;
        if (additions.thirteenthMonth === undefined) additions.thirteenthMonth = 0;
        if (additions.nightDifferential === undefined) additions.nightDifferential = 0;
        if (additions.holidayPay === undefined) additions.holidayPay = 0;
        if (additions.specialHolidayPay === undefined) additions.specialHolidayPay = 0;

        // Ensure all required properties are present and have valid values
        console.error('🔴🔴🔴 BEFORE DEDUCTION CALC - employeeData.deductions:', JSON.stringify(employeeData.deductions));
        console.error('🔴🔴🔴 BEFORE DEDUCTION CALC - employeeData.employeeType.standardDeductions:', JSON.stringify(employeeData.employeeType?.standardDeductions));
        
        console.error('🔵🔵🔵 BEFORE FINAL RETURN - Monthly Check 🔵🔵🔵', {
            isHourly,
            salaryType: employeeTypeCfg?.salaryType,
            computedGross,
            baseEarnings,
            overtimeEarnings,
            totalLateDeductions,
            additions,
            breakdown
        });
        
        const result = {
            userId,
            period,
            grossSalary: Math.max(0, Number(computedGross || 0)),
            breakdown: {
                ...breakdown,
                baseSalary: Math.max(0, Number(breakdown.baseSalary || 0)),
                overtimeEarnings: Math.max(0, Number(breakdown.overtimeEarnings || 0)),
                serviceCredits: Math.max(0, Number(breakdown.serviceCredits || 0)),
                statutory: {
                    sss: Math.max(0, Number(breakdown.statutory?.sss || 0)),
                    philhealth: Math.max(0, Number(breakdown.statutory?.philhealth || 0)),
                    pagibig: Math.max(0, Number(breakdown.statutory?.pagibig || 0))
                },
                totalDeductions: Math.max(0, Number(breakdown.totalDeductions || 0)),
                totalAllowances: Math.max(0, Number(breakdown.totalAllowances || 0))
            },
            // netSalary (include additions and custom fields)
            netSalary: Math.max(0, Number(netSalary || 0) + Number(totalAdditions || 0) + Number(totalCustomAdditions || 0) - Number(totalCustomDeductions || 0)),
            deductions: {
                sss: Math.max(0, Number(sssDed || 0)),
                philhealth: Math.max(0, Number(philhealthDed || 0)),
                pagibig: Math.max(0, Number(pagibigDed || 0)),
                tax: Math.max(0, Number(trainTax || 0)),
                lateDeductions: Math.round((totalLateDeductions || 0) * 100) / 100,
                lateDeduction: Number(employeeTypeCfg?.lateDeduction || employeeData.salaryInfo?.lateDeduction || 0),
                total: Math.max(0, Number(totalDeductions || 0)),
                // Spread other deductions from Firebase, but exclude the computed ones (SSS/PhilHealth/PagIBIG/Tax)
                // and late deductions which are calculated from attendance records
                // to avoid overwriting the calculated amounts with raw Firebase objects
                ...(employeeData.deductions ? Object.entries(employeeData.deductions).reduce((acc, [k, v]) => {
                    const lowerK = k.toLowerCase();
                    // Exclude computed deductions (recalculated each payroll period) and attendance-based late deductions
                    // Use case-insensitive checks for withholding, tax, and late
                    if (!lowerK.includes('withholding') && !lowerK.includes('tax') && !lowerK.includes('late') &&
                        !['sss', 'philhealth', 'pagibig'].includes(lowerK)) {
                        acc[k] = v;
                    }
                    return acc;
                }, {}) : {})
            },
            allowances: {
                ...(employeeData.allowances || {}),
                total: Math.max(0, Number(totalAllowances || 0))
            },
            additions: {
                ...(additions || {}),
                total: Math.max(0, Number(totalAdditions || 0))
            },
            // optional per-date breakdowns for additions (key -> [{date, amount}])
            additionsBreakdown: _additionsBreakdown,
            customFields: customFields,
            employeeInfo: {
                name: employeeData.name || 'Unknown Employee',
                facultyId: employeeData.facultyId || userId,
                salaryInfo: employeeData.salaryInfo || {},
                department: employeeData.department || '',
                position: employeeData.position || ''
            },
            timestamp: new Date().toISOString()
        };

        // Debug log the final calculation result
        console.debug('Payroll calculation completed:', {
            employeeId: userId,
            period,
            gross: result.grossSalary,
            net: result.netSalary,
            deductions: result.deductions.total,
            allowances: result.allowances.total,
            deductionsObject: result.deductions
        });
        
        console.error('🔴🔴🔴 SERVICE RETURNING DEDUCTIONS:', JSON.stringify(result.deductions));
        console.error('🟢🟢🟢 SERVICE RETURNING COMPLETE RESULT 🟢🟢🟢', JSON.stringify({
            grossSalary: result.grossSalary,
            breakdown: {
                baseSalary: result.breakdown?.baseSalary,
                overtimeEarnings: result.breakdown?.overtimeEarnings,
                hourly: result.breakdown?.hourly,
                monthly: result.breakdown?.monthly
            },
            additions: result.additions,
            allowances: result.allowances,
            netSalary: result.netSalary
        }, null, 2));

        return result;
    } catch (error) {
        console.error('❌ [payrollService] Calculation failed for userId:', userId, 'period:', period);
        console.error('❌ Error details:', error?.message, error?.stack);
        throw error;
    }
};
