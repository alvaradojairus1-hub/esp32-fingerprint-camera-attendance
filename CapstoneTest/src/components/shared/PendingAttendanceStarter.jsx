import React from 'react';
import { usePendingAttendance } from '../../hooks/usePendingAttendance';

// Lightweight component that invokes the pending-attendance hook while mounted.
// The hook itself checks the signed-in user's role and will no-op for non-HR users.
export default function PendingAttendanceStarter() {
  // Call the hook unconditionally so React hook rules are satisfied. The hook
  // performs its own checks (user role, leadership) and will exit early when
  // it shouldn't run.
  usePendingAttendance();
  return null;
}
