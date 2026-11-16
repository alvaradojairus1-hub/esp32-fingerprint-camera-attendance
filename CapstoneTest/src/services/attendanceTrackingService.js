import { database, dbRef } from '../firebase';
import { ref, push, set, query, orderBy, limitToLast, get } from 'firebase/database';

export const attendanceTrackingService = {
  // Save attendance status for faculty
  async saveAttendanceStatus(userId, attendanceData) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    try {
      const statusRef = ref(database, dbRef(`attendance_tracking/${date}/${userId}`));
      const data = {
        userId,
        timestamp: new Date().toISOString(),
        checkInTime: attendanceData.checkIn,
        scheduleTime: attendanceData.scheduleTime,
        status: attendanceData.status, // 'early' or 'late'
        minutesDifference: attendanceData.minutesDifference
      };
      
      await set(statusRef, data);
      console.log('Attendance status saved:', data);
      
      // Also save to statistics collection for historical tracking
      const statsRef = push(ref(database, dbRef('attendance_statistics')));
      await set(statsRef, data);
    } catch (error) {
      console.error('Error saving attendance status:', error);
      throw error;
    }
  },

  // Get most early faculty for current date
  async getMostEarlyFaculty() {
    const date = new Date().toISOString().split('T')[0];
    
    try {
      const trackingRef = ref(database, dbRef(`attendance_tracking/${date}`));
      const snapshot = await get(trackingRef);
      
      if (!snapshot.exists()) {
        return null;
      }

      let earliestFaculty = null;
      let maxMinutesDifference = 0;

      snapshot.forEach((child) => {
        const data = child.val();
        if (data.status === 'early' && data.minutesDifference > maxMinutesDifference) {
          maxMinutesDifference = data.minutesDifference;
          earliestFaculty = data;
        }
      });

      return earliestFaculty;
    } catch (error) {
      console.error('Error getting most early faculty:', error);
      throw error;
    }
  },

  // Get most late faculty for current date
  async getMostLateFaculty() {
    const date = new Date().toISOString().split('T')[0];
    
    try {
      const trackingRef = ref(database, dbRef(`attendance_tracking/${date}`));
      const snapshot = await get(trackingRef);
      
      if (!snapshot.exists()) {
        return null;
      }

      let latestFaculty = null;
      let maxMinutesDifference = 0;

      snapshot.forEach((child) => {
        const data = child.val();
        if (data.status === 'late' && data.minutesDifference > maxMinutesDifference) {
          maxMinutesDifference = data.minutesDifference;
          latestFaculty = data;
        }
      });

      return latestFaculty;
    } catch (error) {
      console.error('Error getting most late faculty:', error);
      throw error;
    }
  },

  // Get today's early/late counts
  async getTodayCounts() {
    const date = new Date().toISOString().split('T')[0];
    
    try {
      const trackingRef = ref(database, dbRef(`attendance_tracking/${date}`));
      const snapshot = await get(trackingRef);
      
      if (!snapshot.exists()) {
        return { early: 0, late: 0, total: 0 };
      }

      let earlyCounts = 0;
      let lateCounts = 0;

      snapshot.forEach((child) => {
        const data = child.val();
        if (data.status === 'early') {
          earlyCounts++;
        } else if (data.status === 'late') {
          lateCounts++;
        }
      });

      return {
        early: earlyCounts,
        late: lateCounts,
        total: earlyCounts + lateCounts
      };
    } catch (error) {
      console.error('Error getting today counts:', error);
      throw error;
    }
  }
};