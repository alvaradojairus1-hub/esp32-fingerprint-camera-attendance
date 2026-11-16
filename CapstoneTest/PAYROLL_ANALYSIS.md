# Payroll System Architecture & Data Flow Analysis

## Overview
The payroll system has three main layers:
1. **UI Layer** — Dashboard preview & Payslip viewer
2. **Service Layer** — Calculation & persistence logic  
3. **Data Layer** — Firebase Realtime Database

---

## Key Files & Their Roles

### Frontend Components

#### `src/components/payroll/PayrollDashboard.jsx`
**Purpose:** Individual payroll calculation preview and save interface  
**Key Functions:**
- `handleEmployeeSelect(employeeId)` — loads employee and triggers preview calculation
- `calculatePreview(employeeId, employeeTypeCfg)` — calls `calculatePayrollFromFirebase` and maps result to UI state
- `handleSavePayroll()` — saves preview to DB via `savePayrollRecord`
- `handlePreviewPayslip()` — opens payslip HTML preview using `payslipService.buildPrintablePayslipHtml`

**Current Data Flow:**
1. User selects employee from dropdown
2. `handleEmployeeSelect` fetches employee profile + employeeType config
3. `calculatePreview` is called with `employeeId` and `period` (yyyy-MM format)
4. Inside `calculatePreview`:
   - Calls `calculatePayrollFromFirebase(employeeId, period)` (no grossSalary param passed!)
   - Maps returned `computed` object into `calculationPreview` state
   - Dashboard renders `calculationPreview.additions` (which should contain holiday, special holiday, etc.)

**Issue Identified:** When `calculatePreview` calls `calculatePayrollFromFirebase`, it does **not pass a `grossSalary` parameter**. The function signature is:
```javascript
calculatePayrollFromFirebase(userId, period, grossSalary)
```
So `grossSalary` defaults to `undefined`, which then becomes `0` inside the function.

**Rendering (lines 378-389):**
```jsx
{Object.entries(calculationPreview.additions || {}).map(([key, val]) => (
  (Number(val) > 0) ? (
    <div key={key} className="flex justify-between">
      <span className="text-gray-600">{formatLabel(key)}</span>
      <span className="text-green-600">₱{Number(val).toLocaleString()}</span>
    </div>
  ) : null
))}
```
This iterates `calculationPreview.additions` and renders each non-zero addition. If additions are all 0, nothing appears (which matches the screenshot showing no holiday/special pay).

---

### Service Layer

#### `src/services/payrollService.js`

**Main Export: `calculatePayrollFromFirebase(userId, period, grossSalary)`**

**Execution Flow:**
1. Calls `getEmployeePayrollData(userId)` to fetch user + deductions + allowances
2. Loads global tax config from Firebase (optional)
3. Calculates statutory deductions (SSS, PhilHealth, PagIBIG) as fixed pesos (not percentages)
4. **If hourly/part-time:**
   - Fetches attendance records for the period
   - Pairs them into daily rows via `pairAttendanceRecords`
   - Computes hours/overtime via `computeHourlyEarnings`
   - Derives `computedGross` from base rate × hours
5. Fetches `employeeTypeCfg` from Firebase (if provided in user record)
6. Computes additions from `employeeTypeCfg.standardAdditions`:
   - Checks if each addition applies to the period using `appliesToPeriod`
   - **If `applyDates` array exists:**
     - Filters dates to those in the period (yyyy-MM)
     - For each date: fetches attendance, pairs records, computes per-date amount
     - Stores per-date breakdown in `additionsBreakdown[key]`
   - **Otherwise:** treats `cfg.value` or primitive as percentage if key matches pattern (holiday, special, etc.)
7. Computes custom fields similarly
8. Returns result with `additions`, `additionsBreakdown`, `breakdown`, `deductions`, `netSalary`, etc.

**Key Variables in Result:**
- `grossSalary` — computed from attendance (hourly) or provided (monthly)
- `additions` — object mapping key → computed peso amount (e.g., `{holidayPay: 1600, bonus: 2000}`)
- `additionsBreakdown` — object mapping key → `[{date, amount}, ...]` (per-date if applyDates used)
- `breakdown` — detailed structure with base, OT, deductions, etc.

**Problem Area — "baseSalaryForAdditions" Derivation (lines 486-494):**
```javascript
const baseSalaryForAdditions = (() => {
    try {
        if (employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'monthly') 
            return Number(employeeTypeCfg.rate || employeeData.salaryRate || computedGross || 0);
        if (employeeTypeCfg && String(employeeTypeCfg.salaryType).toLowerCase() === 'hourly') 
            return Number(baseEarnings || employeeTypeCfg.rate || computedGross || 0);
        ...
    } catch (e) { return Number(computedGross || 0); }
})();
```
This is calculated **after** the hourly earnings are computed (so `baseEarnings` and `computedGross` are available). But it depends on having valid `employeeTypeCfg` loaded.

**Critical Issue — No employeeType Lookup in `getEmployeePayrollData`:**
```javascript
export const getEmployeePayrollData = async (userId) => {
    const userSnapshot = await get(ref(database, dbRef(`users/${userId}`)));
    if (!userSnapshot.exists()) return null;
    const userData = userSnapshot.val();
    // ... fetches deductions/allowances but does NOT fetch employeeType ...
    return {
        userId, name, facultyId, salaryInfo, salaryRate, serviceCredits, taxRate,
        deductions, allowances
        // employeeType NOT included here
    };
}
```
So `employeeData` in `calculatePayrollFromFirebase` **does not have** `employeeType` field. The function then tries:
```javascript
if (!isHourly && employeeData.employeeType) {
    // This will be false because getEmployeePayrollData doesn't include employeeType!
}
```
This means `employeeTypeCfg` stays `null`, so **no additions are computed at all!**

