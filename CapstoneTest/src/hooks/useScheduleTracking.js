import { useEffect, useState, useCallback } from 'react';
import { scheduleTrackingService } from '../services/scheduleTrackingService';

export const useScheduleTracking = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Save status tracking data
    const saveTracking = useCallback(async (statusData) => {
        if (!statusData || !statusData.userId) return;

        try {
            setLoading(true);
            
            // Save tracking data with enhanced status information
            await scheduleTrackingService.saveScheduleTracking({
                userId: statusData.userId,
                label: statusData.label,
                color: statusData.color,
                checkInTime: statusData.checkInTime,
                scheduleStart: statusData.scheduleStart,
                scheduleEnd: statusData.scheduleEnd
            });
        } catch (error) {
            console.error('[ScheduleTracking] Failed to save tracking:', error);
            setError(error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        saveTracking,
        getTrackingByDate: scheduleTrackingService.getScheduleTrackingByDate,
        getEmployeeTrackingRange: scheduleTrackingService.getEmployeeTrackingInRange
    };
};