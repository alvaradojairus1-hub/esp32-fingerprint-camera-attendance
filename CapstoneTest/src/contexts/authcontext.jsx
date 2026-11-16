import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { auth, app, database } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  getAuth, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { ref, get, set } from 'firebase/database';
import { firebaseService } from '../services/firebaseService';
import { authService } from '../services/authService';
import PendingAttendanceStarter from '../components/shared/PendingAttendanceStarter';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const users = await firebaseService.getUsers();
          const username = u.email.split('@')[0];
          let found = null;
          if (Array.isArray(users)) {
            found = users.find(x => x && (x.email === u.email || x.facultyId === username));
          }
          if (found) {
            const role = (found.role || 'employee').toLowerCase();
            setUser({
              uid: u.uid,
              email: u.email,
              role,
              id: found.facultyId || found.id,
              name: found.name,
              department: found.department,
              userId: found.userId
            });
          } else {
            const username = u.email.split('@')[0];
            const isHR = u.email === "briones@dhvsu.edu.ph";
            setUser({
              uid: u.uid,
              email: u.email,
              role: isHR ? 'hr' : 'employee',
              id: username,
              name: username,
              department: isHR ? 'Human Resources' : 'Unknown'
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          const username = u.email.split('@')[0];
          setUser({
            uid: u.uid,
            email: u.email,
            role: 'employee',
            id: username,
            name: username,
            department: 'Unknown'
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 🔹 Login existing user
  const login = async (email, password, remember = true) => {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  // 🔹 Logout
  const logout = () => signOut(auth);

   // 🔹 Register new user via authService
  const registerUser = async (userData) => {
    try {
      const result = await authService.registerUser(userData);
      console.log("✅ Registration successful:", result);
      return result;
    } catch (error) {
      console.error("❌ Registration failed in context:", error);
      throw error;
    }
  };

  // 🔹 Reset password
  const resetPassword = async (email) => {
    try {
      return await authService.resetPassword(email);
    } catch (error) {
      console.error('Password reset failed:', error);
      throw error;
    }
  };

  // 🔹 Change password
  const changePassword = async (currentPassword, newPassword) => {
    try {
      return await authService.changePassword(currentPassword, newPassword);
    } catch (error) {
      console.error('Password change failed:', error);
      throw error;
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      registerUser,
      resetPassword,
      changePassword,
    }),
    [user, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Start the pending-attendance processor while the app is mounted. The
          hook inside PendingAttendanceStarter will check the user's role and
          only start the 2s processing loop for the first HR client. */}
      <PendingAttendanceStarter />
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);
export default useAuth;
