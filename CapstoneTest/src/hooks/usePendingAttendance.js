import { useEffect, useRef } from 'react';
import { ref, get, set, remove, onDisconnect } from 'firebase/database';
import { database, dbRef } from '../firebase';
import useAuth from '../contexts/authcontext';
import { firebaseService } from '../services/firebaseService';

/**
 * Real-time HR presence & pendingAttendance merger
 * - Marks HR online under /presence/hr/{uid}
 * - Every 15s, only the *oldest connected HR* runs processPendingAttendance()
 * - Increased from 2s to reduce excessive Firebase calls and database growth
 */
let __pendingAttendanceStarted = false; // module-level guard to prevent multiple pollers

export function usePendingAttendance() {
  const { user } = useAuth();
  const isLeaderRef = useRef(false);
  const intervalRef = useRef(null);
  const presenceRef = useRef(null);

  useEffect(() => {
    if (!user || (user.role || '').toLowerCase() !== 'hr') return;

    const presencePath = `presence/hr/${user.uid}`;
    const presenceNode = ref(database, dbRef(presencePath));

    const setupPresence = async () => {
      try {
        // mark HR online
  await set(presenceNode, { uid: user.uid, email: user.email, ts: Date.now() });

  // remember reference for cleanup
  presenceRef.current = presenceNode;

  // auto-remove when disconnected
  onDisconnect(presenceNode).remove();

        // determine leader HR (oldest connection)
        const listRef = ref(database, dbRef('presence/hr'));
        const snap = await get(listRef);
        const hrs = snap.exists() ? snap.val() : {};
        const sorted = Object.entries(hrs).sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
        const leaderUid = sorted.length > 0 ? sorted[0][0] : user.uid;
        const isLeader = leaderUid === user.uid;

        isLeaderRef.current = isLeader;
        console.log(`[AutoSync] ${user.email} is ${isLeader ? 'Leader HR (active)' : 'Secondary HR'}`);

        if (isLeader) startPolling();
      } catch (err) {
        console.error('[AutoSync] setupPresence error:', err);
      }
    };

    const startPolling = () => {
      // Only start one poller per module (avoid duplicate intervals when hook mounted multiple times)
      if (__pendingAttendanceStarted) return;
      __pendingAttendanceStarted = true;

      if (intervalRef.current) clearInterval(intervalRef.current);

      // guard to avoid overlapping process runs when processing is slow
      let isProcessing = false;

      intervalRef.current = setInterval(async () => {
        try {
          if (isProcessing) {
            // skip this tick if previous processing is still running
            // (keeps the 2s cadence but avoids concurrent runs)
            console.log('[AutoSync] Processing in progress, skipping this tick');
            return;
          }

          try {
            isProcessing = true;
            const listRef = ref(database, dbRef('presence/hr'));
            const snap = await get(listRef);
            const hrs = snap.exists() ? snap.val() : {};
            const sorted = Object.entries(hrs).sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
            const leaderUid = sorted.length > 0 ? sorted[0][0] : user.uid;

            if (leaderUid !== user.uid) {
              if (isLeaderRef.current) {
                console.log(`[AutoSync] ${user.email} lost leadership`);
                isLeaderRef.current = false;
              }
              return;
            }

            if (!isLeaderRef.current) {
              console.log(`[AutoSync] ${user.email} regained leadership`);
              isLeaderRef.current = true;
            }

            console.log('[AutoSync] Running processPendingAttendance()...');
            await firebaseService.processPendingAttendance();
          } catch (processingError) {
            console.error('[AutoSync] Processing error:', processingError);
            throw processingError; // Re-throw to be caught by outer catch
          }
        } catch (err) {
          console.error('[AutoSync] polling error:', err);
        } finally {
          isProcessing = false;
        }
      }, 15000);  // 15 seconds - increased from 2s to reduce excessive polling and Firebase calls
    };

    setupPresence();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      __pendingAttendanceStarted = false;
      if (presenceRef.current) {
        try { onDisconnect(presenceRef.current).cancel(); } catch(e) {}
        try { remove(presenceRef.current); } catch(e) {}
      }
    };
  }, [user]);
}
