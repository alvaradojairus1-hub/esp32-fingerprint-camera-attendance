/**
 * Lightweight verification script for staging upload.
 * Usage (PowerShell):
 *   $env:SERVICE_ACCOUNT_PATH='C:\path\to\serviceAccountKey.json';
 *   $env:DATABASE_URL='https://<YOUR_DB>.firebaseio.com';
 *   node .\scripts\verify-staging.js --target=/staging
 *
 * This script connects with the Admin SDK and prints counts and samples for:
 *  - users
 *  - attendance (total entries)
 *  - leaveRequests (total requests)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = require('minimist')(process.argv.slice(2));
const TARGET_PATH = args.target || '/staging';
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'serviceAccountKey.json');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Please set DATABASE_URL env var to your RTDB URL.');
  process.exit(2);
}

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account key not found at', SERVICE_ACCOUNT_PATH);
  process.exit(2);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const db = admin.database();

function countAttendanceEntries(attVal) {
  if (!attVal) return 0;
  // If top-level keys are years -> nested structure
  const topKeys = Object.keys(attVal || {});
  const looksLikeYear = topKeys.length > 0 && topKeys.every(k => /^\d{4}$/.test(k));
  let count = 0;
  if (looksLikeYear) {
    for (const y of Object.keys(attVal)) {
      const months = attVal[y] || {};
      for (const m of Object.keys(months)) {
        const days = months[m] || {};
        for (const d of Object.keys(days)) {
          const times = days[d] || {};
          count += Object.keys(times).length;
        }
      }
    }
  } else {
    // legacy: attendance/{date}/{time}
    for (const dateKey of Object.keys(attVal)) {
      const times = attVal[dateKey] || {};
      count += Object.keys(times).length;
    }
  }
  return count;
}

async function main() {
  try {
    console.log('Inspecting target path:', TARGET_PATH);
    const snap = await db.ref(TARGET_PATH).once('value');
    if (!snap.exists()) {
      console.warn('No data found at', TARGET_PATH);
      process.exit(0);
    }

    const data = snap.val();

    // Users
    const users = data.users || {};
    const usersCount = Array.isArray(users) ? users.length : Object.keys(users || {}).length;
    console.log('Users count:', usersCount);
    if (usersCount > 0) {
      const sampleKeys = Array.isArray(users) ? users.slice(0,3).map(u => u.userId || u.id || u.facultyId) : Object.keys(users).slice(0,3);
      console.log('User sample keys:', sampleKeys.join(', '));
    }

    // Attendance
    const attendance = data.attendance || {};
    const attendanceCount = countAttendanceEntries(attendance);
    console.log('Attendance entries count:', attendanceCount);

    // Leave requests
    const lr = data.leaveRequests || {};
    let leaveCount = 0;
    for (const [fid, reqs] of Object.entries(lr || {})) {
      if (!reqs) continue;
      leaveCount += Object.keys(reqs).length;
    }
    console.log('Leave requests total:', leaveCount);

    // Print basic health summary
    console.log('Top-level keys:', Object.keys(data).join(', '));

    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
