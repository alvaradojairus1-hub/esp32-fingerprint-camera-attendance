import { ref, onValue } from "firebase/database";
import { database, dbRef } from "../firebase";

/**
 * Calculates withholding tax based on Philippine tax brackets.
 * NOTE: This assumes the tax is calculated on taxable income (Gross Salary - SSS - PhilHealth - Pag-IBIG).
 * @param {number} taxableIncome - The amount of income subject to tax.
 * @param {Array} taxBrackets - The tax bracket rules from Firebase.
 * @returns {number} The calculated withholding tax.
 */
const calculateWithholdingTax = (taxableIncome, taxBrackets) => {
    if (!taxBrackets || taxableIncome <= 0) {
        return 0;
    }

    let lowerBound = 0;
    for (const bracket of taxBrackets) {
        const upperBound = bracket.upTo === null ? Infinity : bracket.upTo;
        if (taxableIncome > lowerBound && taxableIncome <= upperBound) {
            const tax = bracket.base + (taxableIncome - lowerBound) * bracket.rate;
            return tax > 0 ? tax : 0;
        }
        lowerBound = upperBound;
    }
    return 0;
};


/**
 * Fetches and computes payroll data in real-time from Firebase.
 * @param {function} callback - The function to call with the computed payroll data.
 * @returns {function} An unsubscribe function to detach the Firebase listeners.
 */
export const listenToPayrollData = (callback, errorCallback) => {
    const usersRef = ref(database, dbRef('users'));
    const payrollRef = ref(database, dbRef('payroll'));
    const deductionsRef = ref(database, dbRef('deductions'));
    const taxConfigRef = ref(database, dbRef('payroll_config/tax'));

    let users = {};
    let payroll = {};
    let deductions = {};
    let taxConfig = {};

    const computeAndCallback = () => {
        // Ensure all data sources are loaded before computing
        if (Object.keys(users).length === 0 || Object.keys(payroll).length === 0 || Object.keys(deductions).length === 0) {
            return;
        }

        const computedData = Object.values(payroll).map(p => {
            // Find the corresponding user. The DB structure links payroll by ID '1', '2' to user ID '1', '2'.
            const user = users[p.userId];
            if (!user) {
                return null;
            }

            // Determine gross salary: prefer per-user salaryRate, then payroll entry
            const salary = (user.salaryRate !== undefined) ? Number(user.salaryRate) : (p.salary || 0);
            const serviceCredits = (user.serviceCredits !== undefined) ? Number(user.serviceCredits) : 0;
            const taxRate = (user.taxRate !== undefined) ? Number(user.taxRate) : 0.02;

            // Determine statutory deduction amounts (fixed pesos): prefer per-user override (users.{id}.sssAmount) then fallback to global tax config then deductions node
            const sssAmount = (user.sssAmount !== undefined && user.sssAmount !== null)
                ? Number(user.sssAmount)
                : (taxConfig.sssAmount !== undefined ? Number(taxConfig.sssAmount) : (deductions.SSS && (deductions.SSS.employee_share_amount || deductions.SSS.employee_share)) ? Number(deductions.SSS.employee_share_amount || deductions.SSS.employee_share) : 0);
            const philAmount = (user.philAmount !== undefined && user.philAmount !== null)
                ? Number(user.philAmount)
                : (taxConfig.philAmount !== undefined ? Number(taxConfig.philAmount) : (deductions.PhilHealth && (deductions.PhilHealth.employee_share_amount || deductions.PhilHealth.employee_share)) ? Number(deductions.PhilHealth.employee_share_amount || deductions.PhilHealth.employee_share) : 0);
            const pagibigAmount = (user.pagibigAmount !== undefined && user.pagibigAmount !== null)
                ? Number(user.pagibigAmount)
                : (taxConfig.pagibigAmount !== undefined ? Number(taxConfig.pagibigAmount) : (deductions.PagIBIG && (deductions.PagIBIG.employee_share_amount || deductions.PagIBIG.employee_share)) ? Number(deductions.PagIBIG.employee_share_amount || deductions.PagIBIG.employee_share) : 0);

            const sssDed = Number(sssAmount || 0);
            const philhealthDed = Number(philAmount || 0);
            const pagibigDed = Number(pagibigAmount || 0);

            // Per TRAIN: taxable income after statutory contributions
            const taxableIncome = salary - sssDed - philhealthDed - pagibigDed;
            const trainTax = calculateWithholdingTax(taxableIncome, (deductions.WithholdingTax && deductions.WithholdingTax.brackets) ? deductions.WithholdingTax.brackets : null);

            // DHVSU institutional tax is applied on net taxable after TRAIN
            const taxableAfterTRAIN = Math.max(0, taxableIncome - trainTax);
            const dhvsuTax = taxableAfterTRAIN * taxRate;

            const totalDeductions = sssDed + philhealthDed + pagibigDed + trainTax + dhvsuTax;
            const netPay = salary - totalDeductions + serviceCredits;

            return {
                id: p.userId,
                name: user.name,
                position: p.position,
                grossPay: salary,
                breakdown: {
                    statutory: { sss: sssDed, philhealth: philhealthDed, pagibig: pagibigDed },
                    trainTax,
                    dhvsuTax,
                    serviceCredits
                },
                deductions: {
                    sss: sssDed,
                    philhealth: philhealthDed,
                    pagibig: pagibigDed,
                    tax: trainTax,
                    dhvsu: dhvsuTax
                },
                totalDeductions,
                netPay,
            };
        }).filter(Boolean); // Filter out null entries

        callback(computedData);
    };

    const usersUnsubscribe = onValue(usersRef, snapshot => {
        users = snapshot.val() || {};
        computeAndCallback();
    }, error => errorCallback ? errorCallback(error) : null);

    const payrollUnsubscribe = onValue(payrollRef, snapshot => {
        payroll = snapshot.val() || {};
        computeAndCallback();
    }, error => errorCallback ? errorCallback(error) : null);

    const deductionsUnsubscribe = onValue(deductionsRef, snapshot => {
        deductions = snapshot.val() || {};
        computeAndCallback();
    }, error => errorCallback ? errorCallback(error) : null);

    // Return a function that unsubscribes all listeners
    return () => {
        usersUnsubscribe();
        payrollUnsubscribe();
        deductionsUnsubscribe();
    };
};