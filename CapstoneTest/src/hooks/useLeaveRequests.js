import { useState, useEffect } from 'react';
import { firebaseService } from '../services/firebaseService';

export const useLeaveRequests = () => {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = firebaseService.onLeaveRequestsUpdate((list) => {
      try {
        const normalized = (list || []).map(lr => {
          if (!lr || typeof lr !== 'object') return lr;
          const facultyId = lr.facultyId || lr.userId || lr.faculty_id || lr.id || '';
          const raw = (lr.status || '').toString().toLowerCase().trim();
          const status = raw === 'on_leave' ? 'on leave' : raw;
          return { ...lr, facultyId: facultyId ? String(facultyId) : '', status };
        });
        setLeaveRequests(normalized);
      } catch (e) {
        setLeaveRequests(list || []);
      }
      setLoading(false);
      setError(null);
    });
    return () => { try { unsub && unsub(); } catch (e) {} };
  }, []);

  return { leaveRequests, loading, error };
};
