import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Users, AlertTriangle, CheckCircle, ClockIcon, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useScheduleTracking } from '../../hooks/useScheduleTracking';
import { scheduleService } from '../../services/scheduleService';
import { firebaseService } from '../../services/firebaseService';
import { attendanceService } from '../../services/attendanceService';
import ViewScheduleModal from './ViewScheduleModal';

const ScheduleOverview = () => {
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const pageSize = 5;

  useEffect(() => {
    loadSchedules();
    const unsubscribe = firebaseService.onAttendanceUpdate((allAttendance) => {
      const manilaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const today = manilaDate.toISOString().slice(0, 10);
      
      console.log('Processing attendance update:', {
        manilaTime: manilaDate.toLocaleString(),
        todayDate: today,
        totalRecords: allAttendance?.length || 0
      });

      const todayAttendance = (allAttendance || []).filter(record => {
        // Get proper date format from Manila timezone
        const manilaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const year = manilaDate.getFullYear();
        const month = String(manilaDate.getMonth() + 1).padStart(2, '0');
        const day = String(manilaDate.getDate()).padStart(2, '0');
        const todayKey = `${year}-${month}-${day}`;

        // Get record date, preferring the date field
        let recordDate = record.date;
        if (!recordDate && record.timestamp) {
          const recordTime = new Date(record.timestamp);
          const recordManila = new Date(recordTime.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
          const recordYear = recordManila.getFullYear();
          const recordMonth = String(recordManila.getMonth() + 1).padStart(2, '0');
          const recordDay = String(recordManila.getDate()).padStart(2, '0');
          recordDate = `${recordYear}-${recordMonth}-${recordDay}`;
        }

        console.log('Checking record:', {
          record,
          recordDate,
          todayKey,
          isToday: recordDate === todayKey
        });

        return recordDate === todayKey;
      });

      console.log('Found today\'s attendance:', {
        date: today,
        records: todayAttendance
      });

      setAttendance(todayAttendance);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [employeeTypes, employees, schedules, activeTab]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const [types, users] = await Promise.all([
        firebaseService.getEmployeeTypes(),
        firebaseService.getEmployees()
      ]);
      const userSchedules = (users || [])
        .map(user => {
          if (user.roleData?.schedule) {
            return {
              userId: user.userId || user.facultyId,
              schedule: user.roleData.schedule,
              employeeType: user.employeeType
            };
          }
          return null;
        })
        .filter(Boolean);
      setSchedules(userSchedules);
      setEmployeeTypes(types || []);
      setEmployees(users || []);
    } catch (err) {
      setError('Failed to load schedules');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    if (!time) return '—';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const getTodaySchedule = (schedule) => {
    if (!schedule?.weekly) return 'No schedule set';
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const dayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const daySchedule = schedule.weekly[dayIdx];
    if (!daySchedule || daySchedule.length === 0) return 'No shift today';
    if (Array.isArray(daySchedule))
      return daySchedule.map(s => `${formatTime(s.startTime)} – ${formatTime(s.endTime)}`).join(', ');
    if (daySchedule.startTime && daySchedule.endTime)
      return `${formatTime(daySchedule.startTime)} – ${formatTime(daySchedule.endTime)}`;
    return 'No shift today';
  };

  const calculateWeeklyHours = (schedule) => {
    if (!schedule?.weekly) return 0;
    let total = 0;
    schedule.weekly.forEach((day) => {
      if (Array.isArray(day)) {
        day.forEach(s => {
          if (s.startTime && s.endTime) {
            const [sh, sm] = s.startTime.split(':').map(Number);
            const [eh, em] = s.endTime.split(':').map(Number);
            let mins = eh * 60 + em - (sh * 60 + sm);
            if (mins < 0) mins += 24 * 60;
            total += mins;
          }
        });
      }
    });
    return Math.round(total / 60);
  };

  /** ✅ FIXED STATUS LOGIC **/
  const getScheduleStatus = (schedule, employeeType, userId) => {
    if (!schedule?.weekly) return { 
      label: 'No Shift Today', 
      color: 'gray',
      userId,
      checkInTime: null,
      scheduleStart: null,
      scheduleEnd: null
    };  // Convert current time to Asia/Manila and format date properly
  const now = new Date();
  const manilaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const year = manilaNow.getFullYear();
  const month = String(manilaNow.getMonth() + 1).padStart(2, '0');
  const day = String(manilaNow.getDate()).padStart(2, '0');
  const todayKey = `${year}-${month}-${day}`; // Format: YYYY-MM-DD
  const currentMinutes = manilaNow.getHours() * 60 + manilaNow.getMinutes();

  console.log('Date comparison setup:', {
    manilaNow: manilaNow.toLocaleString(),
    todayKey,
    currentMinutes,
    userId
  });

  console.log('Current time check:', {
    manilaNow: manilaNow.toLocaleString(),
    todayKey,
    currentMinutes,
    userId
  });

  // Get today's schedule
  const dayIdx = manilaNow.getDay() === 0 ? 6 : manilaNow.getDay() - 1;
  const todayShift = Array.isArray(schedule.weekly[dayIdx])
    ? schedule.weekly[dayIdx][0]
    : schedule.weekly[dayIdx];

  console.log('Schedule check:', {
    dayIdx,
    todayShift,
    allShifts: schedule.weekly,
    userId
  });

  if (!todayShift?.startTime || !todayShift?.endTime)
    return { 
      label: 'No Shift Today', 
      color: 'gray',
      userId,
      checkInTime: null,
      scheduleStart: null,
      scheduleEnd: null
    };

  const scheduleStart = parseInt(todayShift.startTime.split(':')[0]) * 60 +
                        parseInt(todayShift.startTime.split(':')[1]);

  // Filter attendance for this user *and* only today's date
  const todayAttendance = (attendance || []).filter(r => {
    if (!r.timestamp && !r.date) return false;
    
    // Get record date, preferring the date field over timestamp
    let recordDate = r.date;
    if (!recordDate && r.timestamp) {
      const recordTime = new Date(r.timestamp);
      const recordManilaTime = new Date(
        recordTime.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
      );
      const year = recordManilaTime.getFullYear();
      const month = String(recordManilaTime.getMonth() + 1).padStart(2, '0');
      const day = String(recordManilaTime.getDate()).padStart(2, '0');
      recordDate = `${year}-${month}-${day}`;
    }

    const matchesDate = recordDate === todayKey;
    const matchesUser = String(r.userId) === String(userId) || String(r.facultyId) === String(userId);

    console.log('Attendance record check:', {
      record: r,
      recordDate,
      todayKey,
      matchesDate,
      matchesUser,
      userId: String(userId)
    });

    return matchesDate && matchesUser;
  });

  // ✅ No check-in at all for today
  const checkIn = todayAttendance.find(r => r.type === 'check_in');
  if (!checkIn) {
    if (currentMinutes < scheduleStart) {
      return { 
        label: 'Not Started', 
        color: 'gray',
        userId,
        checkInTime: null,
        scheduleStart: todayShift.startTime,
        scheduleEnd: todayShift.endTime
      };
    }
    return { 
      label: 'Absent', 
      color: 'red',  // red for absent remains appropriate
      userId,
      checkInTime: null,
      scheduleStart: todayShift.startTime,
      scheduleEnd: todayShift.endTime
    };
  }

  // ✅ Valid check-in found for today
  const checkInTime = new Date(
    new Date(checkIn.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  );
  const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
  const lateThreshold = 15; // minutes after shift start considered Late

  if (checkInMinutes < scheduleStart)   return { 
    label: 'Early', 
    color: 'blue',  // changed from yellow to blue for Early
    userId,
    checkInTime: checkIn.timestamp,
    scheduleStart: todayShift.startTime,
    scheduleEnd: todayShift.endTime
  };
  if (checkInMinutes > scheduleStart + lateThreshold) return { 
    label: 'Late', 
    color: 'yellow',
    userId,
    checkInTime: checkIn.timestamp,
    scheduleStart: todayShift.startTime,
    scheduleEnd: todayShift.endTime
  };
  return { 
    label: 'On Time', 
    color: 'green',  // keeping green for on time/present
    userId,
    checkInTime: checkIn.timestamp,
    scheduleStart: todayShift.startTime,
    scheduleEnd: todayShift.endTime
  };
};


  const getStatusIcon = (status) => {
    switch (status.label) {
      case 'On Time': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'Late': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'Absent': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'Early': return <Clock className="w-4 h-4 text-blue-600" />;
      case 'Not Started': return <Clock className="w-4 h-4 text-gray-600" />;
      case 'No Shift Today': return <ClockIcon className="w-4 h-4 text-gray-600" />;
      default: return <ClockIcon className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status.color) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200';  // On Time
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';  // Late
      case 'red': return 'bg-red-100 text-red-800 border-red-200';  // Absent
      case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200';  // Early
      default: return 'bg-gray-100 text-gray-800 border-gray-200';  // Not Started
    }
  };

  const schedulesByUser = (schedules || []).reduce((acc, s) => {
    acc[String(s.userId)] = s;
    return acc;
  }, {});

  const combined = (employees || []).map((emp) => {
    const id = String(emp.userId || emp.employeeId || emp.id);
    const sched = schedulesByUser[id];
    const schedule = sched?.schedule || emp.schedule || {};
    const empType = employeeTypes.find(t => t.id === (emp.employeeType || sched?.employeeType));
    const weeklyHours = calculateWeeklyHours(schedule);
    return {
      userId: id,
      name: emp.name || emp.fullName || emp.displayName || 'N/A',
      schedule,
      employeeType: empType,
      weeklyHours,
      todaySchedule: getTodaySchedule(schedule),
      status: getScheduleStatus(schedule, empType, id)
    };
  });

  // Setup schedule tracking at component level
  const { saveTracking } = useScheduleTracking();

  // Calculate filtered items first
  const filtered = combined.filter(s => activeTab === 'all' || s.employeeType === activeTab);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  // Handle status changes using the hook's saveTracking function
  const handleStatusChange = useCallback((status) => {
    if (status && status.userId) {
      saveTracking(status);
    }
  }, [saveTracking]);

  // Track last saved status per user to avoid duplicate saves
  const [lastSavedStatuses, setLastSavedStatuses] = useState({});

  // Effect to track status changes
  useEffect(() => {
    if (!filtered) return;
    
    filtered.forEach(employee => {
      if (!employee.status) return;
      
      const lastStatus = lastSavedStatuses[employee.userId];
      const currentStatus = employee.status;
      
      // Only save if status changed
      if (!lastStatus || 
          lastStatus.label !== currentStatus.label || 
          lastStatus.checkInTime !== currentStatus.checkInTime) {
        
        handleStatusChange(currentStatus);
        setLastSavedStatuses(prev => ({
          ...prev,
          [employee.userId]: currentStatus
        }));
      }
    });
  }, [filtered, handleStatusChange, lastSavedStatuses]);

  if (loading) {
    return <div className="animate-pulse p-6 bg-white rounded-xl shadow-lg">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
      <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded"></div>)}</div>
    </div>;
  }

  if (error) {
    return <div className="p-6 bg-white rounded-xl shadow-lg text-red-500">{error}</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-800">Schedule Overview</h2>
        </div>
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-6 py-4 text-sm font-semibold text-gray-700">Employee</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-700">ID</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-700">Today's Schedule</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-700">Hours/Week</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageItems.map((item, i) => (
              <motion.tr key={item.userId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-800">
                    <Link to={`/dtr/user/${item.userId}`} className="hover:underline">{item.name}</Link>
                  </div>
                  <div className="text-sm text-gray-500">{item.employeeType?.name || 'Not Set'}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.userId}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-3">
                    <span>{getTodaySchedule(item.schedule)}</span>
                    {item.schedule?.weekly && (
                      <button
                        onClick={() => setSelectedSchedule({ schedule: item.schedule, name: item.name })}
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs"
                      >
                        <Eye className="h-4 w-4" />
                        <span>View Full</span>
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {item.weeklyHours > 0 ? `${item.weeklyHours} hrs/week` : '—'}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                    {getStatusIcon(item.status)}
                    {item.status.label}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">Showing {(start + 1)} to {Math.min(start + pageSize, total)} of {total}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx + 1)}
                  className={`px-2 py-1 text-sm rounded ${currentPage === idx + 1 ? 'pagination-current' : 'bg-white border pagination-page'}`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage === pageCount}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ViewScheduleModal
        schedule={selectedSchedule?.schedule}
        employeeName={selectedSchedule?.name}
        isOpen={!!selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
      />
    </motion.div>
  );
};

export default ScheduleOverview;
