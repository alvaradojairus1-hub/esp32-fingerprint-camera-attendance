// src/components/AttendanceChart.jsx

import { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import { database, dbRef } from '../../firebase';
import { firebaseService } from '../../services/firebaseService';
import { scheduleService } from '../../services/scheduleService';
import { normalizeAttendanceForUI } from '../../utils/attendanceUtils';
import { ref, get, set } from 'firebase/database';
import { createAccessibleChartConfig, getAccessibleColors } from '../../utils/chartSetup';
import { addThemeChangeListener, dispatchThemeChange, isDarkMode } from '../../utils/themeUtils';



const AttendanceChart = ({ statusFilter = 'all', queryText = '' }) => {
  const chartRef = useRef();
  const [rawAttendance, setRawAttendance] = useState(null);
  const [attendanceData, setAttendanceData] = useState({
    'present': [0, 0, 0, 0, 0, 0, 0],
    'late': [0, 0, 0, 0, 0, 0, 0],
    'on leave': [0, 0, 0, 0, 0, 0, 0],
  });

  // canonical intermediate states
  const [baseCounts, setBaseCounts] = useState({
    'present': [0,0,0,0,0,0,0],
    'late': [0,0,0,0,0,0,0],
    'on leave': [0,0,0,0,0,0,0],
  });
  const [rawRecords, setRawRecords] = useState([]);
  const [leaveRequestsCounts, setLeaveRequestsCounts] = useState([0,0,0,0,0,0,0]);
  const [approvedLeaveIds, setApprovedLeaveIds] = useState(new Set());
  const [usersMap, setUsersMap] = useState({});

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const [isDark, setIsDark] = useState(isDarkMode());
  const [lastResetTimestamp, setLastResetTimestamp] = useState(null);
  const [resetPerformed, setResetPerformed] = useState(false);

  // Helper: parse a plain date string (YYYY-MM-DD) into a Manila-local Date at midnight
  const parseManilaDate = (dateStr) => {
    try {
      // Anchor to +08:00 to avoid timezone shifting
      return new Date(`${dateStr}T00:00:00+08:00`);
    } catch (e) {
      return new Date(dateStr);
    }
  };

  // Helper: compute a simple week key (YYYY-Www) using ISO week number for a Manila date
  const getManilaWeekKey = (dateObj) => {
    // clone and convert to Manila local by formatting via toLocaleString
    const manilaStr = new Date(dateObj).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const manila = new Date(manilaStr);

    // ISO week number calculation
    const tmp = new Date(manila.valueOf());
    // Set to nearest Thursday: current date + 4 - currentDayOfWeek (Mon=1..Sun=7)
    const dayNr = (manila.getDay() + 6) % 7 + 1; // Mon=1 .. Sun=7
    tmp.setDate(manila.getDate() + (4 - dayNr));
    const yearStart = new Date(tmp.getFullYear(),0,1);
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
    return `${tmp.getFullYear()}-W${String(weekNo).padStart(2,'0')}`;
  };

  // Function to check whether we should perform the weekly reset.
  // New behavior: only perform the reset on Sundays, and only if the stored
  // `lastAttendanceReset` occurred before the start of the current Sunday.
  const shouldResetData = (lastReset) => {
    const now = new Date();

    // In JS Date, Sunday === 0. Only reset on Sundays.
    const isSunday = now.getDay() === 0;
    if (!isSunday) return false;

    // Compute start-of-day for the current Sunday (00:00:00 local time)
    const currentSunday = new Date(now);
    currentSunday.setHours(0, 0, 0, 0);
    // move back to the most recent Sunday (if it's Sunday this is no-op)
    currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());

    if (!lastReset) return true; // never-reset before, do it on the first Sunday

    const lastResetDate = new Date(lastReset);

    // Only reset when lastReset happened strictly before the current Sunday's start
    return lastResetDate < currentSunday;
  };

  // Function to reset attendance data
  const resetAttendanceData = async () => {
    try {
      // Reset the attendance data in Firebase
      const attendanceRef = ref(database, 'attendance');
      const now = new Date().toISOString();
      
      // Update the last reset timestamp
      await set(ref(database, 'lastAttendanceReset'), now);
      setLastResetTimestamp(now);

      // NOTE: previously we zeroed local UI arrays here which made the
      // dashboard appear to have no records. That was hiding actual DB data.
      // To preserve visibility of real attendance records, we no longer zero
      // the client's local state. We still record the reset timestamp in DB.
      setResetPerformed(true);
    } catch (error) {
      console.error('Error resetting attendance data:', error);
    }
  };

  // Check for weekly reset on component mount
  useEffect(() => {
    const checkAndResetData = async () => {
      try {
        const lastResetRef = ref(database, 'lastAttendanceReset');
        const snapshot = await get(lastResetRef);
        const lastReset = snapshot.val();
        setLastResetTimestamp(lastReset);

        if (shouldResetData(lastReset)) {
          await resetAttendanceData();
        }
      } catch (error) {
        console.error('Error checking reset status:', error);
      }
    };

    checkAndResetData();
  }, []);

  // Subscribe to attendance node and store raw snapshot
  useEffect(() => {
    const unsub = firebaseService.onAttendanceUpdate((arr) => {
      // Get current Manila week boundaries
      const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const today = manila.getDate();
      const startOfWeek = new Date(manila);
      startOfWeek.setDate(today - ((manila.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Filter and normalize records for current week only
      const normalizedArr = (arr || [])
        .filter(record => {
          const recordDate = new Date(record.rawTimestamp || `${record.date}T${record.time || '00:00:00'}`);
          return recordDate >= startOfWeek && recordDate <= endOfWeek;
        })
        .map(r => normalizeAttendanceForUI(r));

      // Group by date and time, keeping only the latest record per user per day
      const nested = {};
      const processedUsers = new Map(); // Track processed users per day

      normalizedArr.forEach(rec => {
        const date = rec.date || (rec.rawTimestamp ? rec.rawTimestamp.split('T')[0] : null);
        const time = rec.time || (rec.rawTimestamp ? (rec.rawTimestamp.split('T')[1] || '').split('Z')[0] : null);
        const userId = rec.userId || rec.facultyId;

        if (!date || !time || !userId) return;

        // Create unique key for user's daily record
        const userDayKey = `${date}-${userId}`;

        // Skip if we've already processed a record for this user on this day
        if (processedUsers.has(userDayKey)) {
          const existingTime = processedUsers.get(userDayKey);
          // Only update if this record is newer
          if (time <= existingTime) return;
        }

        // Store/update the record
        nested[date] = nested[date] || {};
        nested[date][time] = rec;
        processedUsers.set(userDayKey, time);
      });

      setRawAttendance(nested);
      setRawRecords(normalizedArr);
    });

    return () => { try { unsub && unsub(); } catch(e) {} };
  }, []);

  // Ensure unique handling of theme changes
  useEffect(() => {
    const handleThemeChange = (darkMode) => {
      setIsDark(darkMode);
      if (chartRef.current) {
        chartRef.current.update(); // Force chart redraw
      }
    };

    const cleanup = addThemeChangeListener(handleThemeChange);

    return cleanup;
  }, []);

  // Recompute chart data when rawAttendance or filters change
  // Only include records within the current Manila week (Mon-Sun).
  useEffect(() => {
    const newData = {
      'present': [0, 0, 0, 0, 0, 0, 0],
      'late': [0, 0, 0, 0, 0, 0, 0],
      'on leave': [0, 0, 0, 0, 0, 0, 0],
    };

    if (!rawAttendance) {
      setAttendanceData(newData);
      return;
    }

    // Get Manila's current time
    const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const today = manila.getDate();
    const startOfWeek = new Date(manila);
    // Move to Monday (1) if we're on Sunday (0)
    startOfWeek.setDate(today - ((manila.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    // Get the end of week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const q = (queryText || '').trim().toLowerCase();

  // Determine current Manila week key so we only count this week's records
  const manilaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const currentWeekKey = getManilaWeekKey(manilaNow);

    // Process attendance data from new structure: attendance/{date}/{time}
    // Keep track of which users we've already counted for each date
    const userDayCounts = new Map(); // Map of "date-userId" -> status

    Object.entries(rawAttendance).forEach(([date, timeData]) => {
      // Convert date string to Manila time
      const recordDate = parseManilaDate(date);
      
      // Skip if record is not within current week's range
      if (recordDate < startOfWeek || recordDate > endOfWeek) return;

      // Process only the latest record for each user per day
      const dailyRecords = Object.entries(timeData)
        .map(([time, record]) => ({
          time,
          ...record
        }))
        .filter(record => record.type === 'check_in')
        .sort((a, b) => new Date(b.rawTimestamp || b.timestamp) - new Date(a.rawTimestamp || a.timestamp));

      // Get unique users for this day
      const processedUsers = new Set();

      dailyRecords.forEach(record => {
        const userId = record.userId || record.facultyId;
        if (!userId || processedUsers.has(userId)) return;

        const status = record.status?.toLowerCase();
        if (!status) return;

        // status filter
        if (statusFilter && statusFilter !== 'all' && status !== statusFilter) return;

        // Mark this user as processed for this day
        processedUsers.add(userId);

        // Calculate the day index (0 = Monday, 6 = Sunday)
        const dayIndex = (recordDate.getDay() + 6) % 7;

        if (newData[status]) {
          newData[status][dayIndex] += 1;
        }
      });
    });

    setAttendanceData(newData);
  }, [rawAttendance, statusFilter, queryText]);

  // Recompute baseCounts by re-evaluating each check-in against the user's schedule.
  // This ensures the 'late' series reflects the schedule rules rather than relying on stored record.status.
  useEffect(() => {
    try {
      const base = { 'present': [0,0,0,0,0,0,0], 'late': [0,0,0,0,0,0,0], 'on leave': [0,0,0,0,0,0,0] };
      const counted = new Map();

      (rawRecords || []).forEach(rec => {
        try {
          const date = rec.date || (rec.rawTimestamp ? rec.rawTimestamp.split('T')[0] : null);
          if (!date || (rec.type || '').toString().toLowerCase() !== 'check_in') return;
          const userId = rec.userId || rec.facultyId;
          if (!userId) return;

          const dayKey = `${date}-${userId}`;
          if (counted.has(dayKey)) return;

          // default to stored normalized status
          let status = (rec.status || '').toString().toLowerCase() || '';

          // If we have the user's schedule in usersMap, re-evaluate against it
          const user = usersMap && usersMap[String(userId)];
          if (user && (user.roleData?.schedule || user.schedule)) {
            const schedRaw = user.roleData?.schedule || user.schedule;
            // Build service-compatible schedule object expected by scheduleService.validateAttendanceAgainstSchedule
            const serviceSched = { schedule: {} };
            if (Array.isArray(schedRaw.weekly)) {
              const daysMap = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
              for (let i = 0; i < 7; i++) {
                serviceSched.schedule[daysMap[i]] = schedRaw.weekly[i]?.[0] || null;
              }
            } else if (schedRaw.schedule) {
              // already in service format
              Object.assign(serviceSched.schedule, schedRaw.schedule);
            } else {
              // fallback: try mapping named keys
              serviceSched.schedule = schedRaw;
            }

            // Derive HH:MM time in Asia/Manila from rawTimestamp or time
            let timeHHMM = null;
            if (rec.rawTimestamp) {
              try {
                const manilaStr = new Date(rec.rawTimestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
                const manilaDate = new Date(manilaStr);
                timeHHMM = `${manilaDate.getHours().toString().padStart(2,'0')}:${manilaDate.getMinutes().toString().padStart(2,'0')}`;
              } catch (e) {
                // fallback to rec.time truncated
                timeHHMM = rec.time ? rec.time.split(':').slice(0,2).join(':') : null;
              }
            } else {
              timeHHMM = rec.time ? rec.time.split(':').slice(0,2).join(':') : null;
            }

            try {
              const validation = scheduleService.validateAttendanceAgainstSchedule(serviceSched, date, timeHHMM);
              if (validation && validation.isValid) {
                if (validation.isLate) status = 'late';
                else status = 'present';
              } else {
                status = 'no_status';
              }
            } catch (e) {
              // if validation fails, keep stored status
            }
          }

          // Record count
          const recordDate = new Date(date);
          const dayIndex = (recordDate.getDay() + 6) % 7; // Monday=0
          if (status && base[status]) base[status][dayIndex] += 1;
          counted.set(dayKey, true);
        } catch (e) { /* ignore per-record errors */ }
      });

      // Debug: log recomputed base counts so we can verify 'late' increments
      try {
        console.log('Recomputed baseCounts (attendance):', base);
      } catch (e) {}
      setBaseCounts(base);
    } catch (e) {
      // ignore
    }
  }, [rawRecords, usersMap]);

  // Process leave requests and update the chart
  useEffect(() => {
    const unsub = firebaseService.onLeaveRequestsUpdate((leaves) => {
      try {
        // Get current Manila week boundaries for date comparisons
        const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const today = manila.getDate();
        const startOfWeek = new Date(manila);
        startOfWeek.setDate(today - ((manila.getDay() + 6) % 7));
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // Initialize weekly leave counts
        const weeklyLeaveCounts = Array(7).fill(0);
        const newApprovedIds = new Set();
        
        // Track unique user-dates to prevent double counting
        const processedLeaveDates = new Set();
        
        console.log('Processing leaves:', leaves);
        // Process approved leaves within current week
        if (Array.isArray(leaves)) {
          leaves.forEach(leave => {
            console.log('Processing leave:', leave);
            if (leave.status === 'approved') {
              // Convert dates to Manila timezone for consistent comparison
              const startDate = leave.startDate;
              const endDate = leave.endDate;
              
              const leaveStart = new Date(new Date(startDate).toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
              const leaveEnd = new Date(new Date(endDate).toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
              
              // Process each day of the leave within current week
              const currentDate = new Date(leaveStart);
              while (currentDate <= leaveEnd) {
                if (currentDate >= startOfWeek && currentDate <= endOfWeek) {
                  const dateString = currentDate.toISOString().split('T')[0];
                  const userDateKey = `${dateString}-${leave.employeeId || leave.userId}`;
                  
                  // Only count if we haven't processed this user-date combination
                  if (!processedLeaveDates.has(userDateKey)) {
                    const dayIndex = (currentDate.getDay() + 6) % 7; // Adjust for Monday start
                    weeklyLeaveCounts[dayIndex]++;
                    processedLeaveDates.add(userDateKey);
                    newApprovedIds.add(leave.employeeId || leave.userId);
                    
                    console.log('[Leave Count] Adding leave for:', {
                      userId: leave.employeeId || leave.userId,
                      date: dateString,
                      dayIndex,
                      weeklyLeaveCounts,
                      startDate,
                      endDate
                    });
                  }
                }
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
              }
            }
          });
        }

        // Update the state with processed leave counts
        console.log('Weekly leave counts:', {
          startOfWeek: startOfWeek.toISOString(),
          endOfWeek: endOfWeek.toISOString(),
          counts: weeklyLeaveCounts,
          processedDates: processedLeaveDates.size,
          approvedUsers: Array.from(newApprovedIds)
        });

        setLeaveRequestsCounts(weeklyLeaveCounts);
        setApprovedLeaveIds(newApprovedIds);
      } catch (e) {
        console.error('Error processing leave requests:', e);
      }
    });

    return () => { try { unsub && unsub(); } catch (e) {} };
  }, []);

  // Listen to users directory to apply directory-level "on leave" flags
  useEffect(() => {
    const unsub = firebaseService.onUsersUpdate((usersArr) => {
      const map = {};
      (usersArr || []).forEach(u => {
        if (!u) return;
        const idKeys = [u.facultyId, u.userId, u.id].filter(Boolean).map(String);
        idKeys.forEach(k => { if (k) map[k] = u; });
      });
      setUsersMap(map);
    });
    return () => { try { unsub && unsub(); } catch (e) {} };
  }, []);

  // Recompute merged attendanceData whenever baseCounts or usersMap changes
  useEffect(() => {
    try {
      // Initialize with present and late counts from baseCounts
      const merged = {
        'present': [...(baseCounts['present'] || Array(7).fill(0))],
        'late': [...(baseCounts['late'] || Array(7).fill(0))],
        'on leave': [...(leaveRequestsCounts || Array(7).fill(0))]  // Use leave counts from state
      };

      // Get current Manila week boundaries
      const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const today = manila.getDate();
      const startOfWeek = new Date(manila);
      startOfWeek.setDate(today - ((manila.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // directory-level "on leave" flags: count users flagged as on-leave and add to today's index
      const currentDate = new Date();
      const todayIdx = (currentDate.getDay() + 6) % 7;
      let dirCountToday = 0;
      Object.values(usersMap).forEach(u => {
        if (!u) return;
        const st = (u.status || u.state || '').toString().toLowerCase();
        if (st === 'on leave' || st === 'on_leave' || st === 'onleave' || st.includes('leave')) {
          if ((u.role || '').toString().toLowerCase() === 'hr') return;
          dirCountToday += 1;
        }
      });
      merged['on leave'][todayIdx] += dirCountToday;

      setAttendanceData(merged);
    } catch (e) {
      // ignore
    }
  }, [baseCounts, leaveRequestsCounts, usersMap]);

  const data = {
    labels: days,
    datasets: [
      {
        label: 'Present',
        data: attendanceData['present'],
        borderColor: '#00C4FF',
        backgroundColor: 'rgba(0,196,255,0.2)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
      },
      {
        label: 'Late',
        data: attendanceData['late'],
        borderColor: '#FFB400',
        backgroundColor: 'rgba(255,180,0,0.2)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
      },
      {
        label: 'On Leave',
        data: attendanceData['on leave'],
        borderColor: '#45C490',
        backgroundColor: 'rgba(69,196,144,0.2)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
      },
    ],
  };

  // Ensure all dataset values are numeric and arrays are length 7
  try {
    data.datasets.forEach((ds) => {
      ds.data = (ds.data || []).map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      });
      if (ds.data.length < 7) ds.data = ds.data.concat(Array(7 - ds.data.length).fill(0));
      if (ds.data.length > 7) ds.data = ds.data.slice(0, 7);
    });
  } catch (e) {
    // fallback: replace with zeros to avoid chart crashes
    data.datasets.forEach((ds) => { ds.data = [0, 0, 0, 0, 0, 0, 0]; });
  }

  // Enhance dark mode compatibility and improve chart styling
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: isDark ? '#e5e7eb' : '#1f2937',
          font: {
            size: 14,
            family: 'Arial, sans-serif',
          },
        },
      },
      title: {
        // Title moved to DOM so Tailwind controls dark/light
        display: false,
      },
    },
    scales: {
      x: {
        ticks: {
          color: isDark ? '#9ca3af' : '#4B5563',
          font: {
            size: 12,
            family: 'Arial, sans-serif',
          },
        },
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          color: isDark ? '#9ca3af' : '#4B5563',
          font: {
            size: 12,
            family: 'Arial, sans-serif',
          },
        },
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
        },
      },
    },
  };

  // Prevent redundant event listeners
  useEffect(() => {
    const resize = () => {
      if (chartRef.current) {
        chartRef.current.resize();
        chartRef.current.update(); // Force chart redraw
      }
    };

    window.addEventListener('resize', resize);
    setTimeout(resize, 310);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Force redraw when data changes to avoid rendering artifacts or layering issues
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        chartRef.current && chartRef.current.update();
      } catch (e) {
        // ignore
      }
    }, 120);
    return () => clearTimeout(t);
  }, [data]);

  // Improve mobile responsiveness
  // Use static Tailwind classes with dark variants so theme toggles are handled by CSS
  // Remove fixed outer heights so inner chart area can control sizing
  const containerClassName = 'backdrop-blur-sm p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 max-w-full sm:max-w-[95%] mx-auto overflow-hidden bg-white dark:bg-gray-800 border border-white/20 dark:border-gray-700 min-h-0';

  // Improve layout spacing and legend styles to avoid overlap
  const enhancedOptions = {
    ...options,
    layout: {
      ...(options.layout || {}),
      // reasonable padding; keep bottom padding moderate so chart height is preserved
      padding: { top: 12, right: 12, bottom: 28, left: 12 },
    },
    plugins: {
      ...(options.plugins || {}),
      // hide the in-canvas legend; we'll render a DOM legend outside the canvas
      legend: {
        display: false,
      },
      title: {
        ...(options.plugins?.title || {}),
      }
    },
    scales: {
      x: {
        ...(options.scales?.x || {}),
        ticks: {
          ...(options.scales?.x?.ticks || {}),
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 8,
          padding: 6,
        },
        grid: {
          ...(options.scales?.x?.grid || {}),
          drawBorder: false,
        }
      },
      y: {
        ...(options.scales?.y || {}),
        grid: {
          ...(options.scales?.y?.grid || {}),
          drawBorder: false,
        }
      }
    }
  };

  // Compute dynamic y-axis max with headroom so very high spikes don't break the chart
  try {
    const allValues = data.datasets.reduce((acc, ds) => acc.concat(ds.data || []), []);
    const maxVal = allValues.length ? Math.max(...allValues.map(v => (Number.isFinite(v) ? v : 0))) : 0;
    // Give 20% headroom and enforce a reasonable minimum (5)
    const yMax = Math.max(5, Math.ceil(maxVal * 1.2));
    const stepSize = Math.max(1, Math.ceil(yMax / 5));
    enhancedOptions.scales = enhancedOptions.scales || {};
    enhancedOptions.scales.y = enhancedOptions.scales.y || {};
    enhancedOptions.scales.y.max = yMax;
    enhancedOptions.scales.y.ticks = { ...(enhancedOptions.scales.y.ticks || {}), stepSize };
  } catch (e) {
    // ignore - fallback will use default chart scaling
  }

  return (
    <motion.div
      className={containerClassName}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.01 }}
    >
      {/* inner panel to create the dark/colored boxed area that the canvas sits on */}
      <div className="w-full h-full rounded-lg overflow-hidden bg-white dark:bg-gray-900">
    <div className="w-full h-full p-4 flex flex-col min-h-0">
          {/* DOM title + legend: title/subtitle are outside canvas so Tailwind controls color */}
          <div className="w-full flex items-start justify-between mb-2">
            <div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Weekly Attendance Overview</h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">Overview of attendance by day</p>
            </div>
            <div className="w-auto flex justify-end">
              <div className="flex items-center gap-4 flex-shrink-0">
              {data.datasets.map((ds, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: ds.borderColor || (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) }} />
                  <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">{ds.label}</span>
                </div>
              ))}
            </div>
              </div>
          </div>

            {/* explicit chart height so the line chart is large enough */}
            <div className="h-64 sm:h-80 lg:h-96 relative">
              <div className="w-full h-full" style={{ position: 'relative' }}>
                <Line
                  ref={chartRef}
                  data={data}
                  options={enhancedOptions}
                  style={{ position: 'relative', width: '100%', height: '100%', zIndex: 50, background: 'transparent' }}
                />
              </div>
            </div>
        </div>
      </div>
    </motion.div>
  );
};

export default AttendanceChart;