---

#### `src/services/firebaseService.js`

**Helper: `getPayroll()`** (lines 864-871)
- Fetches payroll records from Firebase (not used in dashboard calculation)

**Key Methods Used by Dashboard:**
- `getEmployees()` — loads all employee profiles (includes employee.employeeType reference)
- `getAttendance()` — loads flattened attendance records
- `getEmployeeTypes()` — loads all employee type configs

---

#### `src/services/payslipService.js`

**Main Export: `buildPrintablePayslipHtml(payrollData, facultyProfile)`**
- Receives `payrollData` from dashboard (via `handlePreviewPayslip`)
- `payrollData` includes `additions` object
- Renders additions dynamically if present
- **Depends on** `calculatePayrollFromFirebase` having returned correct additions

**Problem:** If additions are empty/zero, payslip will show nothing for holidays.

---

### Data Storage Layer

#### Firebase Structure:
```
/users/{userId}
  - name, facultyId, position, department, salaryInfo, employeeType (reference to -Xabc123)
  - deductions, allowances

/employeeTypes/{typeId}
  - name, salaryType, rate, overtimeRate, lateDeduction
  - standardAdditions: {
      holidayPay: {value: 100, applyDates: ['2025-11-11'], isPercentage?: true},
      specialHolidayPay: {value: 130, applyDates: ['2025-12-25']},
      thirteenthMonth: {value: 8.33, applyMonths: [12]},
      bonus: {value: 2000}
    }
  - standardDeductions, customFields

/payroll/{period}/{userId}
  - saved payroll record (written by savePayrollRecord)
```

---

## The Root Cause of "No Additions Showing"

### Sequence of Events:
1. Dashboard calls `calculatePreview(employeeId, period)`
2. `calculatePreview` calls:
   ```javascript
   const computed = await calculatePayrollFromFirebase(employeeId, period);
   // NO grossSalary passed!
   ```
3. Inside `calculatePayrollFromFirebase`:
   ```javascript
   const employeeData = await getEmployeePayrollData(userId);
   // employeeData does NOT include employeeType field
   ```
4. Later:
   ```javascript
   if (!isHourly && employeeData.employeeType) {
       // This condition is FALSE because:
       // (a) employeeData.employeeType doesn't exist (not fetched)
       // (b) employeeTypeCfg stays null
   }
   ```
5. When processing additions:
   ```javascript
   if (employeeTypeCfg && employeeTypeCfg.standardAdditions) {
       // This is skipped because employeeTypeCfg is null!
   }
   ```
6. Result: `additions = {}` (empty)
7. Dashboard renders empty additions section

### Why Dashboard Shows ₱0:
- `baseSalary` is 0 (no grossSalary provided, hourly rates not applied because employeeTypeCfg is null)
- `additions` is empty
- `deductions.total` is 0 (because baseSalary is 0, statutory calcs don't apply)
- Everything shows ₱0

---

## Solution Requirements

### Option 1: Pass employeeType to `calculatePayrollFromFirebase`
Modify `calculatePreview` to:
1. Include `employeeType` reference when calling the function
2. Ensure `calculatePayrollFromFirebase` can use it

### Option 2: Include employeeType in `getEmployeePayrollData`
Modify `getEmployeePayrollData` to:
1. Fetch the `employeeType` ID from user record
2. Load the full employeeType config
3. Include it in the returned employeeData

### Option 3: Hybrid Approach
- Dashboard fetches employeeType before calling `calculatePayrollFromFirebase`
- Passes both userId and employeeTypeCfg to a helper
- Calculation uses passed config instead of looking it up

### Option 4: Refactor to match expected data flow
- Dashboard should fetch `computed` payroll via a helper that knows both employee AND employeeType
- Single responsibility: the service should handle all data fetching and calculation
- Dashboard just renders the result

---

## Current vs. Expected Behavior

### Current (Broken):
```
Dashboard selects employee
  ↓
calculatePreview(employeeId, period)
  ↓
calculatePayrollFromFirebase(employeeId, period)  [NO employeeTypeCfg passed]
  ↓
getEmployeePayrollData(employeeId)  [returns user but no employeeType]
  ↓
employeeTypeCfg = null
  ↓
additions = {} (not computed)
  ↓
Dashboard shows ₱0 for all earnings
```

### Expected (Needed):
```
Dashboard selects employee
  ↓
calculatePreview(employeeId, period)
  ↓
calculatePayrollFromFirebase(employeeId, period, employeeTypeCfg OR fetch it)
  ↓
getEmployeePayrollData(employeeId)  [INCLUDES employeeType]
  ↓
employeeTypeCfg loaded and valid
  ↓
Process standardAdditions (holiday, special, 13th month, etc.)
  ↓
additions = {holidayPay: 1600, specialHolidayPay: 1040, ...}
  ↓
Dashboard renders additions with values
```

---

## Files That Need Changes

1. **`src/services/payrollService.js`**
   - Update `getEmployeePayrollData` to fetch and include `employeeType` config
   - OR add a wrapper function that handles this

2. **`src/components/payroll/PayrollDashboard.jsx`**
   - Pass employeeType or ensure it's fetched before calculation
   - Ensure `calculatePreview` flow is correct

3. **No changes needed to:**
   - `payslipService.js` (works once additions are correct)
   - `periodUtils.js` (applyDates logic is correct)
   - `attendanceUtils.js`, `hourlyCalculator.js` (per-date logic is correct)

---

## Summary

**Why additions don't show:**
- `employeeTypeCfg` is null because it's never fetched in the data retrieval flow
- `standardAdditions` are only processed if `employeeTypeCfg` is valid
- Dashboard receives empty `additions` object and renders nothing

**Fix:** Include employeeType config in the data fetched before/during calculation.

