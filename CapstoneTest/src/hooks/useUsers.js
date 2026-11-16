import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database, dbRef } from '../firebase';

export const useUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
  const usersRef = ref(database, dbRef('users'));
    const unsubscribe = onValue(
      usersRef,
      (snapshot) => {
        try {
          const data = snapshot.val();
          if (data) {
            // Convert object to array if needed
            const usersArray = Array.isArray(data) ? data : Object.values(data);
            setUsers(usersArray);
          } else {
            setUsers([]);
          }
          setLoading(false);
          setError(null);
        } catch (err) {
          setError(err.message);
          setLoading(false);
        }
      },
      (error) => {
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { users, loading, error };
};
