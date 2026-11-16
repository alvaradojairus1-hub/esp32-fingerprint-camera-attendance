// src/services/cachedFirebaseService.js
import { cache } from '../utils/cache';
import { firebaseService } from './firebaseService';

// Wrap the original service with caching
export const cachedFirebaseService = {
  // Users
  async getUsers() {
    const cachedUsers = cache.users.get('all');
    if (cachedUsers) {
      return cachedUsers;
    }

    const users = await firebaseService.getUsers();
    cache.users.set('all', users);
    return users;
  },

  // Attendance
  async getAttendance() {
    const cachedAttendance = cache.attendance.get('all');
    if (cachedAttendance) {
      return cachedAttendance;
    }

    const attendance = await firebaseService.getAttendance();
    cache.attendance.set('all', attendance);
    return attendance;
  },

  // Leave requests
  async getLeaveRequests() {
    const cachedLeaves = cache.leaveRequests.get('all');
    if (cachedLeaves) {
      return cachedLeaves;
    }

    const leaves = await firebaseService.getLeaveRequests();
    cache.leaveRequests.set('all', leaves);
    return leaves;
  },

  // Pass through other methods from original service
  ...Object.fromEntries(
    Object.entries(firebaseService)
      .filter(([key]) => !['getUsers', 'getAttendance', 'getLeaveRequests'].includes(key))
      .map(([key, value]) => [key, value])
  ),

  // Cache invalidation helpers
  invalidateCache(type = 'all') {
    switch (type) {
      case 'users':
        cache.users.clear();
        break;
      case 'attendance':
        cache.attendance.clear();
        break;
      case 'leaveRequests':
        cache.leaveRequests.clear();
        break;
      case 'all':
      default:
        cache.users.clear();
        cache.attendance.clear();
        cache.leaveRequests.clear();
        break;
    }
  },

  // Enhanced real-time listeners that update cache
  onUsersUpdate(cb) {
    return firebaseService.onUsersUpdate((users) => {
      cache.users.set('all', users);
      cb(users);
    });
  },

  onAttendanceUpdate(cb) {
    return firebaseService.onAttendanceUpdate((attendance) => {
      cache.attendance.set('all', attendance);
      cb(attendance);
    });
  },

  onLeaveRequestsUpdate(cb) {
    return firebaseService.onLeaveRequestsUpdate((leaves) => {
      cache.leaveRequests.set('all', leaves);
      cb(leaves);
    });
  },
};