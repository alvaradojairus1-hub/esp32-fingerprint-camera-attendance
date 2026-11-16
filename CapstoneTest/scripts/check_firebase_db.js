#!/usr/bin/env node
/*
  scripts/check_firebase_db.js

  Usage:
    - Set environment variable GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path
      OR pass the path as the first argument:

      node scripts/check_firebase_db.js /path/to/serviceAccountKey.json

  The script connects with firebase-admin and prints:
    - Connection test
    - lastAttendanceReset
    - Top-level attendance keys and a small sample count
    - Last 20 auditLogs entries

*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadServiceAccount() {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return require(path.resolve(arg));
  const env = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (env && fs.existsSync(env)) return require(path.resolve(env));
  console.error('Service account JSON not found. Set GOOGLE_APPLICATION_CREDENTIALS or pass path as first arg.');
  process.exit(2);
}

async function main() {
  try {
    const sa = loadServiceAccount();
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        databaseURL: sa.databaseURL || 'https://capstone-d5b64-default-rtdb.asia-southeast1.firebasedatabase.app'
      });
    }

    const db = admin.database();

    console.log('Connected to Firebase project:', admin.instanceId ? admin.instanceId() : '(unknown)');

    // lastAttendanceReset
    const lastResetSnap = await db.ref('/lastAttendanceReset').once('value');
    console.log('\nlastAttendanceReset:');
    console.log(lastResetSnap.exists() ? lastResetSnap.val() : '(missing)');

    // attendance overview: top-level keys
    const attendanceSnap = await db.ref('/attendance').once('value');
    if (!attendanceSnap.exists()) {
      console.log('\nattendance: (no node)');
    } else {
      const att = attendanceSnap.val();
      const topKeys = Object.keys(att || {});
      console.log('\nattendance top-level keys count:', topKeys.length);
      console.log('sample keys:', topKeys.slice(0, 10));

      // If year-formatted keys, sample a day
      const looksLikeYear = topKeys.length > 0 && topKeys.every(k => /^\d{4}$/.test(k));
      if (looksLikeYear) {
        const sampleYear = topKeys[0];
        const months = Object.keys(att[sampleYear] || {});
        console.log('sample year:', sampleYear, 'months:', months.slice(0,5));
        if (months.length > 0) {
          const sampleMonth = months[0];
          const days = Object.keys(att[sampleYear][sampleMonth] || {});
          console.log('sample month:', sampleMonth, 'days:', days.slice(0,5));
          if (days.length > 0) {
            const sampleDay = days[0];
            const times = Object.keys(att[sampleYear][sampleMonth][sampleDay] || {});
            console.log(`sample entries for ${sampleYear}/${sampleMonth}/${sampleDay}:`, times.slice(0,10));
          }
        }
      } else {
        const sampleDates = topKeys.slice(0,5);
        sampleDates.forEach(d => {
          const times = Object.keys(att[d] || {}).slice(0,10);
          console.log(`sample entries for ${d}:`, times);
        });
      }
    }

    // auditLogs: last 20 entries
    const auditSnap = await db.ref('/auditLogs').orderByChild('timestamp').limitToLast(20).once('value');
    console.log('\nLast auditLogs (up to 20):');
    if (!auditSnap.exists()) console.log('(none)');
    else {
      const a = auditSnap.val();
      const entries = Object.entries(a || {}).map(([k,v]) => ({ id: k, ...v }));
      entries.sort((x,y) => (x.timestamp||0) - (y.timestamp||0));
      entries.forEach(e => {
        const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '(no-ts)';
        console.log(ts, e.action || '(no-action)', e.status || '', e.userId ? `user:${e.userId}` : '', e.facultyId ? `faculty:${e.facultyId}` : '', e.error ? `ERR:${e.error}` : '');
      });
    }

    // pendingAttendance node check (presence)
    const pendingSnap = await db.ref('/pendingAttendance').once('value');
    console.log('\npendingAttendance exists:', pendingSnap.exists());

    // Check attendance counts for today and the last 6 days
    const now = new Date();
    console.log('\nAttendance counts for the last 7 days (local dates):');
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const path = `/attendance/${y}/${m}/${day}`;
      try {
        const snap = await db.ref(path).once('value');
        const exists = snap.exists();
        const count = exists ? Object.keys(snap.val() || {}).length : 0;
        console.log(`${d.toISOString().split('T')[0]} -> ${count} entries (path: ${path})`);
      } catch (e) {
        console.log(`${d.toISOString().split('T')[0]} -> error reading path ${path}:`, e.message || e);
      }
    }

    console.log('\nDiagnostic check completed.');
    process.exit(0);

  } catch (err) {
    console.error('Error during diagnostics:', err && err.stack ? err.stack : err);
    process.exit(3);
  }
}

main();
