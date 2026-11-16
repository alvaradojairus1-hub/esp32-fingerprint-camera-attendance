# Project Snippets for Manuscript


---

**System settings & theming** — [src/contexts/SystemSettingsContext.jsx](src/contexts/SystemSettingsContext.jsx#L1-L60)

```javascript
const DEFAULT_COLORS = {
  sidebar: '#8b3a3a',
  sidebarText: '#ffffff',
  pagination: '#6b46c1',
  paginationText: '#ffffff',
  approveButton: '#16a34a',
  rejectButton: '#dc2626',
  // Payslip colors (will fallback to sidebar if not set)
  payslipHeaderBg: '#ef4444',
  payslipHeaderText: '#ffffff',
  payslipCompensationBg: '#fff9c4',
  payslipCompensationText: '#111827',
};

if (remote.theme) {
  const mergedColors = { ...DEFAULT_COLORS, ...remote.theme };
  setThemeColorsState(mergedColors);
  applyColorsToSystem(mergedColors);
}
```

Caption: Defensive merge of remote theme with `DEFAULT_COLORS` para yung partial themes na nakastore sa firebase hindi masira yung ui tsaka payslip rendering.

---

**Payslip HTML generator (printable)** — [src/services/payslipService.js](src/services/payslipService.js#L630-L720)

```javascript
const themeColors = facultyProfile?.themeColors || {};
console.log('buildPrintablePayslipHtml - FULL themeColors:', JSON.stringify(themeColors, null, 2));
const headerBg = themeColors.payslipHeaderBg || themeColors.sidebar || '#ef4444';
const headerText = themeColors.payslipHeaderText || themeColors.sidebarText || '#ffffff';
const compensationBg = themeColors.payslipCompensationBg || '#fff9c4';
const compensationText = themeColors.payslipCompensationText || '#111827';
console.log('🎨 FINAL COLORS USED - headerBg:', headerBg, 'headerText:', headerText);

// ... build HTML and inject <style> using headerBg/headerText/compensationBg ...
```

Caption: eto yung nagpapakita ng payslip both for hr and the employee account with the branding like yung logo, company name, tagline, etc.

---

**Payroll calculation entrypoint** — [src/services/payrollService.js](src/services/payrollService.js#L520-L700)

```javascript
export const calculatePayrollFromFirebase = async (userId, period, grossSalary) => {
  try {
    const employeeData = await getEmployeePayrollData(userId);
    if (!employeeData) throw new Error(`Employee data not found for user ${userId}`);
    if (!employeeData.employeeType) {
      console.error('❌ Employee', userId, 'has no employeeType configured');
      throw new Error(`Employee ${userId} has no employee type configured.`);
    }
    console.error('🔴 PAYROLL SERVICE START - userId:', userId, 'employeeType:', employeeData.employeeType?.name);

    // Helper: compute SSS using many fallbacks
    const computeSssAmount = () => {
      const etCfg = employeeData.employeeType;
      const isMonthlyEmployee = etCfg && String(etCfg.salaryType).toLowerCase() === 'monthly';
      // ... detailed deduction logic follows ...
    };
```

Caption: Core payroll engine: nagloload ng employee data, nagvavalidate ng configuration, tsaka ineencapsulate yung statutory/dependent deduction calculations tapos merong robust fallbacks just in case.

---

**Hourly earnings (attendance→pay)** — [src/services/hourlyCalculator.js](src/services/hourlyCalculator.js#L1-L120)

```javascript
export function computeHourlyEarnings(pairedRows = [], options = {}) {
  const baseRate = Number(options.baseRate || 0);
  const overtimeRate = Number(options.overtimeRate || (baseRate * 1.25));
  const lateDeduction = Number(options.lateDeduction || 0);
  const expectedDailyHours = Number(options.expectedDailyHours || 8);
  const maxOvertimeHours = Number(options.maxOvertimeHours || 2);
  const schedule = options.schedule;
  console.error('[computeHourlyEarnings] RECEIVED schedule:', { scheduleExists: !!schedule });

  // Determine overtime using schedule if provided; else fallback to hrs - expectedDailyHours
  // Determine late status using schedule-aware checks and 15-minute grace
}
```

Caption: Cinoconvert yung mga paired attendance rows to base hours, overtime, tsaka late counts; supports multiple schedule formats tsaka siya rin yung nagcacap sa overtime.

---

**Pairing check-in/check-out records** — [src/utils/attendanceUtils.js](src/utils/attendanceUtils.js#L72-L140)

```javascript
export function pairAttendanceRecords(records) {
  const byUser = new Map();
  (records || []).forEach((r) => {
    const uid = (r.userId || r.facultyId || '').toString();
    const arr = byUser.get(uid) || [];
    arr.push(r);
    byUser.set(uid, arr);
  });

  for (const [uid, arr] of byUser.entries()) {
    arr.sort((a,b) => new Date(a.rawTimestamp || a.timestamp).getTime() - new Date(b.rawTimestamp || b.timestamp).getTime());
    // find check_in and next check_out, handle next-day checkouts, skip >18h gaps
    // push paired object: { userId, date, checkIn, checkOut, hours, rawRecords }
  }
  return out.sort(...);
}
```

Caption: Naggogroup ng raw events by user and nagpapair ng consecutive check-in/check-out events into daily rows (siya rin naghahandle ng night shift, mga missing checkout, and large gaps).

---

**Auth provider (user normalization & role)** — [src/contexts/authcontext.jsx](src/contexts/authcontext.jsx#L1-L80)

```javascript
useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    if (u) {
      const users = await firebaseService.getUsers();
      const username = u.email.split('@')[0];
      let found = null;
      if (Array.isArray(users)) found = users.find(x => x && (x.email === u.email || x.facultyId === username));
      if (found) {
        const role = (found.role || 'employee').toLowerCase();
        setUser({ uid: u.uid, email: u.email, role, id: found.facultyId || found.id, name: found.name });
      } else {
        setUser({ uid: u.uid, email: u.email, role: 'employee', id: username, name: username });
      }
    } else setUser(null);
  });
  return () => unsub();
}, []);
```

Caption: Nagpapakita ng mapping ng Firebase Auth user to application `user` object including `role` that is used for access control.

---

**Settings persistence (Firebase RTDB)** — [src/services/settingsService.js](src/services/settingsService.js#L1-L80)

```javascript
import { ref, get, set, onValue, off, update } from 'firebase/database';
import { database, dbRef } from '../firebase';
const SETTINGS_PATH = dbRef('systemSettings');

export async function updateSystemSettings(patch) {
  try {
    const rootRef = ref(database, SETTINGS_PATH);
    await update(rootRef, { ...patch, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('updateSystemSettings error', error);
    throw error;
  }
}
```

Caption: Simple, safe RTDB `update` pattern that adds a `lastUpdated` timestamp and centralizes settings writes, kumbaga siya yung nagsasave ng every last settings na chinange sa system settings, and then inaapply niya sa system kaya mas nagiging centralized.

---

