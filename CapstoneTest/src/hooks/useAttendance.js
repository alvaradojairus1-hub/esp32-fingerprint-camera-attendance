import { useState, useEffect } from 'react';
import { firebaseService } from '../services/firebaseService';
import { normalizeAttendanceForUI } from '../utils/attendanceUtils';

export const useAttendance = () => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = firebaseService.onFlattenedAttendanceUpdate((list) => {
      // Normalize records so consumers always receive canonical status tokens
      try {
        const normalized = (list || []).map(r => normalizeAttendanceForUI(r));
        setAttendance(normalized);
      } catch (e) {
        // If normalization fails, fallback to raw list
        setAttendance(list || []);
      }
      setLoading(false);
      setError(null);
    });

    return () => {
      try { unsub && unsub(); } catch (e) { /* ignore */ }
    };
  }, []);

  return { attendance, loading, error };
};
