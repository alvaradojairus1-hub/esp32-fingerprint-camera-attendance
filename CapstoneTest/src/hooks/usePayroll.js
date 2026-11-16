import { useState, useEffect } from 'react';
import { firebaseService } from '../services/firebaseService';

export const usePayroll = () => {
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await firebaseService.getPayroll();
        if (!mounted) return;
        setPayroll(data || []);
        setLoading(false);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load payroll');
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  return { payroll, loading, error };
};
