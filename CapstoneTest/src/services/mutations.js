// src/services/mutations.js
import { set, ref, push, update, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { normalizers } from './normalizers';

// Helper to handle database errors
const handleDbError = (error, operation) => {
  console.error(`Firebase ${operation} error:`, error);
  throw error;
};

export const mutations = {
  // User mutations
  users: {
    create: async (userData) => {
      if (!userData) throw new Error('userData is required');
      try {
        const normalized = normalizers.normalizeUser(userData);
        const userRef = push(ref(db, 'users'));
        await set(userRef, {
          ...normalized,
          createdAt: serverTimestamp()
        });
        return userRef.key;
      } catch (error) {
        handleDbError(error, 'users.create');
      }
    },

    update: async (userId, updates) => {
      if (!userId || !updates) throw new Error('userId and updates are required');
      try {
        const normalized = normalizers.normalizeUser(updates);
        await update(ref(db, `users/${userId}`), normalized);
        return true;
      } catch (error) {
        handleDbError(error, 'users.update');
      }
    }
  },

  // Attendance mutations
  attendance: {
    recordEntry: async (userId, type = 'check_in') => {
      if (!userId) throw new Error('userId is required');
      
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().split(' ')[0];
      
      try {
        const normalized = normalizers.normalizeAttendance(
          {
            userId,
            type,
            timestamp: now.getTime()
          },
          date,
          time
        );

        await set(ref(db, `attendance/${date}/${time}`), normalized);
        return { date, time };
      } catch (error) {
        handleDbError(error, 'attendance.recordEntry');
      }
    }
  },

  // Leave request mutations
  leaves: {
    create: async (facultyId, requestData) => {
      if (!facultyId || !requestData) throw new Error('facultyId and requestData are required');
      try {
        const normalized = normalizers.normalizeLeaveRequest(requestData, facultyId);
        const requestRef = push(ref(db, `leave_requests/${facultyId}`));
        await set(requestRef, {
          ...normalized,
          createdAt: serverTimestamp()
        });
        return requestRef.key;
      } catch (error) {
        handleDbError(error, 'leaves.create');
      }
    },

    updateStatus: async (facultyId, requestId, status, approver = null) => {
      if (!facultyId || !requestId || !status) {
        throw new Error('facultyId, requestId and status are required');
      }
      try {
        const updates = {
          status,
          updatedAt: serverTimestamp()
        };
        if (approver) updates.approver = approver;

        await update(ref(db, `leave_requests/${facultyId}/${requestId}`), updates);
        return true;
      } catch (error) {
        handleDbError(error, 'leaves.updateStatus');
      }
    }
  }
};