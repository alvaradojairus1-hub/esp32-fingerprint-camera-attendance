const functions = require('firebase-functions');
const admin = require('firebase-admin');

try { admin.app(); } catch (e) { admin.initializeApp(); }

const GRACE_MINUTES = 15;

// Helper: convert HH:MM to minutes since midnight
function timeStrToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const parts = t.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

// Create daily placeholders for every non-HR user at midnight Asia/Manila
exports.initializeDailyAttendance = functions
  .region('asia-southeast1')
  .pubsub.schedule('0 0 * * *')
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    const db = admin.database();
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;

    try {
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.exists() ? usersSnap.val() : {};

      const updates = {};
      for (const [k, user] of Object.entries(users || {})) {
        try {
          const role = (user && user.role) ? String(user.role).toLowerCase() : '';
          if (role === 'hr') continue; // skip HR users

          const uid = k;
          const nodePath = `dailyAttendance/${dateKey}/${uid}`;

          // fetch schedule for this user (if present)
          const schedSnap = await db.ref(`schedules/${uid}`).once('value');
          const sched = schedSnap.exists() ? schedSnap.val() : null;

          let startTime = null;
          let endTime = null;
          if (sched && sched.schedule) {
            const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
            const day = dayNames[today.getDay()];
            const daySched = sched.schedule && sched.schedule[day];
            if (daySched && daySched.startTime && daySched.endTime) {
              startTime = daySched.startTime;
              endTime = daySched.endTime;
            }
          }

          updates[`${nodePath}`] = {
            status: 'no_status',
            scheduleStart: startTime || null,
            scheduleEnd: endTime || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        } catch (e) { /* per-user skip on error */ }
      }

      if (Object.keys(updates).length) {
        await db.ref().update(updates);
      }
      console.log(`[initializeDailyAttendance] created placeholders for ${Object.keys(updates).length} users on ${dateKey}`);
      return { success: true, created: Object.keys(updates).length };
    } catch (err) {
      console.error('initializeDailyAttendance error', err);
      return { success: false, error: String(err) };
    }
  });

// Processor: runs frequently to promote no_status -> late -> absent based on current time and schedule
exports.processDailyAttendance = functions
  .region('asia-southeast1')
  .pubsub.schedule('*/5 * * * *')
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    const db = admin.database();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;

    try {
      const dailySnap = await db.ref(`dailyAttendance/${dateKey}`).once('value');
      if (!dailySnap.exists()) return { processed: 0 };
      const daily = dailySnap.val();

      let processed = 0;

      for (const [uid, node] of Object.entries(daily || {})) {
        try {
          const curStatus = (node && node.status) ? String(node.status) : '';
          const start = node && node.scheduleStart ? timeStrToMinutes(node.scheduleStart) : null;
          const end = node && node.scheduleEnd ? timeStrToMinutes(node.scheduleEnd) : null;

          // if user already checked in today, sync status from attendance and skip
          // Check attendance entries for today
          const attendanceDayRef = db.ref(`attendance/${y}/${m}/${d}`);
          const daySnap = await attendanceDayRef.once('value');
          const dayVal = daySnap.exists() ? daySnap.val() : {};
          const hasCheckIn = Object.values(dayVal || {}).some(r => {
            try {
              const rid = r || {};
              const uidMatch = String(rid.userId || rid.facultyId || '') === String(uid) || String(rid.userId || '') === String(node.userId || '');
              const typ = (rid.type || '').toString().toLowerCase();
              return uidMatch && (typ === 'check_in' || typ === 'in');
            } catch (e) { return false; }
          });

          if (hasCheckIn) {
            // if a real check-in exists, mark dailyAttendance as 'checked_in'
            if (curStatus !== 'checked_in') {
              await db.ref(`dailyAttendance/${dateKey}/${uid}`).update({ status: 'checked_in', updatedAt: new Date().toISOString() });
              processed++;
            }
            continue;
          }

          // Determine minutes now in Manila
          const nowManila = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
          const nowParts = new Date(nowManila);
          const nowMinutes = nowParts.getHours() * 60 + nowParts.getMinutes();

          // Transition rules
          if ((curStatus === 'no_status' || !curStatus) && start !== null && nowMinutes > (start + GRACE_MINUTES)) {
            // mark as late
            await db.ref(`dailyAttendance/${dateKey}/${uid}`).update({ status: 'late', updatedAt: new Date().toISOString(), markedAt: new Date().toISOString() });
            processed++;
            continue;
          }

          if ((curStatus === 'no_status' || curStatus === 'late' || !curStatus) && end !== null && nowMinutes >= end) {
            // mark absent if still no check-in by end of shift
            await db.ref(`dailyAttendance/${dateKey}/${uid}`).update({ status: 'absent', updatedAt: new Date().toISOString(), markedAt: new Date().toISOString() });
            processed++;
            continue;
          }
        } catch (e) {
          // per-user errors shouldn't stop the loop
          console.warn('processDailyAttendance per-user error', e);
        }
      }

      return { processed };
    } catch (err) {
      console.error('processDailyAttendance error', err);
      return { success: false, error: String(err) };
    }
  });
