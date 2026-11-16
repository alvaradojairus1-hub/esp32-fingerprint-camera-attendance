import { firebaseService } from './firebaseService';
import { 
    getDatabase, 
    ref, 
    set,
    get as firebaseGet,
    query,
    orderByKey,
    startAt,
    endAt,
    serverTimestamp 
} from 'firebase/database';

// Get database instance from firebaseService app
const db = getDatabase(firebaseService.app);

export const scheduleTrackingService = {
    /**
     * Saves an employee's daily schedule tracking data
     * @param {Object} data
     * @param {string} data.userId - Employee ID
     * @param {string} data.label - Status label (Early, Present, Late, etc.)
     * @param {string} data.color - Display color for the status
     * @param {string|null} data.checkInTime - Timestamp of check-in (if any)
     * @param {string} data.scheduleStart - Scheduled start time (e.g., "09:00")
     * @param {string} data.scheduleEnd - Scheduled end time (e.g., "17:00")
     */
    saveScheduleTracking: async (data) => {
        try {
            const now = new Date();
            const manilaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
            const dateKey = manilaDate.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
            
            // Create a reference path: scheduleTracking/YYYYMMDD/userId
            const trackingRef = ref(db, `scheduleTracking/${dateKey}/${data.userId}`);
            
            const trackingData = {
                userId: data.userId,
                label: data.label,
                color: data.color,
                scheduleStart: data.scheduleStart,
                scheduleEnd: data.scheduleEnd,
                checkInTime: data.checkInTime,
                timestamp: now.toISOString(),
                date: manilaDate.toISOString().slice(0, 10),
                createdAt: serverTimestamp()
            };

            console.log('[ScheduleTracking] Saving data:', {
                path: `scheduleTracking/${dateKey}/${data.userId}`,
                data: trackingData
            });

            await set(trackingRef, trackingData);

            // Verify data after save by fetching all tracking data for today
            const verifyRef = ref(db, `scheduleTracking/${dateKey}`);
            const verifySnapshot = await firebaseGet(verifyRef);
            const allTrackingData = verifySnapshot.exists() ? verifySnapshot.val() : null;
            console.log('[ScheduleTracking] Current tracking data for date:', {
                date: manilaDate.toISOString().slice(0, 10),
                allTracking: allTrackingData
            });
            return true;
        } catch (error) {
            console.error('[ScheduleTracking] Error saving tracking:', error);
            throw error;
        }
    },

    /**
     * Gets schedule tracking data for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     */
    getScheduleTrackingByDate: async (date) => {
        try {
            const dateKey = date.replace(/-/g, '');
            const trackingRef = ref(db, `scheduleTracking/${dateKey}`);
            const snapshot = await firebaseGet(trackingRef);
            return snapshot.exists() ? snapshot.val() : {};
        } catch (error) {
            console.error('[ScheduleTracking] Error fetching tracking:', error);
            throw error;
        }
    },

    /**
     * Gets schedule tracking data for a specific employee within a date range
     * @param {string} employeeId - Employee ID
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     */
    getEmployeeTrackingInRange: async (employeeId, startDate, endDate) => {
        try {
            const start = startDate.replace(/-/g, '');
            const end = endDate.replace(/-/g, '');
            
            const trackingRef = ref(db, 'scheduleTracking');
            const trackingQuery = query(
                trackingRef,
                orderByKey(),
                startAt(start),
                endAt(end)
            );
            
            const snapshot = await firebaseGet(trackingQuery);
            const employeeData = {};
            
            if (snapshot.exists()) {
                snapshot.forEach((dateSnapshot) => {
                    const dateData = dateSnapshot.val();
                    if (dateData[employeeId]) {
                        employeeData[dateSnapshot.key] = dateData[employeeId];
                    }
                });
            }

            return employeeData;
        } catch (error) {
            console.error('[ScheduleTracking] Error fetching employee tracking:', error);
            throw error;
        }
    }
};