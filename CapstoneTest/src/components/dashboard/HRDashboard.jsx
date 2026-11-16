import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  Download,
  Calendar,
  UserCheck,
  AlertCircle,
  Search,
  Filter,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  DollarSign
} from 'lucide-react';
import AttendanceChart from '../attendance/AttendanceChart';
import ScheduleOverview from '../attendance/ScheduleOverview';
import { useUsers } from '../../hooks/useUsers';
import { useAttendance } from '../../hooks/useAttendance';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import { useHRDashboard } from '../../hooks/useHRDashboard';
import { attendanceService } from '../../services/attendanceService';
import { scheduleService } from '../../services/scheduleService';
import { getLatestRecordPerUser } from '../../utils/attendanceUtils';
import { firebaseService } from '../../services/firebaseService';
import * as leaveService from '../../services/leaveService';
import { auth } from '../../firebase';
// MergeNowButton moved to RealTimeSync page

export default function HRDashboardEnhanced() {
  const { users, attendance, leaveRequests, loading, error } = useHRDashboard();
  const [schedules, setSchedules] = React.useState(null);
  const [todayLateCount, setTodayLateCount] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const allSchedules = await scheduleService.getStaffSchedules();
        if (!mounted) return;
        // create map by userId for quick lookup
        const map = new Map();
        (allSchedules || []).forEach(s => { if (s && s.userId) map.set(String(s.userId), s); });
        setSchedules(map);
      } catch (e) {
        console.warn('Failed to load schedules for dashboard', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Fetch summary counts (todayLate) from attendanceService to ensure dashboard cards reflect
  // the authoritative per-user computation (handles timezone and schedule rules).
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await attendanceService.getSummary();
  console.log('[HRDashboard] attendanceService.getSummary ->', s);
        if (!mounted) return;
        setTodayLateCount(typeof s.todayLate === 'number' ? s.todayLate : 0);
      } catch (e) {
        console.warn('Failed to fetch attendance summary for dashboard', e);
      }
    })();

    return () => { mounted = false; };
  }, [users]);

  const [queryText, setQueryText] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const perPage = 5;
  const navigate = useNavigate();

  // Helper to return canonical id keys to match different shapes
  const getIdKeys = (obj) => {
    if (!obj) return [];
    return [obj.employeeId, obj.userId, obj.id].filter(Boolean).map(String);
  };

  // Build employee list from users data with real-time attendance
  const employees = useMemo(() => {
    if (!users || !attendance) return [];

    // Build a lookup of today's approved leaves by canonical id
    // Use date-only (YYYY-MM-DD) comparisons to avoid time-of-day timezone issues.
    const todayStr = new Date().toISOString().slice(0, 10);
    const isOnLeaveToday = new Set();
    if (Array.isArray(leaveRequests)) {
      leaveRequests.forEach((lr) => {
        if (!lr || (lr.status || '').toLowerCase() !== 'approved') return;
        const startStr = lr.startDate || (lr.createdAt ? new Date(lr.createdAt).toISOString().slice(0,10) : null);
        const endStr = lr.endDate || startStr;
        if (!startStr) return;
        // compare lexicographically because format is YYYY-MM-DD
        if (startStr <= todayStr && todayStr <= endStr) {
          getIdKeys(lr).forEach(k => isOnLeaveToday.add(k));
        }
      });
    }

    // Exclude administrative HR users from employee lists
  return users.filter(u => (u && (u.role || '').toString().toLowerCase() !== 'hr')).map(user => {
      // Build set of possible id keys for this user
      const keys = getIdKeys(user);
      // Find all attendance records for this user for today
      const userAttendance = (attendance || []).filter(record => keys.includes(String(record.userId)) || keys.includes(String(record.employeeId)));

      // Find schedule for user from preloaded schedules map when available
      const uid = keys[0] || (user && (user.id || user.userId || user.facultyId));
      const sched = schedules && uid ? schedules.get(String(uid)) : null;

      // Compute status using attendanceService helper (in-memory)
      const manila = attendanceService.getManilaNow();
      const statusInfo = attendanceService.computeDailyStatusFromData(sched, userAttendance, manila.nowMinutes, manila.todayKey);
      const baseStatus = statusInfo && statusInfo.status ? statusInfo.status : 'Unknown';
      const finalStatus = keys.some(k => isOnLeaveToday.has(String(k))) ? 'on leave' : baseStatus;

      // Use canonical id (prefer facultyId then id)
      const canonicalId = keys[0] || '';

      return {
        id: canonicalId,
        name: user.name,
        // show roles in place of department in the directory
        department: user.role,
        email: user.email,
        role: user.role,
        employeeType: user.employeeType,
        status: finalStatus,
      };
    });
  }, [users, attendance, leaveRequests]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalEmployees = employees.length;
    const presentCount = employees.filter(e => (e.status || '').toLowerCase() === 'present').length;
    const safeLeaves = Array.isArray(leaveRequests) ? leaveRequests : [];
    const pendingLeavesCount = safeLeaves.filter(lr => (lr?.status || '').toString().toLowerCase() === 'pending').length;

    return {
      totalEmployees,
      todayPresent: presentCount,
      pendingLeaves: pendingLeavesCount,
    };
  }, [employees, leaveRequests]);

  // Manual sync button moved to RealTimeSync route

  const filtered = useMemo(() => {
    let filtered = employees;

    // Apply search filter
    const q = queryText.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (e) =>
          (e.name || '').toLowerCase().includes(q) ||
          (e.id || '').toString().toLowerCase().includes(q) ||
          (e.department || '').toLowerCase().includes(q) ||
          (e.email || '').toLowerCase().includes(q)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => {
        const status = (e.status || '').toLowerCase();
        switch (statusFilter) {
          case 'present':
            return status === 'present';
          case 'late':
            return status === 'late';
          case 'on leave':
            return status === 'on leave';
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [employees, queryText, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  // Calculate additional statistics
  const stats = useMemo(() => {
    const total = employees.length;
    const present = employees.filter(e => (e.status || '').toLowerCase() === 'present').length;
    const late = employees.filter(e => (e.status || '').toLowerCase() === 'late').length;
    const onLeave = employees.filter(e => (e.status || '').toLowerCase() === 'on leave').length;

    const presentRate = total > 0 ? Math.round((present / total) * 100) : 0;
    const lateRate = total > 0 ? Math.round((late / total) * 100) : 0;
    const onLeaveRate = total > 0 ? Math.round((onLeave / total) * 100) : 0;

    return {
      total,
      present,
      late,
      onLeave,
      presentRate,
      lateRate,
      onLeaveRate
    };
  }, [employees]);

  const approveAllLeaves = async () => {
    try {
      const safeLeaves = Array.isArray(leaveRequests) ? leaveRequests : [];
      const pendingLeaves = safeLeaves.filter(lr => (lr?.status || '').toString().toLowerCase() === 'pending');

      if (!pendingLeaves || pendingLeaves.length === 0) {
        alert('No pending leaves found.');
        return;
      }

      // Update each pending leave to approved via centralized leaveService
      for (const leave of pendingLeaves) {
        // leave object shape: { id, facultyId, ... }
        const facultyId = leave?.facultyId || leave?.faculty_id || leave?.userId || leave?.user_id;
        const id = leave?.id;
        if (!facultyId || !id) continue;
        // Use current auth user as approver when available
        const approverId = auth && auth.currentUser ? (auth.currentUser.uid || auth.currentUser.email || '') : '';
        await leaveService.approveLeave({ facultyId: String(facultyId), requestId: String(id), approverId, decisionComment: 'Bulk approved via HR Dashboard' });
      }

      alert('All pending leaves approved.');
    } catch (err) {
      console.error('approveAllLeaves error', err);
      alert('Failed to approve leaves.');
    }
  };

  const exportCSV = () => {
    if (!employees || employees.length === 0) {
      alert('No employees to export.');
      return;
    }
  const headers = ['ID', 'Name', 'Role', 'Status', 'Email'];
  const rows = employees.map((e) => [e.id, e.name, e.role, e.status, e.email]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'on leave':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'late':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'on leave':
        return <Calendar className="w-4 h-4 text-blue-600" />;
      default:
        return <UserCheck className="w-4 h-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-white rounded-lg shadow"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-lg shadow"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-80 bg-white rounded-lg shadow"></div>
              <div className="h-80 bg-white rounded-lg shadow"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Dashboard</h2>
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">HR Dashboard</h1>
          <p className="text-gray-600 text-lg">Comprehensive HR management and attendance insights</p>
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-gray-500">Active workforce</span>
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
                <p className="text-sm font-medium text-gray-600">Present Today</p>
                <p className="text-2xl font-bold text-green-600">{stats.present}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-green-600 flex items-center">
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                    {stats.presentRate}% rate
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Late Arrivals</p>
                <p className="text-2xl font-bold text-yellow-600">{(todayLateCount !== null) ? todayLateCount : stats.late}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-yellow-600 flex items-center">
                    <ArrowDownRight className="w-3 h-3 mr-1" />
                    {(() => {
                      const late = (todayLateCount !== null) ? todayLateCount : stats.late;
                      const rate = stats.total > 0 ? Math.round((late / stats.total) * 100) : 0;
                      return `${rate}% rate`;
                    })()}
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Leaves</p>
                <p className="text-2xl font-bold text-blue-600">{summary.pendingLeaves}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-blue-600">Requires action</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
        </motion.div>



        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/enrollment')}
              className="flex items-center gap-3 p-4 border bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition w-full h-full justify-center"
            >
              <UserCheck className="w-5 h-5" />
              <span className="font-medium">Add Employee</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/settings')}
              className="flex items-center gap-3 p-4 border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition w-full h-full justify-center"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Manage Roles</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/realtime-sync')}
              className="flex items-center gap-3 p-4 border bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition w-full h-full justify-center"
            >
              <RefreshCw className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <span className="font-medium">Open Real-Time Sync</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/payroll-dashboard')}
              className="flex items-center gap-3 p-4 border bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition w-full h-full justify-center"
            >
              <DollarSign className="w-5 h-5" />
              <span className="font-medium">Generate Payroll</span>
            </motion.button>
          </div>

          {/* Additional Actions Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 items-stretch">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/leave-management')}
              className="flex items-center gap-3 p-4 border bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition w-full h-full justify-center col-span-1 sm:col-span-2 lg:col-span-2"
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">Review Pending Leaves</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={exportCSV}
              className="flex items-center gap-3 p-4 border bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition w-full h-full justify-center col-span-1 sm:col-span-2 lg:col-span-2"
            >
              <Download className="w-5 h-5" />
              <span className="font-medium">Export Reports</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees by name, ID, role, or email..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                  value={queryText}
                  onChange={(e) => {
                    setQueryText(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Search employees"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Toggle filters"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: showFilters ? 1 : 0,
              height: showFilters ? "auto" : 0
            }}
            className="mt-4 pt-4 border-t border-gray-200 overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="on leave">On Leave</option>
                </select>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Charts Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-800">Attendance Insights</h2>
            </div>
            <div className="text-sm text-gray-600">
              Real-time attendance data
            </div>
          </div>
          <AttendanceChart statusFilter={statusFilter} queryText={queryText} />
        </motion.div>

        {/* Employee Table */}
        {/* Schedule Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <ScheduleOverview />
        </motion.div>

      </div>
    </div>
  );
}
