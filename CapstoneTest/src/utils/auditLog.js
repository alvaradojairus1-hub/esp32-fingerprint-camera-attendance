import { database, dbRef } from '../firebase';
import { ref, push } from 'firebase/database';

export function logAuditAction({ userId, action, details }) {
  const logRef = ref(database, dbRef('auditLogs'));
  const logEntry = {
    userId,
    action,
    details,
    timestamp: Date.now(),
  };
  return push(logRef, logEntry);
}