import { collection, getDocs, doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION_NAME = 'attendance_statistics';

export const attendanceStatsService = {
    /**
     * Update attendance statistics for a faculty member
     * @param {string} facultyId - The faculty ID
     * @param {Object} data - Attendance data
     * @param {Date} checkInTime - Check-in time
     * @param {string} status - 'early' or 'late'
     * @param {number} minutesDifference - How many minutes early/late
     */
    async updateStats(facultyId, data, checkInTime, status, minutesDifference) {
        try {
            const statsRef = doc(db, COLLECTION_NAME, facultyId);
            
            const dateStr = checkInTime.toISOString().split('T')[0];
            const monthYear = dateStr.slice(0, 7); // YYYY-MM format
            
            // Create the update object
            const updateData = {
                facultyId,
                facultyName: data.name || data.fullName || 'Unknown',
                [`dates.${dateStr}`]: {
                    status,
                    minutesDifference,
                    timestamp: checkInTime.toISOString()
                },
                [`monthlyStats.${monthYear}.${status}`]: increment(1)
            };

            // Update the specific status counter
            if (status === 'early') {
                updateData.totalEarly = increment(1);
            } else if (status === 'late') {
                updateData.totalLate = increment(1);
            }

            // Try to update, if doc doesn't exist it will fail
            try {
                await updateDoc(statsRef, updateData);
            } catch (e) {
                // If doc doesn't exist, create it with initial data
                await setDoc(statsRef, {
                    ...updateData,
                    totalEarly: status === 'early' ? 1 : 0,
                    totalLate: status === 'late' ? 1 : 0,
                    dates: {
                        [dateStr]: {
                            status,
                            minutesDifference,
                            timestamp: checkInTime.toISOString()
                        }
                    },
                    monthlyStats: {
                        [monthYear]: {
                            early: status === 'early' ? 1 : 0,
                            late: status === 'late' ? 1 : 0
                        }
                    }
                });
            }

            console.log('Successfully updated attendance stats:', {
                facultyId,
                status,
                date: dateStr,
                minutesDifference
            });
        } catch (error) {
            console.error('Error updating attendance stats:', error);
            throw error;
        }
    },

    /**
     * Get attendance statistics for all faculty
     * @returns {Promise<Array>} Array of faculty statistics
     */
    async getAllStats() {
        try {
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting attendance stats:', error);
            throw error;
        }
    }
};
