import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { firebaseService } from '../../services/firebaseService';
import { scheduleService } from '../../services/scheduleService';
import { normalizeAttendanceForUI, pairAttendanceRecords } from '../../utils/attendanceUtils';
import {
  BarChart3,
  Users,
  Download,
  Calendar,
  Clock,
  UserCog,
  CheckCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClockIcon
} from 'lucide-react';
import { createAccessibleChartConfig, getAccessibleColors, applyThemeToOptions } from '../../utils/chartConfig';
import { Link } from 'react-router-dom';
import { addThemeChangeListener, dispatchThemeChange, isDarkMode } from '../../utils/themeUtils';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// simple doughnut center plugin (visual only)
const doughnutCenterPlugin = {
  id: 'doughnutCenter',
  beforeDraw(chart, args, options) {
    if (chart?.config?.type !== 'doughnut') return;
    if (!options || options.enabled === false) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const { left, right, top, bottom } = chartArea;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const radius = Math.min((right - left), (bottom - top)) / 2;
    try {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = options.innerShadowColor || (options.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)');
      ctx.arc(centerX, centerY, radius * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } catch (e) {}
  }
};

function normalizePlugins(config) {
  if (!config) return [];
  const plugins = Array.isArray(config.plugins) ? config.plugins.slice() : [];
  if (config.options && config.options.plugins && config.options.plugins.doughnutCenter && config.options.plugins.doughnutCenter.enabled) {
    plugins.push(doughnutCenterPlugin);
  }
  return plugins;
}

const ITEMS_PER_PAGE = 4;

const DTRSummary = () => {
  const { dtrWidgets } = useSystemSettings();
  const [attendanceData, setAttendanceData] = useState([]);
  const [usersData, setUsersData] = useState({});
  const [leavesList, setLeavesList] = useState([]);
  const [schedulesByUser, setSchedulesByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFilter, setDateFilter] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [colorBlindMode] = useState(false);
  const [manualCheckOutModal, setManualCheckOutModal] = useState(null); // { userId, date, currentCheckOut }
  const [manualCheckOutTime, setManualCheckOutTime] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    const loadData = async () => {
      try {
        // Get regular attendance data
        const attendanceDataRes = await firebaseService.getAttendance();
        const normalizedAttendance = (attendanceDataRes || []).map(normalizeAttendanceForUI);
        
        // Use only attendance data (no schedule tracking merge - use proper DTR records)
        setAttendanceData(normalizedAttendance);
        setLoading(false);
      } catch (err) {
        console.error('Error loading attendance data:', err);
        setError('Failed to load attendance data');
        setLoading(false);
      }
    };

    loadData();

    // Set up real-time listener for attendance updates
    const unsubscribeAttendance = firebaseService.onAttendanceUpdate(async (attendanceDataRes) => {
      try {
        const normalizedAttendance = (attendanceDataRes || []).map(normalizeAttendanceForUI);
        // Use only attendance data (no schedule tracking merge - use proper DTR records)
        setAttendanceData(normalizedAttendance);
      } catch (err) {
        console.error('Error updating attendance data:', err);
      }
    });
    const unsubscribeUsers = firebaseService.onUsersUpdate((usersDataRes) => {
      const usersObj = {};
      (usersDataRes || []).forEach(user => {
        if (!user) return;
        if (user.facultyId) usersObj[user.facultyId] = user;
        if (user.userId !== undefined && user.userId !== null) usersObj[String(user.userId)] = user;
      });
      setUsersData(usersObj);
    });
    const unsubscribeLeaves = firebaseService.onLeaveRequestsUpdate((leavesData) => {
      console.log('[Debug] Raw Firebase leave data:', leavesData);
      
      // Transform nested structure into flat array of leave requests
      const flattenedLeaves = [];

      if (leavesData && Array.isArray(leavesData)) {
        leavesData.forEach(leave => {
          // Check if this is a leave request object with properties
          if (leave && typeof leave === 'object') {
            // If the leave object itself is not nested
            if (leave.status === 'approved' && leave.startDate && leave.endDate) {
              const leaveRecord = {
                userId: leave.facultyId,
                startDate: leave.startDate,
                endDate: leave.endDate,
                status: leave.status,
                employeeName: leave.employeeName,
                reason: leave.reason
              };
              console.log('[Debug] Adding direct leave record:', leaveRecord);
              flattenedLeaves.push(leaveRecord);
            } 
            // If it contains multiple leave requests
            else if (typeof leave === 'object') {
              Object.values(leave).forEach(nestedLeave => {
                if (nestedLeave && 
                    nestedLeave.status === 'approved' && 
                    nestedLeave.startDate && 
                    nestedLeave.endDate) {
                  const leaveRecord = {
                    userId: nestedLeave.facultyId || leave.facultyId,
                    startDate: nestedLeave.startDate,
                    endDate: nestedLeave.endDate,
                    status: nestedLeave.status,
                    employeeName: nestedLeave.employeeName,
                    reason: nestedLeave.reason
                  };
                  console.log('[Debug] Adding nested leave record:', leaveRecord);
                  flattenedLeaves.push(leaveRecord);
                }
              });
            }
          }
        });
      }

      console.log('[Debug] Final flattened leaves:', flattenedLeaves);
      setLeavesList(flattenedLeaves);
    });

    const loadInitial = async () => {
      try {
        const [attendanceRes, usersRes] = await Promise.all([firebaseService.getAttendance(), firebaseService.getEmployees()]);
        setAttendanceData((attendanceRes || []).map(normalizeAttendanceForUI));
        const usersObj = {};
        (usersRes || []).forEach(u => { if (!u) return; if (u.facultyId) usersObj[u.facultyId] = u; if (u.userId !== undefined && u.userId !== null) usersObj[String(u.userId)] = u; });
        setUsersData(usersObj);
        try {
          const staffSchedules = await scheduleService.getStaffSchedules();
          const byUser = {};
          const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          (staffSchedules || []).forEach(s => {
            if (!s || !s.userId) return;
            const copy = { ...s };
            if (Array.isArray(copy.weekly) && copy.weekly.length > 0) {
              const schedObj = {};
              copy.weekly.forEach((item, idx) => {
                const day = days[idx]; if (!day) return; if (item.working === false) return; const start = item.start || item.startTime || null; const end = item.end || item.endTime || null; if (start && end) schedObj[day] = { startTime: start, endTime: end };
              });
              copy.schedule = schedObj;
            }
            byUser[String(s.userId)] = copy;
          });
          setSchedulesByUser(byUser);
        } catch (e) {
          console.warn('[DTR] schedules load failed', e);
        }

        setLoading(false);
      } catch (e) {
        setError(e?.message || 'Failed to load DTR data');
        setLoading(false);
      }
    };

    loadInitial();

    return () => {
      try { unsubscribeAttendance(); } catch (e) {}
      try { unsubscribeUsers(); } catch (e) {}
      try { unsubscribeLeaves(); } catch (e) {}
    };
  }, []);

  // helpers
  function parseIsoLikeToDate(val) {
    if (!val && val !== 0) return null;
    const s = String(val);
    try {
      let d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]?)([0-9:\-\._]{4,})(.*)$/);
      if (m) {
        const datePart = m[1];
        let timePart = m[2].replace(/[-\._]/g, ':');
        if (/^\d{6}(?:\.\d+)?$/.test(timePart)) timePart = timePart.replace(/^(\d{2})(\d{2})(\d{2})/, '$1:$2:$3');
        const rest = m[3] || '';
        const fixed = `${datePart}T${timePart}${rest}`;
        d = new Date(fixed); if (!isNaN(d.getTime())) return d;
      }
      const tIdx = s.indexOf('T');
      if (tIdx !== -1) {
        const head = s.slice(0, tIdx + 1);
        let tail = s.slice(tIdx + 1);
        tail = tail.replace(/[-\._]/g, ':');
        const digitsOnly = tail.match(/^(\d{6})(.*)$/);
        if (digitsOnly) tail = digitsOnly[1].replace(/^(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') + (digitsOnly[2] || '');
        d = new Date(head + tail); if (!isNaN(d.getTime())) return d;
      }
    } catch (e) {}
    return null;
  }

  function getCheckInIso(entry) {
    if (!entry) return null;
    const candidates = [entry.checkIn, entry.check_in, entry.rawTimestamp, entry.timestamp, entry.raw_time, (entry.date && entry.time) ? `${entry.date}T${entry.time}` : null].filter(Boolean);
    for (const c of candidates) {
      try { const d = new Date(c); if (!isNaN(d.getTime())) return d.toISOString(); } catch (e) {}
    }
    return null;
  }
  function getCheckOutIso(entry) {
    if (!entry) return null;
    // Only return checkout if it came from an actual paired record (has rawRecords with both check-in and check-out)
    if (entry.rawRecords && entry.rawRecords.length === 2) {
      const hasCheckOut = entry.rawRecords.some(r => (r.type || '').toLowerCase() === 'check_out');
      if (hasCheckOut) {
        const candidates = [entry.checkOut, entry.checkOutTime, entry.check_out, entry.check_out_time, entry.checkOutTimestamp, entry.rawTimestampOut].filter(Boolean);
        for (const c of candidates) { try { const d = new Date(c); if (!isNaN(d.getTime())) return d.toISOString(); } catch (e) {} }
      }
    }
    return null;
  }
  function formatTime(value) {
    if (!value && value !== 0) return '';
    const d = parseIsoLikeToDate(value);
    if (d) {
      try {
        // Convert to Manila time and include AM/PM
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
      } catch (e) {
        return d.toLocaleTimeString();
      }
    }
    return String(value);
  }

  // Handle manual check-out
  const handleManualCheckOut = async (userId, date, checkOutDateTime) => {
    if (!checkOutDateTime) {
      alert('Please select a check-out time');
      return;
    }

    try {
      // Find the attendance record to update
      const attendanceKey = `${userId}_${date}`;
      
      // Save to Firebase
      await firebaseService.updateAttendanceCheckOut(userId, date, checkOutDateTime);
      
      // Close modal
      setManualCheckOutModal(null);
      setManualCheckOutTime('');
      
      // Show success notification
      alert('Check-out time saved successfully');
    } catch (err) {
      console.error('Error saving manual check-out:', err);
      alert('Failed to save check-out time: ' + (err?.message || 'Unknown error'));
    }
  };

  // paired attendance (one row per user per date)
  const pairedAll = useMemo(() => {
    try {
      return pairAttendanceRecords((attendanceData || []).map(normalizeAttendanceForUI));
    } catch (e) { return []; }
  }, [attendanceData]);

  // filtering and derived data
  const filteredData = useMemo(() => {
    // Only process regular attendance records (no leaves)
    const attendanceRecords = (pairedAll || []).filter(entry => {
      if (!entry) return false;
      // date filter
      if (dateFilter && dateFilter !== 'All') {
        const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const today = new Date(manila);
        today.setHours(0, 0, 0, 0);
        
        const entryDateIso = getCheckInIso(entry) || entry.timestamp || entry.date || null;
        if (!entryDateIso) return false;
        
        const entryDate = new Date(entryDateIso);
        entryDate.setHours(0, 0, 0, 0);
        
        if (dateFilter === 'Today') {
          return entryDate.getTime() === today.getTime();
        }
        
        if (dateFilter === 'Yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return entryDate.getTime() === yesterday.getTime();
        }
        
        if (dateFilter === 'Last7Days') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 6);
          return entryDate >= weekAgo && entryDate <= today;
        }
        
        return false;
      }

      return true;
    });

    return attendanceRecords;
  }, [attendanceData, dateFilter, selectedMonth, pairedAll, leavesList]);

  const totalPages = Math.max(1, Math.ceil((filteredData || []).length / ITEMS_PER_PAGE));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages]);

  const paginatedData = useMemo(() => {
    return (filteredData || []).slice((currentPage-1)*ITEMS_PER_PAGE, currentPage*ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const monthlyAttendance = useMemo(() => {
    const arr = Array(12).fill(0);
    // Only process actual attendance check-ins
    (filteredData || []).forEach(e => {
      const iso = getCheckInIso(e);
      const d = iso ? new Date(iso) : null;
      const m = d && !isNaN(d.getTime()) ? d.getMonth() : NaN;
      if (!isNaN(m)) arr[m]++;
    });
    return arr;
  }, [filteredData]);

  // Process leave data and attendance counts
  const { presentCount, onLeaveCount } = useMemo(() => {
    // Count check-ins (present) from filtered attendance data
    const present = (filteredData || []).length;

    console.log('[Debug] Raw leavesList:', leavesList);

    // Count approved leaves that are active in the current date range
    const onLeave = (leavesList || []).filter(leave => {
      console.log('[Debug] Processing leave:', leave);
      if (!leave || !leave.startDate || !leave.endDate) return false;
      
      const startDate = new Date(leave.startDate);
      const endDate = new Date(leave.endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999); // Set to end of day
      
      // Get current date in Manila time
      const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const today = new Date(manila);
      today.setHours(0, 0, 0, 0);
      
      // If filtering by specific date range
      if (dateFilter && dateFilter !== 'All') {
        if (dateFilter === 'Today') {
          return startDate <= today && today <= endDate;
        }
        
        if (dateFilter === 'Yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return startDate <= yesterday && yesterday <= endDate;
        }
        
        if (dateFilter === 'Last7Days') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 6);
          // Check if any day in the leave period overlaps with the last 7 days
          return !(endDate < weekAgo || startDate > today);
        }
      }
      
      // If no date filter, include all leaves
      console.log('[Debug] Leave dates:', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        dateFilter,
        included: true
      });
      return true;
    }).length;

    console.log('[Debug] Final counts:', {
      present,
      onLeave,
      dateFilter
    });

    // Return counts object
    return {
      presentCount: present,
      onLeaveCount: onLeave
    };
  }, [pairedAll, leavesList, dateFilter]);

  const colors = useMemo(() => getAccessibleColors(colorBlindMode, 3), [colorBlindMode]);

  const barChartConfig = useMemo(() => createAccessibleChartConfig('bar', colorBlindMode, {
    data: { 
      labels: ['Present', 'On Leave'], 
      datasets: [{ 
        label: 'Faculty Attendance', 
        data: [presentCount, onLeaveCount],
        backgroundColor: [
          (colors && colors[0] ? colors[0] + '80' : '#1f77b480'),  // More visible fill
          '#FF6B0080'  // More visible fill
        ],
        borderColor: [
          (colors && colors[0]) || '#1f77b4',
          '#FF6B00'
        ],
        borderWidth: 1
      }] 
    },
    options: applyThemeToOptions({ 
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    })
  }), [presentCount, onLeaveCount, colors, colorBlindMode]);

  const lineChartConfig = useMemo(() => createAccessibleChartConfig('line', colorBlindMode, {
    data: { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], datasets:[{ label:'Monthly Attendance', data: monthlyAttendance, borderColor: colors[0], backgroundColor: (colors && colors[0] ? colors[0] + '10' : '#1f77b10'), tension:0.4 }] },
    options: applyThemeToOptions({ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } })
  }), [monthlyAttendance, colors, colorBlindMode]);

  const { lateCount, onTimeCount, absenceCount } = useMemo(() => {
    // Only consider regular attendance records, not leave records
    const attendanceOnly = (filteredData || []).filter(e => !e.type || e.type !== 'leave');
    
    const late = attendanceOnly.filter(e => 
      e && (e.isLateBySchedule === true || (e.status || '').toString().toLowerCase() === 'late')
    ).length;
    
    const onTime = attendanceOnly.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toString().toLowerCase();
      return s === 'present' || s === 'on time' || s === 'ontime' || e.isLateBySchedule === false;
    }).length;

    const absent = attendanceOnly.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toString().toLowerCase();
      return s === 'absent';
    }).length;

    return { lateCount: late, onTimeCount: onTime, absenceCount: absent };
  }, [pairedAll]);

  const doughnutChartConfig = useMemo(() => ({ 
    data: { 
      labels: ['Late', 'On Time'], 
      datasets: [{ 
        data: [lateCount, onTimeCount], 
        backgroundColor: [colors[1]||'#FBBF24', colors[0]||'#10B981'] 
      }] 
    }, 
    options: { 
      cutout: '44%', 
      plugins: { 
        doughnutCenter: { 
          enabled: false 
        } 
      } 
    } 
  }), [lateCount, onTimeCount, colors]);

  const getUserName = (userId) => {
    if (!userId || !usersData) return `User ID: ${userId}`;
    let user = usersData[userId] || Object.values(usersData).find(u => String(u.userId) === String(userId) || String(u.facultyId) === String(userId) || String(u.id) === String(userId));
    if (!user) return `User ID: ${userId}`;
    return user.name || user.fullName || user.employeeName || `User ID: ${userId}`;
  };

  const exportToCSV = () => {
    if ((filteredData || []).length === 0) { alert('No data to export'); return; }
    const headers = ['User ID', 'Status', 'Check In', 'Check Out', 'Hours', 'Anomaly'];
    const rows = (filteredData || []).map(entry => {
      const ci = formatTime(getCheckInIso(entry) || entry.checkIn || entry.check_in || entry.time || entry.timestamp);
      const co = formatTime(getCheckOutIso(entry) || entry.checkOut || entry.check_out || entry.checkOutTimestamp);
      const anomaly = !co ? 'incomplete' : (entry.rawRecords && entry.rawRecords.length > 2 ? 'multiple' : '');
      const cols = [String(entry.userId || entry.facultyId || ''), String(entry.status || ''), ci, co, entry.hours != null ? String(entry.hours) : '', anomaly];
      return cols.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dtr_summary_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) return (<div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><div className="animate-pulse space-y-6"><div className="h-8 bg-white rounded-lg shadow"></div></div></div></div>);
  if (error) return (<div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2><p className="text-red-600">{error}</p></div></div></div>);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">DTR Summary</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">Comprehensive attendance insights and reports</p>
          <div className="inline-flex items-center gap-3 bg-white dark:bg-gray-800 shadow-sm rounded-lg p-2 border border-gray-200 dark:border-gray-700">
            <label htmlFor="global-date-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Show:</label>
            <select 
              id="global-date-filter" 
              value={dateFilter} 
              onChange={(e)=>{ setDateFilter(e.target.value); setCurrentPage(1); }} 
              className="px-3 py-2 border-0 rounded-md text-sm bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:outline-none"
            >
              <option value="All">All Records</option>
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Last7Days">Last 7 Days</option>
            </select>
          </div>
        </motion.div>

        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Row 1: Present vs On Leave | Monthly Attendance */}
          {dtrWidgets?.presentVsOnLeave?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <div className="mb-6 flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Present vs. On Leave</h3>
              </div>
              <div className="h-64"><Bar data={barChartConfig.data} options={barChartConfig.options} plugins={normalizePlugins(barChartConfig)} /></div>
            </div>
          )}

          {dtrWidgets?.monthlyAttendance?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly Attendance</h3>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Last 12 months</div>
              </div>
              <div className="h-64"><Line data={lineChartConfig.data} options={lineChartConfig.options} plugins={normalizePlugins(lineChartConfig)} /></div>
            </div>
          )}

          {/* Row 2: Most Early | Most Late */}
          {dtrWidgets?.mostEarlyEmployee?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <div className="mb-6 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <UserCog className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Most Early Employee</h3>
              </div>
            <div className="h-64 overflow-auto custom-scrollbar">
              {(() => { 
                try { 
                  const map = new Map(); 
                  const attendanceOnly = (filteredData||[]).filter(rec => 
                    (!rec.type || rec.type !== 'leave') && 
                    (rec.status||'').toString().toLowerCase() !== 'absent'
                  );
                  attendanceOnly.forEach(rec => { 
                    const uid = String(rec.userId||rec.facultyId||''); 
                    if(!uid) return; 
                    const ci = getCheckInIso(rec)||rec.check_in||rec.checkIn||rec.timestamp; 
                    if(!ci) return; 
                    const d = parseIsoLikeToDate(ci); 
                    if(!d) return; 
                    const mins = d.getHours()*60+d.getMinutes(); 
                    const e = map.get(uid)||{uid,name:getUserName(uid),total:0,sum:0}; 
                    e.total++; 
                    e.sum+=mins; 
                    map.set(uid,e);
                  }); 
                  const scheduleTrackingData = (schedulesByUser || {});
                  
                  const arr = Array.from(map.values())
                    .map(x => {
                      // Get user's schedule
                      const schedule = scheduleTrackingData[x.uid];
                      const scheduleStart = schedule?.scheduleStart || '09:00';
                      const [scheduledHour] = scheduleStart.split(':').map(Number);
                      
                      // Calculate minutes before schedule
                      const avgMinsBeforeSchedule = scheduledHour * 60 - (x.sum / x.total);
                      
                      return {
                        uid: x.uid,
                        name: x.name,
                        avgMins: x.sum / x.total,
                        total: x.total,
                        avgMinsBeforeSchedule: avgMinsBeforeSchedule
                      };
                    })
                    .filter(x => x.avgMinsBeforeSchedule > 0) // Only show faculty who arrive before schedule
                    .sort((a, b) => b.avgMinsBeforeSchedule - a.avgMinsBeforeSchedule) // Sort by most early
                    .slice(0, 5); 

                  if(!arr.length) {
                    return <div className="text-sm text-gray-500">No data for selected range</div>; 
                  }

                  return arr.map(u => (
                    <div key={u.uid} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div>
                        <div className="font-medium text-sm text-gray-800">{u.name}</div>
                        <div className="text-xs text-gray-500">
                          {u.total} records | {Math.round(u.avgMinsBeforeSchedule)} mins early
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        Avg. Check-in: {(() => {
                          const hh = Math.floor(u.avgMins/60);
                          const mm = Math.round(u.avgMins%60);
                          return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
                        })()}
                      </div>
                    </div>
                  )); 
                } catch(e) {
                  console.error('Error in Most Early Faculty:', e);
                  return <div className="text-sm text-gray-500">No data</div>; 
                }
              })()}
            </div>
            </div>
          )}

          {dtrWidgets?.mostLateEmployee?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="mb-6 flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Most Late Employee</h3>
            </div>
            <div className="h-64 overflow-auto custom-scrollbar">
              {(() => { 
                try {
                  const map = new Map();
                  const scheduleTrackingData = (schedulesByUser || {});
                  
                  (filteredData||[]).forEach(rec => {
                    // Skip absent records
                    const status = (rec.status||'').toString().toLowerCase();
                    if (status === 'absent') return;

                    const uid = String(rec.userId || rec.facultyId || ''); 
                    if (!uid) return;
                    
                    const schedule = scheduleTrackingData[uid];
                    const scheduleStart = schedule?.scheduleStart || '09:00';
                    const [scheduledHour, scheduledMin = 0] = scheduleStart.split(':').map(Number);
                    const scheduledMins = scheduledHour * 60 + scheduledMin;

                    const ci = getCheckInIso(rec)||rec.check_in||rec.checkIn||rec.timestamp;
                    if (!ci) return;
                    const checkInDate = parseIsoLikeToDate(ci);
                    if (!checkInDate) return;
                    
                    const checkInMins = checkInDate.getHours() * 60 + checkInDate.getMinutes();
                    const minutesLate = Math.max(0, checkInMins - scheduledMins);
                    
                    const e = map.get(uid) || {
                      uid,
                      name: getUserName(uid),
                      late: 0,
                      total: 0,
                      totalLateMins: 0
                    };
                    
                    if (minutesLate > 0) {
                      e.late++;
                      e.totalLateMins += minutesLate;
                    }
                    e.total++;
                    map.set(uid, e);
                  });

                  const arr = Array.from(map.values())
                    .filter(x => x.late > 0)
                    .sort((a, b) => b.late - a.late)
                    .slice(0, 5);

                  if (!arr.length) {
                    return (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No late users in selected range
                      </div>
                    );
                  }

                  return arr.map(u => (
                    <div key={u.uid} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-white">
                          <Link to={`/dtr/user/${u.uid}`} className="hover:underline">{u.name}</Link>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {u.total} records | {Math.round(u.totalLateMins / u.late)} mins avg late
                        </div>
                      </div>
                      <div className="text-sm font-medium text-red-600 dark:text-red-400">
                        {u.late} late
                      </div>
                    </div>
                  ));
                } catch(e) {
                  console.error('Error processing late data:', e);
                  return <div className="text-sm text-gray-500 dark:text-gray-400">No data</div>;
                }
              })()}
            </div>
          </div>
          )}

          {dtrWidgets?.absentEmployees?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <div className="mb-6 flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Absent Employees</h3>
              </div>
              <div className="h-64 overflow-auto custom-scrollbar">
                {(() => {
                  try {
                    const map = new Map();
                    
                    (filteredData||[]).forEach(rec => {
                      const status = (rec.status||'').toString().toLowerCase();
                      if (status !== 'absent') return;

                      const uid = String(rec.userId || rec.facultyId || '');
                      if (!uid) return;

                      const e = map.get(uid) || {
                        uid,
                        name: getUserName(uid),
                        absenceCount: 0,
                        total: 0
                      };

                      e.absenceCount++;
                      e.total++;
                      map.set(uid, e);
                    });

                    const arr = Array.from(map.values())
                      .sort((a, b) => b.absenceCount - a.absenceCount)
                      .slice(0, 5);

                    if (!arr.length) {
                      return (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          No absent employees in selected range
                        </div>
                      );
                    }

                    return arr.map(u => (
                      <div key={u.uid} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-white">
                            <Link to={`/dtr/user/${u.uid}`} className="hover:underline">{u.name}</Link>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {u.total} total records
                          </div>
                        </div>
                        <div className="text-sm font-medium text-red-600 dark:text-red-400">
                          {u.absenceCount} absent
                        </div>
                      </div>
                    ));
                  } catch(e) {
                    console.error('Error processing absent data:', e);
                    return <div className="text-sm text-gray-500 dark:text-gray-400">No data</div>;
                  }
                })()}
              </div>
            </div>
          )}

          {/* Row 3: Attendance Records | Tardiness Percentage */}
          {dtrWidgets?.attendanceChart?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 lg:col-span-1">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Attendance Records</h2>
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                  {filteredData.length} records
                </div>
              </div>
            </div>
            <div className="hidden sm:block overflow-x-auto h-64">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 font-semibold text-gray-700">
                    <th className="py-4 px-4">Name</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4 text-left">Check In</th>
                    <th className="py-4 px-4 text-left">Check Out</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="wait">
                    {paginatedData.length>0 ? paginatedData.map((entry,idx)=> (
                      <motion.tr 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2, delay: idx * 0.05 }}
                        key={idx} 
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4 font-medium text-gray-900">
                          <Link to={`/dtr/user/${entry.userId}`} className="hover:underline">{getUserName(entry.userId)}</Link>
                        </td>
                        <td className="py-3 px-4"><span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium border ${
  (() => {
    const status = (entry.status||'').toString().toLowerCase();
    switch(status) {
      case 'present':
      case 'on time':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'absent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'early':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  })()
}`}>
                      {(() => {
                        const status = (entry.status||'').toString().toLowerCase();
                        switch(status) {
                          case 'present':
                          case 'on time':
                            return <><CheckCircle className="w-4 h-4" /></>;
                          case 'late':
                            return <><ClockIcon className="w-4 h-4" /></>;
                          case 'absent':
                            return <><AlertTriangle className="w-4 h-4" /></>;
                          case 'early':
                            return <><Clock className="w-4 h-4" /></>;
                          default:
                            return null;
                        }
                      })()}
                      {(entry.status||'').toString().charAt(0).toUpperCase() + (entry.status||'').toString().slice(1).toLowerCase()}
                    </span></td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {(() => { 
                        const iso = getCheckInIso(entry) || entry.checkIn || entry.check_in || entry.time || entry.timestamp; 
                        if (!iso) return 'No check in recorded'; 
                        return formatTime(iso); 
                      })()}
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {(() => { 
                        const iso = getCheckOutIso(entry) || entry.checkOut || entry.check_out || entry.checkOutTimestamp || null; 
                        if (!iso) {
                          const checkInIso = getCheckInIso(entry) || entry.checkIn || entry.check_in || entry.time || entry.timestamp;
                          const dateStr = checkInIso ? new Date(checkInIso).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                          return (
                            <button
                              onClick={() => setManualCheckOutModal({ userId: entry.userId, date: dateStr, currentCheckOut: null })}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            >
                              Add Check-out
                            </button>
                          );
                        }
                        return formatTime(iso); 
                      })()}
                    </td>
                  </motion.tr>
                ))
              : (
                <tr>
                  <td colSpan="4" className="text-center py-12 text-gray-500">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    No attendance data found.
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
            </div>
            <div className="block sm:hidden space-y-3 h-64 overflow-auto">
              {paginatedData.map((entry,idx)=>(<motion.div key={idx} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"><div className="flex items-center justify-between mb-2"><h3 className="font-medium text-gray-800"><Link to={`/dtr/user/${entry.userId}`} className="hover:underline">{getUserName(entry.userId)}</Link></h3><span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium border ${
  (() => {
    const status = (entry.status||'').toString().toLowerCase();
    switch(status) {
      case 'present':
      case 'on time':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'absent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'early':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  })()
}`}>
                    {(() => {
                      const status = (entry.status||'').toString().toLowerCase();
                      switch(status) {
                        case 'present':
                        case 'on time':
                          return <><CheckCircle className="w-4 h-4" /></>;
                        case 'late':
                          return <><ClockIcon className="w-4 h-4" /></>;
                        case 'absent':
                          return <><AlertTriangle className="w-4 h-4" /></>;
                        case 'early':
                          return <><Clock className="w-4 h-4" /></>;
                        default:
                          return null;
                      }
                    })()}
                    {(entry.status||'').toString().charAt(0).toUpperCase() + (entry.status||'').toString().slice(1).toLowerCase()}
                  </span></div><div className="text-sm text-gray-600"><Calendar className="w-4 h-4 inline mr-2" />{(() => { const iso = getCheckInIso(entry) || entry.timestamp || entry.date || null; const pd = parseIsoLikeToDate(iso); return pd ? pd.toISOString().slice(0,10) : 'No Date'; })()}<div className="mt-1"><div className="flex items-center gap-2"><Clock className="w-4 h-4" /><span className="text-sm text-gray-500 whitespace-nowrap">{(() => { const iso = entry.checkIn || entry.check_in || entry.time || entry.timestamp; if (!iso) return 'No check in recorded'; return formatTime(iso); })()}</span></div><div className="flex items-center gap-2 mt-1"><Clock className="w-4 h-4" /><span className="text-sm text-gray-500 whitespace-nowrap">{(() => { const iso = entry.checkOut || entry.check_out || entry.checkOutTimestamp || null; if (!iso) return 'No check out'; return formatTime(iso); })()}</span></div></div></div></motion.div>))}
            </div>
            {totalPages>1 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-6 flex items-center justify-between"
              >
                <div className="text-sm text-gray-600">
                  Showing {(currentPage-1)*ITEMS_PER_PAGE+1} - {Math.min(currentPage*ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} entries
                </div>
                <div className="flex items-center gap-2">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={()=>setCurrentPage(currentPage-1)} 
                    disabled={currentPage===1} 
                    className="px-3 py-2 border rounded hover:bg-gray-50 transition-colors duration-150 pagination-page"
                  >
                    Prev
                  </motion.button>
                  <div className="flex items-center gap-1">
                    {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
                      const pageNum=Math.max(1, Math.min(totalPages-4, currentPage-2))+i;
                      if (pageNum>0 && pageNum<=totalPages) return (
                        <motion.button 
                          key={pageNum} 
                          onClick={()=>setCurrentPage(pageNum)} 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-3 py-2 rounded transition-colors duration-150 ${
                            currentPage===pageNum ? 'pagination-current' : 'bg-white border hover:bg-gray-50 pagination-page'
                          }`}
                        >
                          {pageNum}
                        </motion.button>
                      );
                      return null;
                    })}
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={()=>setCurrentPage(currentPage+1)} 
                    disabled={currentPage===totalPages} 
                    className="px-3 py-2 border rounded hover:bg-gray-50 transition-colors duration-150 pagination-page"
                  >
                    Next
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
          )}

          {dtrWidgets?.departmentSummary?.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tardiness Percentage</h3>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                Based on selected range
              </div>
            </div>
            <div className="h-64 flex items-center justify-center">
              <div className="w-full max-w-md h-full">
                <Doughnut data={doughnutChartConfig.data} options={doughnutChartConfig.options} plugins={normalizePlugins(doughnutChartConfig)} />
              </div>
            </div>
          </div>
          )}
        </motion.div>

        <div className="mt-8 flex justify-end gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={exportToCSV}
            className="reject-button inline-flex items-center px-4 py-2.5 border-2 text-sm font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Download className="w-4 h-4 mr-2" />
            Export to CSV
          </motion.button>
        </div>
      </div>

      {/* Manual Check-Out Modal */}
      <AnimatePresence>
        {manualCheckOutModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setManualCheckOutModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add Manual Check-Out</h2>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Employee: <span className="font-medium"><Link to={`/dtr/user/${manualCheckOutModal.userId}`} className="hover:underline">{getUserName(manualCheckOutModal.userId)}</Link></span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Date: <span className="font-medium">{manualCheckOutModal.date}</span>
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Check-Out Time
                </label>
                <input
                  type="time"
                  value={manualCheckOutTime}
                  onChange={e => setManualCheckOutTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Select the time the employee checked out
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setManualCheckOutModal(null);
                    setManualCheckOutTime('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!manualCheckOutTime) {
                      alert('Please select a check-out time');
                      return;
                    }
                    
                    // Combine date with time
                    const [hours, minutes] = manualCheckOutTime.split(':');
                    const checkOutDateTime = new Date(`${manualCheckOutModal.date}T${hours}:${minutes}:00`);
                    const iso = checkOutDateTime.toISOString();
                    
                    handleManualCheckOut(manualCheckOutModal.userId, manualCheckOutModal.date, iso);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Save Check-Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(DTRSummary);
