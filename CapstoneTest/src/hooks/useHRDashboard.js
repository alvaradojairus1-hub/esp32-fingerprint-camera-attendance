// src/hooks/useHRDashboard.js
import { useState, useEffect } from 'react';
import { cachedFirebaseService as firebaseService } from '../services/cachedFirebaseService';

export function useHRDashboard() {
  const [data, setData] = useState({
    users: [],
    attendance: [],
    leaveRequests: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribers = [];

    // Centralized error handler
    const handleError = (error) => {
      console.error('HRDashboard Error:', error);
      if (mounted) {
        setData(prev => ({ ...prev, error: error.message, loading: false }));
      }
    };

    const init = async () => {
      try {
        // Initial data load with one-time gets
        const [users, attendance, leaveRequests] = await Promise.all([
          firebaseService.getUsers(),
          firebaseService.getAttendance(),
          firebaseService.getLeaveRequests(),
        ]);

        // Filter attendance records for today
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

        const todayAttendance = (attendance || []).filter(record => {
          // Try to get date from timestamp or date field
          const recordDate = record.timestamp ? 
            new Date(record.timestamp).toISOString().slice(0, 10) : 
            record.date;
          return recordDate === todayStr;
        });

        if (mounted) {
          setData({
            users,
            attendance: todayAttendance, // Only store today's attendance
            leaveRequests,
            loading: false,
            error: null,
          });
        }

        // Set up real-time listeners only after initial load
        // and only for frequently changing data
        const unsubAttendance = firebaseService.onAttendanceUpdate((newAttendance) => {
          if (mounted) {
            // Filter new attendance records for today
            const todayAttendance = (newAttendance || []).filter(record => {
              const recordDate = record.timestamp ? 
                new Date(record.timestamp).toISOString().slice(0, 10) : 
                record.date;
              return recordDate === todayStr;
            });
            setData(prev => ({ ...prev, attendance: todayAttendance }));
          }
        });

        const unsubLeaves = firebaseService.onLeaveRequestsUpdate((newLeaves) => {
          if (mounted) {
            setData(prev => ({ ...prev, leaveRequests: newLeaves }));
          }
        });

        // Users change less frequently, so poll every 5 minutes instead
        const usersPollInterval = setInterval(async () => {
          try {
            const newUsers = await firebaseService.getUsers();
            if (mounted) {
              setData(prev => ({ ...prev, users: newUsers }));
            }
          } catch (error) {
            handleError(error);
          }
        }, 5 * 60 * 1000);

        unsubscribers = [
          unsubAttendance,
          unsubLeaves,
          () => clearInterval(usersPollInterval)
        ];
      } catch (error) {
        handleError(error);
      }
    };

    init();

    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, []);

  return data;
}