import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Calendar,
  RefreshCw,
  Download,
  FileText,
  Eye,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { isDarkMode, addThemeChangeListener } from '../../utils/themeUtils';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';
import { getPayrollRecordsForPeriod, getPayrollRecord, markPayslipPrinted, calculatePayrollFromFirebase } from '../../services/payrollService';
import { payslipService } from '../../services/payslipService';
import { firebaseService } from '../../services/firebaseService';
import useAuth from '../../contexts/authcontext';

// Minimal local helpers and placeholders so the component compiles.
const formatCurrency = (v) => (typeof v === 'number' ? '₱' + v.toLocaleString() : (v ? String(v) : '₱0'));
const formatDeductionLabel = (k) => k;

const PayslipViewer = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [filteredPayslips, setFilteredPayslips] = useState([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();
  const { user } = useAuth();
  const { companyBranding, themeColors } = useSystemSettings();

  const loadPayrollRecords = async (period) => {
    setLoading(true);
    try {
      const periodToLoad = period || selectedPeriod;
      // If a user is present, fetch only their payslips so employees see only their own records
      const viewerId = (window.currentUser && (window.currentUser.facultyId || window.currentUser.userId || window.currentUser.uid)) || (user && (user.facultyId || user.userId || user.uid)) || null;
      let records = await getPayrollRecordsForPeriod(periodToLoad, viewerId);
      
      // Fetch all employees to enrich payslip data with missing fields
      if (records && records.length > 0) {
        try {
          const allEmployees = await firebaseService.getEmployees();
          const employeeMap = {};
          
          // Build map of employees by userId/facultyId for quick lookup
          if (allEmployees && allEmployees.length > 0) {
            allEmployees.forEach(emp => {
              if (emp.userId) employeeMap[String(emp.userId)] = emp;
              if (emp.facultyId) employeeMap[String(emp.facultyId)] = emp;
            });
          }
          
          // Enrich each payslip with employee data and fetch full details from DB
          records = await Promise.all(records.map(async (payslip) => {
            const empId = String(payslip.facultyId || payslip.userId || payslip.id);
            const employeeData = employeeMap[empId];
            
            // Fetch full payroll record from database to ensure accurate calculations
            let fullRecord = payslip;
            try {
              const detailedRecord = await getPayrollRecord(empId, periodToLoad);
              if (detailedRecord) {
                fullRecord = detailedRecord;
              }
            } catch (err) {
              console.warn(`Failed to fetch full payroll record for ${empId}:`, err);
            }
            
            if (employeeData) {
              return {
                ...fullRecord,
                facultyName: fullRecord.facultyName || employeeData.name || employeeData.displayName || '',
                position: fullRecord.position || employeeData.position || employeeData.salaryInfo?.position || '',
                department: fullRecord.department || employeeData.department || '',
              };
            }
            return fullRecord;
          }));
        } catch (err) {
          console.warn('Failed to fetch employee data to enrich payslips:', err);
          // Continue with original records if enrichment fails
        }
      }
      
      setFilteredPayslips(records || []);
    } catch (err) {
      console.error('Failed to load payroll records', err);
      setFilteredPayslips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wrapped = async () => {
      await loadPayrollRecords(selectedPeriod);
    };
    wrapped();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const handleViewPayslip = async (p) => {
    // Fetch full payroll record from database to ensure complete calculation data
    const period = selectedPeriod;
    const empId = p.facultyId || p.userId || p.id;
    
    try {
      const fullRecord = (await getPayrollRecord(empId, period)) || p || {};

      // Use the saved record data directly - it should have the same structure as what HR saved
      // The payrollData should include the preview object with all the Dashboard values
      const payrollData = { 
        ...fullRecord,
        // Ensure preview is properly set if it exists
        preview: fullRecord.preview || fullRecord
      };

      // Ensure period bounds exist (fall back to row values only if missing)
      if (!payrollData.periodStart && p.periodStart) payrollData.periodStart = p.periodStart;
      if (!payrollData.periodEnd && p.periodEnd) payrollData.periodEnd = p.periodEnd;

      // Preserve original generatedAt if present (HR preview timestamp). Otherwise set now.
      if (!payrollData.generatedAt) payrollData.generatedAt = new Date().toISOString();

      // Ensure hrName exists (prefer saved value, fallback to current user)
      payrollData.hrName = payrollData.hrName || fullRecord.hrName || fullRecord.savedBy || (user && user.name) || '';

      // Build faculty profile from the saved record when possible
      const facultyProfile = {
        name: fullRecord?.employeeInfo?.name || p.facultyName || p.name || '',
        employeeId: empId,
        position: fullRecord?.employeeInfo?.position || fullRecord.position || fullRecord?.employeeInfo?.type || fullRecord?.employeeInfo?.role || p.position || fullRecord?.salaryInfo?.position || '',
        department: fullRecord?.employeeInfo?.department || fullRecord.department || p.department || '',
        companyBranding: companyBranding || {},
        themeColors: themeColors || {}
      };

      // Use payslipService to build and display the printable HTML (same as PayrollDashboard)
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
      console.error('Failed to view payslip:', err);
      alert('Failed to load payslip. Please try again.');
    }
  };

  // Minimal stub to avoid uncaught exceptions when clicking Download (not implemented here)
  const handleDownloadPayslip = (p, format) => {
    console.warn('handleDownloadPayslip not implemented', p, format);
    alert('Download not implemented in this build. Use View to open printable payslip.');
  };

  const handlePrintPayslip = async (p) => {
    try {
      const period = selectedPeriod;
      const id = p.facultyId || p.userId || p.id;
      // mark printed for audit
      await markPayslipPrinted(id, period);
      // refresh list so lastPrintedAt appears
      await loadPayrollRecords(period);
    } catch (err) {
      console.error('Failed to mark printed', err);
      alert('Failed to record printed audit.');
    }
  };

  const getStatusBadge = (status) => {
    if (!status) return (<span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full">Unknown</span>);
    switch (status) {
      case 'processed':
        return (<span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">Processed</span>);
      case 'pending':
      case 'processing':
        return (<span className="px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full">Pending</span>);
      default:
        return (<span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-full">Error</span>);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Payslip Viewer</h1>
          <p className="text-gray-600 text-lg">View and download your payslips</p>
        </motion.div>

        {/* Search and Filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border border-gray-200 dark:border-gray-700 mb-8"
        >
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by name or employee ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="month"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedPeriod('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Statistics Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-8"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Total Payslips</p>
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{filteredPayslips.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All records</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Processed</p>
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{filteredPayslips.filter(p => p.status === 'processed').length}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">Ready to release</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Pending</p>
              <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{filteredPayslips.filter(p => p.status === 'processing' || p.status === 'pending').length}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">In progress</p>
          </div>
        </motion.div>

        {/* Payslips Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700"
        >
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payslips</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pay Period</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gross Pay</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Pay</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPayslips.map((payslip, index) => (
                  <motion.tr
                    key={payslip.id || payslip.facultyId || payslip.userId || index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      <div>{payslip.periodStart ? (() => { try { return format(parseISO(payslip.periodStart), 'MMM yyyy'); } catch (e) { return payslip.periodStart; }})() : '—'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{payslip.periodStart ? (() => { try { return format(parseISO(payslip.periodStart), 'dd'); } catch (e) { return ''; }})() : ''} - {payslip.periodEnd ? (() => { try { return format(parseISO(payslip.periodEnd), 'dd'); } catch (e) { return ''; }})() : ''}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{payslip.facultyName || 'N/A'}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{payslip.employeeId || payslip.facultyId || payslip.userId || 'N/A'}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatCurrency(payslip.grossSalary || 0)}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatCurrency(payslip.netSalary || 0)}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{getStatusBadge(payslip.status)}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={() => handleViewPayslip(payslip)} className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 flex items-center justify-center space-x-1">
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        <button onClick={() => handleDownloadPayslip(payslip, 'excel')} className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 flex items-center justify-center space-x-1">
                          <FileText className="h-4 w-4" />
                          <span>Excel</span>
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredPayslips.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No payslips found</h3>
              <p className="text-gray-500 dark:text-gray-400">{searchTerm || selectedPeriod ? 'Try adjusting your search criteria' : 'No payslips available for the selected period'}</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default PayslipViewer;