import React, { useEffect, useState } from "react";
import { firebaseService } from '../../services/firebaseService';
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import useAuth from '../../contexts/authcontext';
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  CalendarDays,
  Timer,
  UserCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  DollarSign
} from "lucide-react";

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

const formatTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
};

const MyAttendanceEnhanced = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalDays: 0,
    presentDays: 0,
    lateDays: 0,
    onTimePercentage: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scheduleTracking, setScheduleTracking] = useState([]);
  const [payrollInfo, setPayrollInfo] = useState({
    employeeType: null,
    salary: 0,
    hourlyRate: 0
  });
  const recordsPerPage = 5;
  const navigate = useNavigate();

  useEffect(() => {
    let unsubAttendance = null;
    let unsubScheduleTracking = null;

    const processAttendance = (attendanceData) => {
      try {
        if (!user) {
          console.warn('MyAttendance: No user logged in');
          setRecords([]);
          setLoading(false);
          return;
        }

        console.log('MyAttendance: Processing attendance data, total records:', attendanceData?.length || 0);
        console.log('MyAttendance: Current user:', { uid: user.uid, userId: user.userId, email: user.email, facultyId: user.facultyId });

        // Get all possible user identifiers - prioritize numeric userId and facultyId as they match attendance records
        const username = user.email ? user.email.split('@')[0] : null;
        const userId = user.userId; // Numeric ID that matches attendance records
        const facultyId = user.facultyId; // Also numeric ID used in attendance records
        const email = user.email;
        const uid = user.uid; // Firebase Auth ID (fallback)
        
        // Create a set of identifiers to check against 
        // Match both numeric (as is) and string versions for flexibility with inconsistent data types
        const possibleIds = [
          String(userId), // "11"
          String(facultyId), // "11" 
          userId, // 11 (number)
          facultyId, // 11 (number)
          email?.toLowerCase(), // "lance@dhvsu.edu.ph"
          username?.toLowerCase(), // "lance"
          uid?.toLowerCase() // Firebase UID (fallback)
        ]
          .filter(Boolean)
          .map(v => String(v).toLowerCase().trim());

        console.log('MyAttendance: Possible user IDs to match:', possibleIds);

        // Log sample of attendance data to see structure
        if (attendanceData && attendanceData.length > 0) {
          console.log('MyAttendance: Sample attendance record:', attendanceData[0]);
        }

        // Filter attendance records for ONLY this logged-in user
        const userAttendance = (attendanceData || []).filter(r => {
          // Get all possible identifiers from the record
          const recordIds = [
            r.userId, 
            r.user_id, 
            r.facultyId, 
            r.faculty_id, 
            r.email, 
            r.uid, 
            r.username,
            r.name, // In case employee name is used as identifier
            r.employeeId,
            r.employee_id
          ]
            .filter(Boolean)
            .map(v => String(v).toLowerCase().trim());

          // Check if any of the user's identifiers match any of the record's identifiers
          const isMatch = possibleIds.some(id => recordIds.includes(id));
          
          return isMatch;
        });

        console.log('MyAttendance: After filtering - Matched records:', userAttendance.length, 'from total:', attendanceData?.length);
        
        // Log first few records for debugging
        if (userAttendance.length > 0) {
          console.log('MyAttendance: First matched record:', userAttendance[0]);
        } else {
          console.warn('MyAttendance: No records matched for user IDs:', possibleIds);
          console.log('MyAttendance: All record samples:', attendanceData.slice(0, 3).map(r => ({
            userId: r.userId,
            facultyId: r.facultyId,
            email: r.email,
            uid: r.uid,
            date: r.date
          })));
        }

        // Group records by date
        const grouped = {};
        userAttendance.forEach(r => {
          const d = r.date || (r.rawTimestamp ? String(r.rawTimestamp).split('T')[0] : null);
          if (!d) return;
          grouped[d] = grouped[d] || [];
          grouped[d].push(r);
        });

        // Process each day's records
        const myRecords = Object.keys(grouped).map(dateKey => {
          const recs = (grouped[dateKey] || []).slice();
          recs.sort((a,b) => new Date(a.rawTimestamp || `${a.date}T${a.time || '00:00:00'}`) - new Date(b.rawTimestamp || `${b.date}T${b.time || '00:00:00'}`));

          let checkIn = null;
          const checkInCandidates = recs.filter(x => ((x.type || '').toString().toLowerCase() === 'check_in' || (x.type || '').toString().toLowerCase() === 'in'));
          if (checkInCandidates.length) {
            const first = checkInCandidates[0];
            checkIn = first.rawTimestamp || first.timestamp || (first.date && first.time ? `${first.date}T${first.time}` : null);
          } else if (recs.length) {
            const first = recs[0];
            checkIn = first.rawTimestamp || first.timestamp || (first.date && first.time ? `${first.date}T${first.time}` : null);
          }

          let checkOut = null;
          const checkOutCandidates = recs.filter(x => ((x.type || '').toString().toLowerCase() === 'check_out' || (x.type || '').toString().toLowerCase() === 'out'));
          if (checkOutCandidates.length) {
            const last = checkOutCandidates[checkOutCandidates.length - 1];
            checkOut = last.rawTimestamp || last.timestamp || (last.date && last.time ? `${last.date}T${last.time}` : null);
          } else if (recs.length > 1) {
            const last = recs[recs.length - 1];
            checkOut = last.rawTimestamp || last.timestamp || (last.date && last.time ? `${last.date}T${last.time}` : null);
          }

          const statuses = recs.map(x => (x.status || '').toString().toLowerCase()).filter(Boolean);
          let status = '';
          if (statuses.includes('absent')) status = 'absent';
          else if (statuses.includes('on leave') || statuses.includes('on_leave') || statuses.includes('onleave')) status = 'on leave';
          else if (statuses.includes('late')) status = 'late';
          else if (statuses.includes('present')) status = 'present';
          else status = statuses[0] || '';

          return {
            id: `${possibleIds[0] || 'me'}::${dateKey}`,
            check_in: checkIn,
            check_out: checkOut,
            status,
            date: dateKey
          };
        }).sort((a,b) => new Date(b.check_in || 0) - new Date(a.check_in || 0));

        setRecords(myRecords);

        const totalDays = myRecords.length;
        const presentDays = myRecords.filter(r => (r.status || '').toLowerCase() === 'present').length;
        const lateDays = myRecords.filter(r => (r.status || '').toLowerCase() === 'late').length;
        const onTimePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        setStats({ totalDays, presentDays, lateDays, onTimePercentage });
        setLoading(false);
      } catch (err) {
        console.error('processAttendance error:', err);
        setError('Failed to load attendance data');
        setLoading(false);
      }
    };

    const init = async () => {
      setLoading(true);
      setError(null);
      if (!user) {
        setRecords([]);
        setUserInfo(null);
        setLoading(false);
        return;
      }

      const username = user.email ? user.email.split('@')[0] : null;
      setUserInfo({ 
        email: user.email, 
        username, 
        displayName: user.name || username,
        facultyId: user.facultyId 
      });

      try {
        // Fetch attendance data
        const initial = await firebaseService.getAttendance();
        processAttendance(initial || []);

        // Fetch schedule tracking data
        try {
          const scheduleData = await firebaseService.getScheduleTracking();
          if (scheduleData) {
            // Flatten schedule tracking data into array
            const scheduleArray = [];
            Object.entries(scheduleData).forEach(([dateKey, dateData]) => {
              Object.entries(dateData).forEach(([userId, trackingRecord]) => {
                scheduleArray.push({
                  ...trackingRecord,
                  userId: String(userId),
                  dateKey
                });
              });
            });
            setScheduleTracking(scheduleArray);
          }
        } catch (err) {
          console.warn('Failed to fetch schedule tracking:', err);
          setScheduleTracking([]);
        }

        // Fetch employee payroll info
        try {
          const allUsers = await firebaseService.getUsers();
          console.log('MyAttendance: All users fetched, count:', allUsers?.length);
          
          // Match ONLY by userId (not email) - to avoid finding wrong user
          const currentUserData = allUsers.find(u => 
            String(u.userId) === String(user.userId)
          );
          
          console.log('MyAttendance: Current user data found:', !!currentUserData);
          if (currentUserData) {
            console.log('MyAttendance: Current user matched:', currentUserData);
          } else {
            console.warn('MyAttendance: No user found with userId:', user.userId);
          }
          
          if (currentUserData && currentUserData.employeeType) {
            // Determine employee type and get salary info
            const empTypeId = currentUserData.employeeType;
            console.log('MyAttendance: Employee type ID:', empTypeId);
            
            try {
              const empTypes = await firebaseService.getEmployeeTypes();
              console.log('MyAttendance: Employee types count:', empTypes?.length);
              console.log('MyAttendance: Employee types:', empTypes);
              
              if (empTypes && empTypes.length > 0) {
                const empTypeData = empTypes.find(e => e.id === empTypeId);
                console.log('MyAttendance: Matched employee type:', empTypeData);
                
                if (empTypeData) {
                  let salaryInfo = { 
                    employeeType: empTypeData.salaryType || null, 
                    salary: 0, 
                    hourlyRate: 0 
                  };
                  
                  if (empTypeData.salaryType === 'monthly') {
                    salaryInfo.salary = empTypeData.rate || 0;
                  } else if (empTypeData.salaryType === 'hourly') {
                    salaryInfo.hourlyRate = empTypeData.rate || 0;
                  }
                  
                  console.log('MyAttendance: Final payroll info:', salaryInfo);
                  setPayrollInfo(salaryInfo);
                } else {
                  console.warn('MyAttendance: Employee type not found with ID:', empTypeId);
                }
              } else {
                console.warn('MyAttendance: No employee types returned from Firebase');
              }
            } catch (err) {
              console.error('MyAttendance: Error fetching employee types:', err);
            }
          } else {
            console.warn('MyAttendance: User has no employeeType field or user not found');
          }
        } catch (err) {
          console.error('MyAttendance: Error fetching employee payroll info:', err);
        }
      } catch (err) {
        console.error('Attendance initial fetch error:', err);
        setError('Failed to load attendance data');
        setLoading(false);
      }

      // Subscribe for live updates
      try {
        unsubAttendance = firebaseService.onAttendanceUpdate((newAttendance) => {
          processAttendance(newAttendance || []);
        });
      } catch (err) {
        console.warn('Failed to subscribe to attendance updates', err);
      }

      // Subscribe for schedule tracking updates (so manual edits show in real-time)
      try {
        unsubScheduleTracking = firebaseService.onScheduleTrackingUpdate((newScheduleTracking) => {
          console.log('MyAttendance: Schedule tracking updated:', newScheduleTracking);
          if (newScheduleTracking) {
            // Flatten schedule tracking data into array
            const scheduleArray = [];
            Object.entries(newScheduleTracking).forEach(([dateKey, dateData]) => {
              if (dateData && typeof dateData === 'object') {
                Object.entries(dateData).forEach(([userId, trackingRecord]) => {
                  if (trackingRecord) {
                    scheduleArray.push({
                      ...trackingRecord,
                      userId: String(userId),
                      dateKey
                    });
                  }
                });
              }
            });
            console.log('MyAttendance: Flattened schedule array:', scheduleArray);
            setScheduleTracking(scheduleArray);
          }
        });
      } catch (err) {
        console.warn('Failed to subscribe to schedule tracking updates:', err);
      }
    };

    init();

    return () => {
      try { if (typeof unsubAttendance === 'function') unsubAttendance(); } catch (e) {}
      try { if (typeof unsubScheduleTracking === 'function') unsubScheduleTracking(); } catch (e) {}
    };
  }, [user]);

  const filteredRecords = React.useMemo(() => {
    let filtered = records;

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        record.check_in?.toLowerCase().includes(search) ||
        record.check_out?.toLowerCase().includes(search) ||
        record.status?.toLowerCase().includes(search) ||
        record.date?.includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(record => record.status === statusFilter);
    }

    return filtered;
  }, [records, searchTerm, statusFilter]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'late':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-blue-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  // Calculate stats from schedule tracking data
  const calculateStatsFromScheduleTracking = () => {
    console.log('calculateStats: scheduleTracking:', scheduleTracking);
    console.log('calculateStats: user:', { userId: user?.userId, facultyId: user?.facultyId });
    
    if (!scheduleTracking || scheduleTracking.length === 0) {
      console.log('calculateStats: No schedule tracking data, using attendance fallback');
      return {
        totalDays: records.length,
        presentDays: records.filter(r => r.status === 'present').length,
        lateDays: 0,
        onTimePercentage: 0
      };
    }

    // Filter schedule tracking for current user
    const userScheduleTracking = scheduleTracking.filter(st => {
      const stUserId = String(st.userId || st.user_id).toLowerCase();
      const currentUserId = String(user?.userId || user?.facultyId).toLowerCase();
      console.log(`Comparing: stUserId="${stUserId}" vs currentUserId="${currentUserId}"`);
      return stUserId === currentUserId;
    });

    console.log('calculateStats: userScheduleTracking:', userScheduleTracking);

    // Count status from schedule tracking
    const onTimeCount = userScheduleTracking.filter(st => 
      st.label?.toLowerCase() === 'on time'
    ).length;
    
    const lateCount = userScheduleTracking.filter(st => 
      st.label?.toLowerCase() === 'late'
    ).length;
    
    const absentCount = userScheduleTracking.filter(st => 
      st.label?.toLowerCase() === 'absent'
    ).length;

    const totalScheduled = userScheduleTracking.length;
    const onTimePercentage = totalScheduled > 0 
      ? Math.round((onTimeCount / totalScheduled) * 100) 
      : 0;

    console.log('calculateStats: Calculated stats -', { 
      onTimeCount, 
      lateCount, 
      absentCount, 
      totalScheduled, 
      onTimePercentage 
    });

    return {
      totalDays: totalScheduled,
      presentDays: onTimeCount,
      lateDays: lateCount,
      absenceDays: absentCount,
      onTimePercentage
    };
  };

  // Update stats when schedule tracking data arrives
  React.useEffect(() => {
    console.log('Stats effect: scheduleTracking length:', scheduleTracking.length);
    if (scheduleTracking && scheduleTracking.length > 0) {
      const newStats = calculateStatsFromScheduleTracking();
      console.log('Stats effect: Setting new stats:', newStats);
      setStats(newStats);
    }
  }, [scheduleTracking, user]);



  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No records to export');
      return;
    }

    const headers = ['Date', 'Check In', 'Check Out', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(record => [
        `"${record.date || formatDate(record.check_in)}"`,
        `"${record.check_in || ''}"`,
        `"${record.check_out || ''}"`,
        `"${record.status || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-white rounded-lg shadow"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-lg shadow"></div>
              ))}
            </div>
            <div className="h-96 bg-white rounded-lg shadow"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">My Attendance</h1>
          <p className="text-gray-600 text-lg">Track your daily attendance records</p>
          {userInfo && (
            <p className="text-sm text-gray-500 mt-2">
              Welcome back, {userInfo.displayName}
            </p>
          )}
        </motion.div>

        {/* Statistics Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 mb-8"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Total Days</p>
              <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalDays}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All records</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Present</p>
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{stats.presentDays}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">On-time record</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Late Arrivals</p>
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.lateDays}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Needs improvement</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Absences</p>
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{stats.absenceDays || 0}</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">Not present</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">On-Time Rate</p>
              <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.onTimePercentage}%</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Performance</p>
          </div>
        </motion.div>

        {/* Payroll Information Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800 mb-8"
        >
          <h3 className="text-sm sm:text-base font-semibold text-blue-900 dark:text-blue-300 mb-2">Payroll Information</h3>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              {payrollInfo.employeeType === 'monthly' ? (
                <>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Monthly Salary</p>
                  <p className="text-lg sm:text-xl font-bold text-blue-900 dark:text-blue-200">
                    ₱{payrollInfo.salary.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Base salary + allowances</p>
                </>
              ) : payrollInfo.employeeType === 'hourly' ? (
                <>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Hourly Rate</p>
                  <p className="text-lg sm:text-xl font-bold text-blue-900 dark:text-blue-200">
                    ₱{payrollInfo.hourlyRate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Per hour wage</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Salary Information</p>
                  <p className="text-lg sm:text-xl font-bold text-blue-900 dark:text-blue-200">Loading...</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Employee type information pending</p>
                </>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/payslips'}
              className="bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-2 w-fit"
            >
              <FileText className="w-4 h-4" />
              View Payslips
            </motion.button>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by date, time, or status..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search attendance records"
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

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-3 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Export to CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </motion.button>
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
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                </select>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Attendance Records */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
        >
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCheck className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-800">Attendance Records</h2>
              </div>
              <div className="text-sm text-gray-600">
                {filteredRecords.length} of {records.length} records
              </div>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No attendance records found</p>
              <p className="text-gray-400 text-sm">Your attendance records will appear here</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block sm:hidden">
                <div className="divide-y divide-gray-200">
                  {paginatedRecords.map((record, index) => {
                    const checkInDate = formatDate(record.check_in);
                    const checkInTime = formatTime(record.check_in);
                    const checkOutTime = record.check_out ? formatTime(record.check_out) : null;

                    return (
                      <motion.div
                        key={record.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(record.status)}
                            <div>
                              <p className="font-semibold text-gray-800">{checkInDate}</p>
                              <p className="text-sm text-gray-600">{record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                            {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>Check-in: {checkInTime}</span>
                          </div>
                          {checkOutTime && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Check-out: {checkOutTime}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left" role="table" aria-label="Attendance records table">
                  <thead>
                    <tr className="border-b-2 border-gray-200 bg-gray-50">
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check In</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check Out</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((record, index) => {
                      const checkInDate = formatDate(record.check_in);
                      const checkInTime = formatTime(record.check_in);
                      const checkOutTime = record.check_out ? formatTime(record.check_out) : null;

                      return (
                        <motion.tr
                          key={record.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-800">{checkInDate}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{checkInTime}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {checkOutTime ? checkOutTime : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                              {getStatusIcon(record.status)}
                              {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-600">
                      Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{Math.min(endIndex, filteredRecords.length)}</span> of <span className="font-semibold">{filteredRecords.length}</span> records
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-10 h-10 rounded-lg text-sm font-medium transition ${
                              currentPage === page
                                ? 'bg-red-600 text-white'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                            aria-label={`Go to page ${page}`}
                            aria-current={currentPage === page ? 'page' : undefined}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Next page"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {filteredRecords.length === 0 && (
            <div className="p-4 bg-gray-50 text-center border-t border-gray-200">
              <p className="text-gray-600 text-sm">
                No records match your filters
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default MyAttendanceEnhanced;
