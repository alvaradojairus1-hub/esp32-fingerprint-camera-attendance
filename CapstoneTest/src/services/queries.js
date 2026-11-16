// src/services/queries.js
import { get, set, ref, onValue, off, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { normalizers } from './normalizers';

// Cache utility for storing query results
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to handle database errors
const handleDbError = (error, operation) => {
  console.error(`Firebase ${operation} error:`, error);
  throw error;
};

// Helper to manage real-time subscriptions
const subscriptions = new Map();

export const queries = {
  // User queries
  users: {
    getAll: async () => {
      try {
        const snapshot = await get(ref(db, 'users'));
        if (!snapshot.exists()) return [];
        
        const users = [];
        snapshot.forEach((child) => {
          users.push(normalizers.normalizeUser(child.val(), child.key));
        });
        return users;
      } catch (error) {
        handleDbError(error, 'users.getAll');
      }
    },

    getById: async (userId) => {
      if (!userId) throw new Error('userId is required');
      try {
        const snapshot = await get(ref(db, `users/${userId}`));
        if (!snapshot.exists()) return null;
        return normalizers.normalizeUser(snapshot.val(), snapshot.key);
      } catch (error) {
        handleDbError(error, 'users.getById');
      }
    },

    subscribeToChanges: (callback) => {
      const path = 'users';
      if (subscriptions.has(path)) {
        off(ref(db, path), subscriptions.get(path));
      }

      const handler = onValue(
        ref(db, path),
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([]);
            return;
          }

          const users = [];
          snapshot.forEach((child) => {
            users.push(normalizers.normalizeUser(child.val(), child.key));
          });
          callback(users);
        },
        (error) => handleDbError(error, 'users.subscribe')
      );

      subscriptions.set(path, handler);
      return () => {
        off(ref(db, path), handler);
        subscriptions.delete(path);
      };
    }
  },

  // Attendance queries
  attendance: {
    getByDateRange: async (startDate, endDate) => {
      if (!startDate || !endDate) throw new Error('startDate and endDate are required');
      
      const cacheKey = `attendance:${startDate}:${endDate}`;
      const cached = queryCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return cached.data;
      }

      try {
        const snapshot = await get(ref(db, 'attendance'));
        if (!snapshot.exists()) return [];

        const records = [];
        snapshot.forEach((dateChild) => {
          const date = dateChild.key;
          if (date >= startDate && date <= endDate) {
            dateChild.forEach((timeChild) => {
              records.push(
                normalizers.normalizeAttendance(timeChild.val(), date, timeChild.key)
              );
            });
          }
        });

        queryCache.set(cacheKey, {
          data: records,
          expiry: Date.now() + CACHE_TTL
        });

        return records;
      } catch (error) {
        handleDbError(error, 'attendance.getByDateRange');
      }
    },

    subscribeToToday: (callback) => {
      const today = new Date().toISOString().split('T')[0];
      const path = `attendance/${today}`;

      if (subscriptions.has(path)) {
        off(ref(db, path), subscriptions.get(path));
      }

      const handler = onValue(
        ref(db, path),
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([]);
            return;
          }

          const records = [];
          snapshot.forEach((timeChild) => {
            records.push(
              normalizers.normalizeAttendance(timeChild.val(), today, timeChild.key)
            );
          });
          callback(records);
        },
        (error) => handleDbError(error, 'attendance.subscribeToToday')
      );

      subscriptions.set(path, handler);
      return () => {
        off(ref(db, path), handler);
        subscriptions.delete(path);
      };
    }
  },

  // Leave requests queries
  leaves: {
    getAll: async () => {
      try {
        const snapshot = await get(ref(db, 'leave_requests'));
        if (!snapshot.exists()) return [];

        const requests = [];
        snapshot.forEach((facultyChild) => {
          const facultyId = facultyChild.key;
          facultyChild.forEach((requestChild) => {
            requests.push(
              normalizers.normalizeLeaveRequest(requestChild.val(), facultyId, requestChild.key)
            );
          });
        });
        return requests;
      } catch (error) {
        handleDbError(error, 'leaves.getAll');
      }
    },

    getByFacultyId: async (facultyId) => {
      if (!facultyId) throw new Error('facultyId is required');
      try {
        const snapshot = await get(ref(db, `leave_requests/${facultyId}`));
        if (!snapshot.exists()) return [];

        const requests = [];
        snapshot.forEach((child) => {
          requests.push(
            normalizers.normalizeLeaveRequest(child.val(), facultyId, child.key)
          );
        });
        return requests;
      } catch (error) {
        handleDbError(error, 'leaves.getByFacultyId');
      }
    },

    subscribeToChanges: (callback) => {
      const path = 'leave_requests';
      if (subscriptions.has(path)) {
        off(ref(db, path), subscriptions.get(path));
      }

      const handler = onValue(
        ref(db, path),
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([]);
            return;
          }

          const requests = [];
          snapshot.forEach((facultyChild) => {
            const facultyId = facultyChild.key;
            facultyChild.forEach((requestChild) => {
              requests.push(
                normalizers.normalizeLeaveRequest(requestChild.val(), facultyId, requestChild.key)
              );
            });
          });
          callback(requests);
        },
        (error) => handleDbError(error, 'leaves.subscribe')
      );

      subscriptions.set(path, handler);
      return () => {
        off(ref(db, path), handler);
        subscriptions.delete(path);
      };
    }
  }
};