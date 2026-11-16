import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { appliesToPeriod } from '../utils/periodUtils';

export const payslipService = {
  /**
   * Generate PDF payslip for a payroll record
   * @param {Object} payrollData - Payroll data
   * @param {Object} facultyProfile - Faculty profile information
   * @returns {Promise<Blob>} PDF blob
   */
  async generatePayslipPDF(payrollData, facultyProfile) {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // Company header (may load logo image)
      const companyBranding = facultyProfile && facultyProfile.companyBranding ? facultyProfile.companyBranding : {};
      await this.addCompanyHeader(doc, pageWidth, companyBranding);

      // Payslip title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYSLIP', pageWidth / 2, 50, { align: 'center' });

      // Employee information
      this.addEmployeeInfo(doc, facultyProfile, payrollData, 70);

      // Pay period
      this.addPayPeriod(doc, payrollData, 120);

      // Earnings section
      this.addEarningsSection(doc, payrollData, 150);

      // Deductions section
  this.addDeductionsSection(doc, payrollData, 200);

  // Other payables (HR custom fields should appear here)
  this.addOtherPayablesSection(doc, payrollData, 230);

  // Net pay
  this.addNetPay(doc, payrollData, 270);

  // Footer (include HR name if provided)
  this.addFooter(doc, pageWidth, pageHeight, payrollData, facultyProfile);

      return doc.output('blob');
    } catch (error) {
      throw new Error('Failed to generate payslip PDF');
    }
  },

  /**
   * Generate Excel payslip for a payroll record
   * @param {Object} payrollData - Payroll data
   * @param {Object} facultyProfile - Faculty profile information
   * @returns {Promise<Blob>} Excel blob
   */
  async generatePayslipExcel(payrollData, facultyProfile) {
    try {
      // This would use the xlsx library to generate Excel files
      // For now, return a simple CSV format
      const csvData = this.generatePayslipCSV(payrollData, facultyProfile);
      return new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    } catch (error) {
      throw new Error('Failed to generate payslip Excel');
    }
  },

  /**
   * Generate CSV data for payslip
   * @param {Object} payrollData - Payroll data
   * @param {Object} facultyProfile - Faculty profile information
   * @returns {string} CSV data
   */
  generatePayslipCSV(payrollData, facultyProfile) {
    const fmt = (v) => `₱${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    
    const rows = [];
    
    // Header
    rows.push(['Fingerprint Attendance System Tracking and Payroll']);
    rows.push(['Human Resources Department • Payroll Management System']);
    rows.push(['']);
    
    // Employee Information
    rows.push(['EMPLOYEE INFORMATION']);
    rows.push(['Employee Name', facultyProfile.name || '—']);
    rows.push(['Employee ID', facultyProfile.employeeId || '—']);
    rows.push(['Position', facultyProfile.position || '—']);
    rows.push(['Department', facultyProfile.department || '—']);
    rows.push(['Employment Status', payrollData.employmentStatus || '—']);
    rows.push(['']);
    
    // Pay Period
    rows.push(['PAY PERIOD']);
    const periodStart = payrollData.periodStart ? format(parseISO(payrollData.periodStart), 'MMM dd, yyyy') : '';
    const periodEnd = payrollData.periodEnd ? format(parseISO(payrollData.periodEnd), 'MMM dd, yyyy') : '';
    rows.push(['Period Start', periodStart]);
    rows.push(['Period End', periodEnd]);
    rows.push(['Generated', payrollData.generatedAt ? format(parseISO(payrollData.generatedAt), 'MMM dd, yyyy HH:mm') : '']);
    rows.push(['']);
    
    // EARNINGS
    rows.push(['EARNINGS']);
    const breakdown = payrollData.breakdown || {};
    const additions = payrollData.additions || {};
    const allowances = payrollData.allowances || {};
    
    // Base Pay
    const basePay = Number(breakdown.baseSalary || 0);
    rows.push(['Base Pay', fmt(basePay)]);
    
    // Night Differential
    const ndKey = Object.keys(additions).find(k => /night|differential|nightDifferential/i.test(k));
    if (ndKey) {
      rows.push([this.toTitleCase(ndKey), fmt(additions[ndKey])]);
    }
    
    // Overtime
    const overtime = Number(breakdown.overtimeEarnings || 0);
    rows.push(['Overtime', fmt(overtime)]);
    
    // Leave Conversion
    const lcKey = Object.keys(additions).find(k => /leaveConversion|leave_conversion|leaveconversion/i.test(k));
    if (lcKey) {
      rows.push([this.toTitleCase(lcKey), fmt(additions[lcKey])]);
    }
    
    // Subtotal Earnings
    const subtotal = basePay + (ndKey ? Number(additions[ndKey]) : 0) + overtime + (lcKey ? Number(additions[lcKey]) : 0);
    rows.push(['Subtotal Earnings', fmt(subtotal)]);
    rows.push(['']);
    
    // Other Additions (Bonus, 13th Month, Holiday Pay, etc.)
    const otherAdditions = Object.entries(additions).filter(([k]) => 
      k !== 'total' && !(/night|differential|nightDifferential|overtime|leave|conversion/i.test(k))
    );
    if (otherAdditions.length > 0) {
      otherAdditions.forEach(([k, v]) => {
        rows.push([this.toTitleCase(k), fmt(v)]);
      });
      rows.push(['']);
    }
    
    // Allowances
    const allowanceKeys = Object.keys(allowances).filter(k => k !== 'total');
    if (allowanceKeys.length > 0) {
      rows.push(['ALLOWANCES']);
      allowanceKeys.forEach(k => {
        rows.push([this.toTitleCase(k), fmt(allowances[k])]);
      });
      const totalAllowances = Number(allowances.total || 0);
      rows.push(['Total Allowances', fmt(totalAllowances)]);
      rows.push(['']);
    }
    
    // Total Earnings
    const baseGross = Number(payrollData.grossSalary || 0);
    const additionsTotal = Number((payrollData.additions && payrollData.additions.total) || payrollData.breakdown?.totalAdditions || 0);
    const allowancesTotal = Number((payrollData.allowances && payrollData.allowances.total) || payrollData.breakdown?.totalAllowances || 0);
    const totalEarnings = baseGross + additionsTotal + allowancesTotal;
    rows.push(['TOTAL EARNINGS', fmt(totalEarnings)]);
    rows.push(['']);
    
    // DEDUCTIONS
    rows.push(['DEDUCTIONS']);
    const deductions = payrollData.deductions || {};
    const customFields = payrollData.customFields || {};
    const customKeysLower = Object.keys(customFields || {}).map(k => String(k).toLowerCase());
    const excludedHardcoded = new Set(['withholding', 'dhvsu', 'withholdingtax', 'dhvsutax']);
    
    Object.entries(deductions).forEach(([k, v]) => {
      if (k === 'total') return;
      const kl = String(k).toLowerCase();
      if (kl === 'latededuction') return;
      if (customKeysLower.includes(kl)) return;
      if (excludedHardcoded.has(kl)) return;
      rows.push([this.toTitleCase(k), fmt(v)]);
    });
    
    const totalDeductions = Number((payrollData.deductions && payrollData.deductions.total) || 0);
    rows.push(['Total Deductions', fmt(totalDeductions)]);
    rows.push(['']);
    
    // OTHER PAYABLES
    const otherPayables = payrollData.otherPayables || {};
    if (Object.keys(otherPayables).length > 0 || Object.keys(customFields).length > 0) {
      rows.push(['OTHER PAYABLES']);
      Object.entries(otherPayables).forEach(([k, v]) => {
        rows.push([this.toTitleCase(k), fmt(v)]);
      });
      Object.entries(customFields).forEach(([k, f]) => {
        if (f && (f.value !== undefined && f.value !== null)) {
          if (!Object.prototype.hasOwnProperty.call(otherPayables, k)) {
            rows.push([this.toTitleCase(k), fmt(f.value)]);
          }
        }
      });
      const otherPayablesTotal = payrollData.otherPayablesTotal || 0;
      rows.push(['Total Other Payables', fmt(otherPayablesTotal)]);
      rows.push(['']);
    }
    
    // PAYROLL SUMMARY
    rows.push(['PAYROLL SUMMARY']);
    rows.push(['Total Earnings', fmt(totalEarnings)]);
    rows.push(['Less: Total Deductions', fmt(totalDeductions)]);
    if (Object.keys(otherPayables).length > 0 || Object.keys(customFields).length > 0) {
      const otherPayablesTotal = payrollData.otherPayablesTotal || 0;
      rows.push(['Less: Other Payables', fmt(otherPayablesTotal)]);
    }
    rows.push(['']);
    rows.push(['NET SALARY', fmt(payrollData.netSalary || 0)]);
    
    // Convert to CSV
    const csvContent = rows
      .map(row => row.map(field => `"${(field || '')}"`).join(','))
      .join('\n');

    return csvContent;
  },

  /**
   * Download payslip as PDF
   * @param {Object} payrollData - Payroll data
   * @param {Object} facultyProfile - Faculty profile information
   * @param {string} filename - Filename for download
   */
  async downloadPayslipPDF(payrollData, facultyProfile, filename = null) {
    try {
      const pdfBlob = await this.generatePayslipPDF(payrollData, facultyProfile);
      const url = URL.createObjectURL(pdfBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `payslip_${facultyProfile.employeeId || 'employee'}_${format(new Date(), 'yyyy-MM')}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('Failed to download payslip PDF');
    }
  },

  /**
   * Download payslip as Excel/CSV
   * @param {Object} payrollData - Payroll data
   * @param {Object} facultyProfile - Faculty profile information
   * @param {string} filename - Filename for download
   */
  async downloadPayslipExcel(payrollData, facultyProfile, filename = null) {
    try {
      const excelBlob = await this.generatePayslipExcel(payrollData, facultyProfile);
      const url = URL.createObjectURL(excelBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `payslip_${facultyProfile.employeeId || 'employee'}_${format(new Date(), 'yyyy-MM')}.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('Failed to download payslip Excel');
    }
  },

  // Helper methods for PDF generation
  async addCompanyHeader(doc, pageWidth, companyBranding = {}) {
    const companyName = (companyBranding && companyBranding.name) || 'Fingerprint Attendance System Tracking and Payroll';
    const tagline = (companyBranding && companyBranding.tagline) || 'Human Resources Department • Payroll Management System';

    // If a logo URL is provided, try to load it and draw it on the PDF.
    if (companyBranding && companyBranding.logo) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            try {
              // Draw image at left side of header
              const imgWidth = 40;
              const imgHeight = 40;
              // x,y positions
              const imgX = 15;
              const imgY = 8;

              // create temporary canvas to get data URL (ensures compatibility)
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');

              try {
                doc.addImage(dataUrl, 'PNG', imgX, imgY, imgWidth, imgHeight);
              } catch (e) {
                // fallback: do nothing if addImage fails
              }
              resolve();
            } catch (e) {
              resolve();
            }
          };
          img.onerror = () => resolve();
          img.src = companyBranding.logo;
          // If loading stalls, resolve after a short timeout to avoid blocking
          setTimeout(resolve, 1500);
        });
      } catch (e) {
        // ignore logo loading errors
      }
    }

    // Render company name centered (taking into account left image)
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    // render single-line tagline (may include separator like • )
    doc.text(tagline, pageWidth / 2, 36, { align: 'center' });
  },

  toTitleCase(str) {
    if (!str) return '';
    // Convert camelCase / PascalCase / snake_case / kebab-case to space-separated Title Case
    let s = String(str);
    // replace underscores and dashes with spaces
    s = s.replace(/[_-]+/g, ' ');
    // insert spaces before capital letters (handle camelCase / PascalCase)
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    // collapse multiple spaces
    s = s.replace(/\s+/g, ' ').trim();
    // Title case each word
    return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  },

  getHrName(payrollData = {}, facultyProfile = {}) {
    // Try several common fields where an HR/printed-by name might be stored
    return payrollData.hrName
      || payrollData.printedByName
      || payrollData.processedByName
      || payrollData.generatedByName
      || payrollData.printedBy
      || payrollData.processedBy
      || payrollData.generatedBy
      || facultyProfile.hrName
      || facultyProfile.printedBy
      || '';
  },

  addEmployeeInfo(doc, facultyProfile, payrollData, yPosition) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Information', 20, yPosition);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const employeePosition = facultyProfile.position
      || payrollData.position
      || payrollData.employeeInfo?.position
      || payrollData.employeeInfo?.type
      || payrollData.employeeInfo?.role
      || payrollData.employeeInfo?.salaryInfo?.position
      || payrollData.preview?.employeeInfo?.position
      || payrollData.preview?.employeeInfo?.type
      || '';

    const employeeDepartment = facultyProfile.department || payrollData.department || payrollData.employeeInfo?.department || payrollData.preview?.employeeInfo?.department || '';

    const employeeInfo = [
      ['Name:', facultyProfile.name || 'N/A'],
      ['Employee ID:', facultyProfile.employeeId || 'N/A'],
      ['Position:', employeePosition || 'N/A'],
      ['Department:', employeeDepartment || 'N/A'],
      ['Tax Status:', facultyProfile.taxStatus || 'Single'],
      ['Dependents:', (facultyProfile.dependents || 0).toString()]
    ];

    let currentY = yPosition + 10;
    employeeInfo.forEach(([label, value]) => {
      doc.text(label, 20, currentY);
      doc.text(value, 80, currentY);
      currentY += 7;
    });
  },

  addPayPeriod(doc, payrollData, yPosition) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Pay Period', 20, yPosition);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const startDate = format(parseISO(payrollData.periodStart), 'MMMM dd, yyyy');
    const endDate = format(parseISO(payrollData.periodEnd), 'MMMM dd, yyyy');

    doc.text(`From: ${startDate}`, 20, yPosition + 10);
    doc.text(`To: ${endDate}`, 20, yPosition + 17);
  },

  addEarningsSection(doc, payrollData, yPosition) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Earnings', 20, yPosition);

    const fmt = (v) => `₱${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    let currentY = yPosition + 10;

    // Gross salary
    doc.text('Gross Salary', 20, currentY);
    doc.text(fmt(payrollData.grossSalary), 160, currentY, { align: 'right' });
    currentY += 7;

    // Detailed breakdown: Base, Overtime, Night Differential, Leave Conversion
    try {
      const bd = payrollData.breakdown || {};
      const hr = bd.hourly || {};
      if (bd.baseSalary && Number(bd.baseSalary) > 0) {
        doc.text('Base Pay', 20, currentY);
        doc.text(fmt(bd.baseSalary), 160, currentY, { align: 'right' });
        currentY += 7;
      } else if (hr.baseEarnings && Number(hr.baseEarnings) > 0) {
        doc.text('Base Pay (Hours)', 20, currentY);
        doc.text(fmt(hr.baseEarnings), 160, currentY, { align: 'right' });
        currentY += 7;
      }

      if (hr.overtimeEarnings && Number(hr.overtimeEarnings) > 0) {
        doc.text('Overtime', 20, currentY);
        doc.text(fmt(hr.overtimeEarnings), 160, currentY, { align: 'right' });
        currentY += 7;
      }

      // night differential from additions (case-insensitive lookup)
      const additions = payrollData.additions || {};
      const ndKey = Object.keys(additions || {}).find(k => /night|differential|nightDifferential/i.test(k));
      if (ndKey && Number(additions[ndKey] || 0) > 0) {
        doc.text(this.toTitleCase(ndKey), 20, currentY);
        doc.text(fmt(additions[ndKey]), 160, currentY, { align: 'right' });
        currentY += 7;
      }

      // leave conversion addition (if present)
      const leaveKey = Object.keys(additions || {}).find(k => /leaveConversion|leaveconversion|leave_conversion/i.test(k));
      if (leaveKey && Number(additions[leaveKey] || 0) > 0) {
        doc.text(this.toTitleCase(leaveKey), 20, currentY);
        doc.text(fmt(additions[leaveKey]), 160, currentY, { align: 'right' });
        currentY += 7;
      }

      // Subtotal line (base + overtime + nd + leave)
      const subtotal = (Number(bd.baseSalary || 0)) + (Number(hr.overtimeEarnings || 0)) + (Number(additions[ndKey] || 0)) + (Number(additions[leaveKey] || 0));
      doc.text('Subtotal Earnings', 20, currentY);
      doc.text(fmt(subtotal), 160, currentY, { align: 'right' });
      currentY += 7;
    } catch (e) {
      // ignore breakdown errors
    }

    // Dynamic allowances
    const allowances = payrollData.allowances || {};
    const allowanceKeys = Object.keys(allowances).filter(k => k !== 'total');
    for (const key of allowanceKeys) {
      doc.text(this.toTitleCase(key), 20, currentY);
      doc.text(fmt(allowances[key]), 160, currentY, { align: 'right' });
      currentY += 7;
    }

    // Spacer
    currentY += 2;

    // Total earnings (gross + allowances total)
    const totalAllowances = (allowances && allowances.total) || 0;
    doc.text('Total Earnings', 20, currentY);
    doc.text(fmt((payrollData.grossSalary || 0) + Number(totalAllowances || 0)), 160, currentY, { align: 'right' });
    currentY += 7;
  },

  addDeductionsSection(doc, payrollData, yPosition) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Deductions', 20, yPosition);

    const fmt = (v) => `₱${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const deductions = payrollData.deductions || {};
    const custom = payrollData.customFields || {};
    const customKeysLower = Object.keys(custom || {}).map(k => String(k).toLowerCase());

    const excludedHardcoded = new Set(['withholding', 'dhvsu', 'withholdingtax', 'dhvsutax']);
    const deductionKeys = Object.keys(deductions).filter(k => {
      const kl = String(k).toLowerCase();
      // Exclude singular 'lateDeduction' key — only show aggregated 'lateDeductions'
      if (kl === 'latededuction') return false;
      return k !== 'total' && !customKeysLower.includes(kl) && !excludedHardcoded.has(kl);
    });

    let currentY = yPosition + 10;
    for (const key of deductionKeys) {
      doc.text(this.toTitleCase(key), 20, currentY);
      doc.text(fmt(deductions[key]), 160, currentY, { align: 'right' });
      currentY += 7;
    }

    // Total (subtract any custom fields that were part of deductions)
    const customPdf = payrollData.customFields || {};
    const customDeductionSumPdf = Object.entries(customPdf || {}).reduce((s, [k, f]) => {
      if (!f || (f.value === undefined || f.value === null)) return s;
      const keyLower = String(k).toLowerCase();
      if (String(f.type).toLowerCase() === 'deduction' || Object.keys(deductions).map(dk => String(dk).toLowerCase()).includes(keyLower)) {
        return s + (Number(f.value) || 0);
      }
      return s;
    }, 0);
    const displayedDeductionsPdf = (Number((deductions && deductions.total) || 0) - Number(customDeductionSumPdf || 0));
    doc.text('Total Deductions', 20, currentY);
    doc.text(fmt(displayedDeductionsPdf), 160, currentY, { align: 'right' });
    currentY += 7;
  },

  addOtherPayablesSection(doc, payrollData, yPosition) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Other Payables', 20, yPosition);

    const fmt = (v) => `₱${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const other = payrollData.otherPayables || {};
    const custom = payrollData.customFields || {};

    let currentY = yPosition + 10;

    // explicit other payables
    Object.entries(other).forEach(([k, v]) => {
      doc.text(this.toTitleCase(k), 20, currentY);
      doc.text(fmt(v), 160, currentY, { align: 'right' });
      currentY += 7;
    });

    // HR-created custom fields (merged into other payables)
    Object.entries(custom).forEach(([k, f]) => {
      if (f && (f.value !== undefined && f.value !== null)) {
        doc.text(this.toTitleCase(k), 20, currentY);
        doc.text(fmt(f.value), 160, currentY, { align: 'right' });
        currentY += 7;
      }
    });

    // Total
    const explicitTotal = Object.values(other || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    const customTotal = Object.values(custom || {}).filter(f => f && (f.value !== undefined && f.value !== null)).reduce((s, f) => s + (Number(f.value) || 0), 0);
    doc.text('Total Other Payables', 20, currentY);
    doc.text(fmt(explicitTotal + customTotal), 160, currentY, { align: 'right' });
    currentY += 7;
  },

  addNetPay(doc, payrollData, yPosition) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY', 20, yPosition);

    doc.setFontSize(14);
    doc.text(`₱${payrollData.netSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 160, yPosition, { align: 'right' });

    // Add a box around the net pay
    const boxWidth = 60;
    const boxHeight = 15;
    doc.rect(150 - boxWidth, yPosition - 10, boxWidth, boxHeight);
  },

  addFooter(doc, pageWidth, pageHeight, payrollData = {}, facultyProfile = {}) {
    const currentDate = format(new Date(), 'MMMM dd, yyyy');
    const currentTime = format(new Date(), 'HH:mm:ss');

  // Determine HR name via helper
  const hrName = this.getHrName(payrollData, facultyProfile);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${currentDate} at ${currentTime}`, 20, pageHeight - 30);
    doc.text('This is a system-generated payslip', pageWidth / 2, pageHeight - 30, { align: 'center' });

    // Signature area on the right
    const sigX = pageWidth - 90;
    const sigY = pageHeight - 50;
    doc.setLineWidth(0.5);
    // Place the HR name and underline it (name should be bold)
    if (hrName) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      // render name
      doc.text(hrName, sigX, sigY - 2);
      // underline: draw a short line matching text width under the name
      try {
        const textWidth = doc.getTextWidth ? doc.getTextWidth(hrName) : (hrName.length * 4);
        // slightly below the text baseline
        const underlineY = sigY - 1;
        doc.line(sigX, underlineY, sigX + textWidth, underlineY);
      } catch (e) {
        // fallback: draw a fixed-width underline
        doc.line(sigX, sigY - 1, sigX + 80, sigY - 1);
      }
    }
    // Place the role label under the underlined name (normal weight)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Human Resource', sigX, sigY + 8);

    doc.text('Page 1 of 1', pageWidth - 20, pageHeight - 20, { align: 'right' });
  }

  /**
   * Build printable HTML for a payslip (same template used by PayslipViewer)
   * @param {Object} payrollData
   * @param {Object} facultyProfile
   * @returns {string} HTML string
   */
  , buildPrintablePayslipHtml(payrollData, facultyProfile) {
    const esc = (v) => (v === null || v === undefined) ? '' : String(v);
    const formatDate = (d) => {
      try { return format(parseISO(d), 'MMM dd, yyyy'); } catch (e) { return esc(d); }
    };
    const formatMoney = (v) => `₱${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // Extract theme colors from facultyProfile (passed from PayrollDashboard)
    const themeColors = facultyProfile?.themeColors || {};
    console.log('buildPrintablePayslipHtml - FULL themeColors:', JSON.stringify(themeColors, null, 2));
    console.log('buildPrintablePayslipHtml - payslipHeaderBg value:', themeColors.payslipHeaderBg);
    console.log('buildPrintablePayslipHtml - payslipHeaderText value:', themeColors.payslipHeaderText);
    console.log('buildPrintablePayslipHtml - payslipCompensationBg value:', themeColors.payslipCompensationBg);
    
    // Use payslip-specific colors, with fallback to sidebar color, then default red
    const headerBg = themeColors.payslipHeaderBg || themeColors.sidebar || '#ef4444';
    const headerText = themeColors.payslipHeaderText || themeColors.sidebarText || '#ffffff';
    const compensationBg = themeColors.payslipCompensationBg || '#fff9c4';
    const compensationText = themeColors.payslipCompensationText || '#111827';
    
    console.log('🎨 FINAL COLORS USED - headerBg:', headerBg, 'headerText:', headerText, 'compensationBg:', compensationBg, 'compensationText:', compensationText);
  // Use robust fallbacks to derive base gross, additions, and allowances so we match
  // what the PayrollDashboard writes into saved records (legacy field shapes vary).
  const breakdown = payrollData.breakdown || {};

  const tryNumber = (v) => Number(v || 0);

  // Prefer breakdown.baseSalary first (most reliable source from PayrollDashboard)
  let baseGross = tryNumber(payrollData.preview?.breakdown?.baseSalary || breakdown.baseSalary);
  if (!baseGross) {
    const baseCandidates = [
      payrollData.grossSalary,
      payrollData.gross,
      payrollData.baseGross,
      breakdown.subtotalEarnings || breakdown.subtotal || breakdown.subtotal_earnings,
      (breakdown.hourly && breakdown.hourly.baseEarnings),
      (breakdown.hourly && breakdown.hourly.baseEarningsRaw)
    ];
    for (const c of baseCandidates) {
      const n = tryNumber(c);
      if (n && n > baseGross) baseGross = n;
    }
  }

  // additionsTotal: prefer explicit totals, additionsBreakdown, then sum of addition entries
  const sumObjectValues = (obj) => Object.entries(obj || {}).filter(([k]) => k !== 'total').reduce((s, [, v]) => s + (tryNumber(v) || 0), 0);
  // Merge possible additions sources (legacy shapes vary)
  const mergedAdditions = {
    ...(payrollData.additions || {}),
    ...(payrollData.additionsBreakdown || {}),
    ...(payrollData.breakdown && payrollData.breakdown.additions ? payrollData.breakdown.additions : {}),
    ...(payrollData.breakdown && payrollData.breakdown.additionsBreakdown ? payrollData.breakdown.additionsBreakdown : {}),
    ...(payrollData.preview && payrollData.preview.additions ? payrollData.preview.additions : {})
  };
  
  // Prefer breakdown.totalAdditions (from preview or direct), then sum of entries (excluding 'total' key to avoid double-counting)
  const additionsTotal = tryNumber(
    payrollData.preview?.breakdown?.totalAdditions
    || (payrollData.additions && payrollData.additions.total)
    || payrollData.additionsTotal
    || payrollData.additionsTotalAmount
    || payrollData.additionsBreakdown?.total
    || payrollData.breakdown?.totalAdditions
  ) || sumObjectValues(mergedAdditions) || 0;

  const allowancesTotal = tryNumber(
    (payrollData.allowances && payrollData.allowances.total) || payrollData.allowancesTotal || payrollData.breakdown?.totalAllowances
  ) || sumObjectValues(payrollData.allowances) || 0;

  // Some saved records include a precomputed total earnings field or a calculation preview object. Prefer that.
  // FIRST PRIORITY: Use saved totalEarnings if available (this is what the dashboard saved)
  const precomputedTotalEarnings = tryNumber(
    payrollData.totalEarnings
    || payrollData.preview?.totalEarnings
    || payrollData.breakdown?.totalEarnings
    || payrollData.total_earnings
    || payrollData.totals?.earnings
    || payrollData.totals?.totalEarnings
    || payrollData.calculationPreview?.totalEarnings
    || payrollData.calculationPreview?.totals?.earnings
    || payrollData.preview?.totals?.earnings
    || (
      payrollData.preview?.breakdown?.baseSalary && payrollData.preview?.breakdown?.totalAdditions
        ? payrollData.preview.breakdown.baseSalary + payrollData.preview.breakdown.totalAdditions + (payrollData.preview.breakdown?.overtimeEarnings || 0)
        : 0
    )
    || 0
  );

  // Use precomputed if available, else compute from base + additions + overtime (no allowances)
  // IMPORTANT: Only use preview values, not mixed with breakdown
  const totalEarnings = precomputedTotalEarnings || (
    payrollData.preview 
      ? (payrollData.preview.breakdown?.baseSalary || 0) + (payrollData.preview.breakdown?.totalAdditions || 0) + (payrollData.preview.breakdown?.overtimeEarnings || 0)
      : (baseGross + additionsTotal)
  );

  const totalAllowances = allowancesTotal;

  // netSalary/netAmount may be stored under different keys; prefer saved value
  const net = tryNumber(payrollData.netSalary || payrollData.netAmount || payrollData.net || payrollData.netPay || breakdown.netSalary || 0);
  const totalDeductions = tryNumber(
    (payrollData.deductions && payrollData.deductions.total) || payrollData.totalDeductions || payrollData.totals?.deductions || breakdown.totalDeductions || 0
  );

    // ✅ DIRECT ACCESS: Get additions, allowances, deductions as-is from payrollData
    const additions = mergedAdditions || {};
    const allowances = payrollData.allowances || {};
    const deductions = payrollData.deductions || {};
    const customFields = payrollData.customFields || {};

    // ✅ BUILD DEDUCTION ROWS - JUST FORMAT THE EXISTING DEDUCTIONS
    const deductionRows = [];
    const customKeysLower = Object.keys(customFields || {}).map(k => String(k).toLowerCase());
    const excludedHardcoded = new Set(['withholding', 'dhvsu', 'withholdingtax', 'dhvsutax']);
    if (deductions) {
      const deductionNormalized = new Set();
      Object.entries(deductions).forEach(([k, v]) => {
        if (k === 'total') return;
        const kl = String(k).toLowerCase();
        // skip duplicate singular lateDeduction
        if (kl === 'latededuction') return;
        const kNorm = kl.replace(/[^a-z0-9]/g, '');
        if (deductionNormalized.has(kNorm)) return;
        // Show all deductions including zero values
        if (customKeysLower.includes(kl)) return;
        if (excludedHardcoded.has(kl)) return;
        deductionRows.push([this.toTitleCase(k), formatMoney(v)]);
        deductionNormalized.add(kNorm);
      });
    }

    // ✅ BUILD OTHER PAYABLES ROWS - USE CUSTOM FIELDS
    const otherRows = [];
    const otherPayables = payrollData.otherPayables || {};
    Object.entries(otherPayables).forEach(([k, v]) => otherRows.push([this.toTitleCase(k), formatMoney(v)]));
    Object.entries(customFields).forEach(([k, f]) => {
      if (f && (f.value !== undefined && f.value !== null)) {
        const exists = otherRows.some(r => String(r[0]).toLowerCase() === String(k).toLowerCase());
        if (!exists) otherRows.push([this.toTitleCase(k), formatMoney(f.value)]);
      }
    });

    // ✅ COMPUTE OTHER PAYABLES TOTAL
    let otherPayablesTotal = Number(payrollData.otherPayablesTotal || 0);
    if (otherPayablesTotal === 0) {
      const fromOther = Object.values(otherPayables || {}).reduce((s, v) => s + (Number(v) || 0), 0);
      const fromCustom = Object.values(customFields || {}).filter(f => f && (f.value !== undefined && f.value !== null)).reduce((s, f) => s + (Number(f.value) || 0), 0);
      otherPayablesTotal = fromOther + fromCustom;
    }

    // ✅ HR NAME FOR SIGNATURE
    const hrName = this.getHrName(payrollData, facultyProfile);

    // Inline styles similar to the original PayslipViewer, with dynamic colors
    const style = `
      body{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; margin:0; padding:24px; color:#111}
      .wrapper{max-width:800px;margin:0 auto;background:#fff;padding:20px;border-radius:6px;box-shadow:0 0 0 1px rgba(0,0,0,0.03)}
      .header{text-align:center;margin-bottom:12px}
      .two-col{display:flex;justify-content:space-between;margin-bottom:12px}
      .ribbon{display:block;padding:6px 10px;border-radius:4px;color:${headerText};font-weight:700;background:${headerBg}}
      .ribbon.employee{background:${compensationBg};color:${compensationText};border:1px solid #f0e68c}
      .ribbon.compensation{background:${headerBg};color:${headerText}}
      .ribbon.deductions{background:${headerBg};color:${headerText}}
      .ribbon.other{background:${headerBg};color:${headerText}}
      .cards{display:flex;gap:10px;margin-bottom:14px}
      .card{flex:1;padding:12px;border-radius:6px;color:#111;text-align:center;border:1px solid rgba(0,0,0,0.04)}
      .card.green{background:#f0fff4;border-color:#bbf7d0}
      .card.red{background:#fff5f5;border-color:#feb2b2}
      .card.blue{background:#eff6ff;border-color:#bfdbfe}
      .section{display:flex;gap:14px}
      .col{flex:1}
      table{width:100%;border-collapse:collapse}
      td,th{padding:6px;border-bottom:1px solid #f3f3f3}
      .summary{margin-top:10px;padding-top:8px;border-top:1px solid #eee}
      .footer{margin-top:18px;display:flex;justify-content:space-between;align-items:center}
      .muted{color:#666;font-size:12px}
      .label{font-size:12px;color:#444}
      .value{font-weight:700}
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @media print {
        .ribbon.employee, .ribbon.compensation, .ribbon.deductions, .ribbon.other, .card.green, .card.red, .card.blue { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ribbon.employee{border-top:8px solid ${compensationBg}}
        .ribbon.compensation{border-top:10px solid ${headerBg}}
        .ribbon.deductions{border-top:10px solid ${headerBg}}
        .ribbon.other{border-top:10px solid ${headerBg}}
      }
    `;

    // ✅ BUILD EARNINGS ROWS - DISPLAY IN DASHBOARD ORDER
    // Use preview.additions if available (exact Dashboard data), otherwise use merged additions
    const displayAdditions = payrollData.preview?.additions || additions;
    const displayBreakdown = payrollData.preview?.breakdown || breakdown;
    const displayAllowances = payrollData.preview?.allowances || allowances;
    
    const allowanceRowsHtml = (() => {
      const rows = [];
      const rendered = new Set();

      // Helper to find a value in additions (case-insensitive keys)
      const findAdd = (patterns) => {
        const keys = Object.keys(displayAdditions || {});
        for (const p of patterns) {
          const re = new RegExp(p, 'i');
          const k = keys.find(k => re.test(k));
          if (k) return Number(displayAdditions[k] || 0);
        }
        return 0;
      };

      // Fixed order to match HR payslip (show even if zero)
      const orderedFields = [
        {label: 'Base Pay', getter: () => Number(displayBreakdown.baseSalary || 0)},
        {label: 'Overtime', getter: () => Number(displayBreakdown.overtimeEarnings || displayBreakdown.overtime || 0)},
        {label: 'Bonus', getter: () => findAdd(['bonus'])},
        {label: 'Holiday Pay', getter: () => findAdd(['holiday', 'holidayPay', 'holiday_pay'])},
        {label: 'Night Differential', getter: () => findAdd(['night', 'differential', 'nightDifferential'])},
        {label: 'Thirteenth Month', getter: () => findAdd(['thirteenth', '13th', 'thirteenthMonth'])},
        {label: 'Leave Conversion', getter: () => findAdd(['leaveConversion', 'leave_conversion', 'leaveconversion'])},
        {label: 'Special Holiday Pay', getter: () => findAdd(['specialHoliday', 'special_holiday', 'specialHolidayPay'])}
      ];

      for (const f of orderedFields) {
        const val = f.getter();
        rows.push(`<tr><td>${f.label}</td><td style="text-align:right">${formatMoney(val)}</td></tr>`);
        rendered.add(f.label.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }

      // Render any remaining additions from displayAdditions in Dashboard order (excluding 'total' and already rendered keys)
      Object.entries(displayAdditions || {}).forEach(([k, v]) => {
        if (k === 'total') return;
        const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (rendered.has(kNorm)) return;
        rows.push(`<tr><td>${this.toTitleCase(k)}</td><td style="text-align:right">${formatMoney(v)}</td></tr>`);
        rendered.add(kNorm);
      });

      // Total Earnings (pre-calculated or computed)
      rows.push(`<tr style="font-weight:700;border-top:1px solid #eee"><td>Total Earnings</td><td style="text-align:right">${formatMoney(totalEarnings)}</td></tr>`);

      return rows.join('\n');
    })();

    // Ensure canonical deduction order and include zero-value fields like HR payslip
    const buildDeductionHtml = () => {
      const keys = Object.keys(deductions || {});
      // exclude specific unwanted deduction keys (singular lateDeduction, withholding, dhvsu)
      const isExcludedKey = (k) => {
        if (!k) return false;
        const kl = String(k).toLowerCase();
        return (/^withholding$/i.test(kl) || /^dhvsu$/i.test(kl) || /^withholdingtax$/i.test(kl) || /^latededuction$/i.test(kl));
      };

      const findKey = (patterns) => {
        for (const p of patterns) {
          const re = new RegExp(p, 'i');
          const k = keys.find(k => re.test(k) && !isExcludedKey(k));
          if (k) return k;
        }
        return null;
      };

      const ordered = [
        {label: 'Sss', patterns: ['^sss$','social security','sss']},
        {label: 'Philhealth', patterns: ['philhealth']},
        {label: 'Pagibig', patterns: ['pagibig', 'pag-?ibig']},
        {label: 'Tax', patterns: ['tax']},
        // Only match plural late deductions (do NOT match singular 'lateDeduction')
        {label: 'Late Deductions', patterns: ['latedeductions','late[_ -]?deductions','lateDeductions']}
      ];

      const used = new Set();
      const rows = [];

      for (const od of ordered) {
        const k = findKey(od.patterns);
        const val = k ? Number(deductions[k] || 0) : 0;
        rows.push(`<tr><td>${od.label}</td><td style="text-align:right">${formatMoney(val)}</td></tr>`);
        if (k) used.add(k);
      }

      // Append any remaining deduction entries (preserve original order) that weren't included above
      Object.entries(deductions || {}).forEach(([k, v]) => {
        if (k === 'total') return;
        if (used.has(k)) return;
        if (isExcludedKey(k)) return; // skip excluded keys
        rows.push(`<tr><td>${this.toTitleCase(k)}</td><td style="text-align:right">${formatMoney(v)}</td></tr>`);
      });

      return rows.join('\n');
    };

    const deductionRowsHtml = buildDeductionHtml();
    const otherRowsHtml = otherRows.map(r => `<tr><td>${esc(r[0])}</td><td style="text-align:right">${esc(r[1])}</td></tr>`).join('\n');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip - ${esc(facultyProfile.name || facultyProfile.employeeId || '')}</title><style>${style}</style></head><body>
      <div class="wrapper">
        <div class="header">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
            <div style="display:flex;align-items:center;gap:0px">
              ${facultyProfile.companyBranding && facultyProfile.companyBranding.logo ? `<img src="${esc(facultyProfile.companyBranding.logo)}" alt="logo" style="width:72px;height:72px;object-fit:contain;display:block" />` : '<div style="width:72px;height:72px;background:#f3f4f6;border-radius:8px"></div>'}
              <h2 style="margin:0;text-align:left">${esc(facultyProfile.companyBranding?.name || 'Fingerprint Attendance System Tracking and Payroll')}</h2>
            </div>
            <div class="muted" style="text-align:center">${esc(facultyProfile.companyBranding?.tagline || 'Human Resources Department • Payroll Management System')}</div>
          </div>
        </div>

        <div class="two-col">
          <div>
            <div class="muted">Employee Name:</div>
            <div style="font-weight:700">${esc(facultyProfile.name || payrollData.employeeInfo?.name || '—')}</div>
            <div class="muted" style="margin-top:8px">Position:</div>
            <div>${esc(facultyProfile.position || payrollData.position || payrollData.employeeInfo?.position || payrollData.employeeInfo?.salaryInfo?.position || '')}</div>
            <div class="muted" style="margin-top:8px">Salary Grade/Step:</div>
            <div>${esc(payrollData.salaryGrade || '')}</div>
          </div>
          <div style="text-align:right">
            <div class="muted">Employee ID:</div>
            <div style="font-weight:700">${esc(facultyProfile.employeeId || payrollData.employeeInfo?.facultyId || '')}</div>
            <div class="muted" style="margin-top:8px">Employment Status:</div>
            <div>${esc(payrollData.employmentStatus || '')}</div>
            <div class="muted" style="margin-top:8px">Generated:</div>
            <div>${esc(payrollData.generatedAt ? format(parseISO(payrollData.generatedAt), 'MMM dd, yyyy HH:mm') : '')}</div>
            <div class="muted" style="margin-top:8px">Pay Period:</div>
            <div>${esc(formatDate(payrollData.periodStart))} - ${esc(formatDate(payrollData.periodEnd))}</div>
          </div>
        </div>

        <!-- Compensation block: Earnings moved to left column to use the empty space -->
        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:1">
            <!-- Earnings ribbon (uses dynamic payslip header color) -->
            <div class="ribbon" style="text-align:center;margin-bottom:6px">EARNINGS</div>
            <table style="width:100%;border-collapse:collapse">
              <tbody>
                ${allowanceRowsHtml || `<tr><td>Allowances</td><td style="text-align:right">${esc('₱' + totalAllowances.toLocaleString('en-US', {minimumFractionDigits:2}))}</td></tr>`}
              </tbody>
            </table>
            <div class="ribbon" style="margin-top:6px">TOTAL EARNINGS: ₱${Number(totalEarnings || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</div>
          </div>
          <div style="width:320px">
            <div class="ribbon compensation" style="border-radius:4px 4px 0 0;font-weight:700;letter-spacing:2px">COMPENSATION</div>
            <table style="width:100%;border-collapse:collapse">
              <tbody>
                <tr style="background:#fff9c4"><td style="padding:6px">Total Earnings:</td><td style="text-align:right;padding:6px">${esc('₱' + Number(totalEarnings || 0).toLocaleString('en-US', {minimumFractionDigits:2}))}</td></tr>
                <tr style="background:#fff9c4"><td style="padding:6px">Less: Total Deductions</td><td style="text-align:right;padding:6px">${esc('₱' + Number(totalDeductions || 0).toLocaleString('en-US', {minimumFractionDigits:2}))}</td></tr>
                <tr style="background:#fff9c4"><td style="padding:6px">Less: Other Payables</td><td style="text-align:right;padding:6px">${esc('₱' + Number(otherPayablesTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2}))}</td></tr>
                <tr style="background:#fce4ec"><td style="padding:6px;font-weight:700">Net Amount Earned:</td><td style="text-align:right;padding:6px;font-weight:700">${esc('₱' + net.toLocaleString('en-US', {minimumFractionDigits:2}))}</td></tr>
              </tbody>
            </table>
            <!-- Other Payables rendered as a separate block under the Compensation column -->
            ${otherRows.length > 0 ? `
              <div style="margin-top:10px">
                <div class="ribbon other" style="text-align:center;margin-bottom:6px">OTHER PAYABLES</div>
                <table style="width:100%;border-collapse:collapse">
                  <tbody>
                    ${otherRowsHtml}
                  </tbody>
                </table>
                <div class="ribbon other" style="margin-top:6px">OTHER PAYABLES: ₱${Number(otherPayablesTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="section">
          <div class="col">
            <!-- keep only the styled ribbon for Deductions -->
            <div class="ribbon deductions" style="text-align:center;margin-bottom:6px">DEDUCTIONS</div>
            <table>
              ${deductionRowsHtml}
            </table>
            <div class="ribbon deductions" style="margin-top:6px">DEDUCTIONS: ₱${Number(totalDeductions || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</div>
          </div>
        </div>

        <!-- Other Payables moved under the Compensation column -->

        <div class="footer">
          <div class="muted">Printed: ${format(new Date(), 'MMM dd, yyyy HH:mm')}</div>
          <div style="text-align:right">
            <div style="font-weight:700;text-decoration:underline;margin-bottom:6px">${esc(hrName)}</div>
            <div style="font-weight:normal">Human Resource</div>
          </div>
        </div>
      </div>
      <script>window.onload = function(){ setTimeout(()=>{ window.print(); }, 300); };<\/script>
    </body></html>`;

    return html;
  }
};
