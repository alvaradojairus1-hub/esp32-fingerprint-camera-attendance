const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'capstone-d5b64-redesigned-updated.json');

function normalizeStatus(raw) {
  if (!raw) return '';
  const r = String(raw).toLowerCase().trim();
  if (['present', 'on time', 'ontime'].includes(r)) return 'present';
  if (['late', 'tardy'].includes(r)) return 'late';
  if (['on_leave', 'on leave', 'leave', 'onleave'].includes(r)) return 'on leave';
  if (r === 'absent') return 'absent';
  return r;
}

function loadJson() {
  const raw = fs.readFileSync(FILE, 'utf8');
  return JSON.parse(raw);
}

function collectAttendance(attendanceNode) {
  const out = [];
  if (!attendanceNode) return out;
  // supports nested year/month/day/time or legacy date/time
  const topKeys = Object.keys(attendanceNode || {});
  const looksLikeYear = topKeys.length > 0 && topKeys.every(k => /^\d{4}$/.test(k));
  if (looksLikeYear) {
    for (const y of topKeys) {
      for (const m of Object.keys(attendanceNode[y] || {})) {
        for (const d of Object.keys(attendanceNode[y][m] || {})) {
          const times = attendanceNode[y][m][d] || {};
          for (const t of Object.keys(times)) {
            const rec = times[t] || {};
            out.push({ date: `${y}-${m}-${d}`, time: t, userId: rec.userId, facultyId: rec.facultyId, status: normalizeStatus(rec.status) });
          }
        }
      }
    }
  } else {
    for (const [date, times] of Object.entries(attendanceNode || {})) {
      for (const [t, rec] of Object.entries(times || {})) {
        out.push({ date, time: t, userId: rec.userId, facultyId: rec.facultyId, status: normalizeStatus(rec.status) });
      }
    }
  }
  return out;
}

function collectLeaves(leavesNode) {
  const out = [];
  if (!leavesNode) return out;
  for (const [topKey, topVal] of Object.entries(leavesNode || {})) {
    if (!topVal) continue;
    if (typeof topVal === 'object' && !Array.isArray(topVal)) {
      const innerVals = Object.values(topVal || {});
      const looksLikeRequests = innerVals.length > 0 && innerVals.every(v => v && typeof v === 'object');
      if (looksLikeRequests) {
        const facultyId = topKey;
        for (const [id, r] of Object.entries(topVal || {})) {
          out.push({ id, facultyId, ...(r || {}) });
        }
        continue;
      }
      // flat shape
      const requestId = topKey;
      const r = topVal;
      out.push({ id: requestId, facultyId: (r && (r.facultyId || r.userId)) || '', ...(r || {}) });
      continue;
    }
  }
  return out;
}

function isOnLeaveTodayFromLeaves(leaves) {
  const today = new Date().toISOString().slice(0,10);
  const set = new Set();
  for (const l of leaves) {
    if (!l) continue;
    if ((l.status || '').toLowerCase() !== 'approved') continue;
    const start = (l.startDate || (l.createdAt ? l.createdAt : null));
    const end = (l.endDate || start);
    if (!start) continue;
    const s = start.toString().slice(0,10);
    const e = end.toString().slice(0,10);
    if (s <= today && today <= e) set.add(l.facultyId || l.userId || l.id || '');
  }
  return set;
}

function run() {
  const json = loadJson();
  const attendance = collectAttendance(json.attendance);
  const leaves = collectLeaves(json.leaveRequests);

  const onLeaveFromLeaves = isOnLeaveTodayFromLeaves(leaves);
  const present = attendance.filter(a => a.status === 'present');
  const onLeaveFromAttendance = attendance.filter(a => a.status === 'on leave');

  console.log('Attendance records total:', attendance.length);
  console.log('Present records total:', present.length);
  console.log('Attendance-marked on leave records total:', onLeaveFromAttendance.length);
  console.log('Approved leave requests that include today:', Array.from(onLeaveFromLeaves));

  // Build simple counts: unique users present vs on-leave
  const presentUsers = new Set(present.map(p => String(p.facultyId || p.userId || '')));
  const attendanceLeaveUsers = new Set(onLeaveFromAttendance.map(p => String(p.facultyId || p.userId || '')));

  const combinedOnLeave = new Set([...attendanceLeaveUsers]);
  for (const fid of onLeaveFromLeaves) {
    combinedOnLeave.add(String(fid));
  }

  console.log('Unique present users:', Array.from(presentUsers));
  console.log('Unique on-leave users (combined):', Array.from(combinedOnLeave));
  console.log('Counts -> present:', presentUsers.size, 'onLeave:', combinedOnLeave.size);
}

// Simulate HRDashboard employee status computation using the JSON data
function simulateHRDashboard() {
  const json = loadJson();
  const users = json.users || {};
  const attendance = collectAttendance(json.attendance).map(a => ({ ...a, status: normalizeStatus(a.status) }));
  const leaves = collectLeaves(json.leaveRequests).map(l => ({ ...l, status: (l.status || '').toString().toLowerCase() }));

  const today = new Date().toISOString().slice(0,10);

  // Build leave set
  const isOnLeaveToday = new Set();
  leaves.forEach(lr => {
    if (!lr || lr.status !== 'approved') return;
    const start = lr.startDate || (lr.createdAt ? lr.createdAt.toString().slice(0,10) : null);
    const end = lr.endDate || start;
    if (!start) return;
    if (start <= today && today <= end) {
      const keys = [lr.facultyId, lr.userId, lr.id].filter(Boolean).map(String);
      keys.forEach(k => isOnLeaveToday.add(k));
    }
  });

  // Build user list excluding HR
  const emps = Object.values(users).filter(u => (u.role || '').toString().toLowerCase() !== 'hr');

  const employees = emps.map(u => {
    const keys = [u.facultyId, u.userId, u.id].filter(Boolean).map(String);
    // find latest attendance record for these keys
    const userAttendance = attendance.filter(a => keys.includes(String(a.userId)) || keys.includes(String(a.facultyId)));
    let latest = null;
    if (userAttendance.length) {
      latest = userAttendance.reduce((a,b) => (new Date(a.timestamp || `${a.date}T${a.time || '00:00:00'}`) > new Date(b.timestamp || `${b.date}T${b.time || '00:00:00'}`) ? a : b));
    }
    const baseStatus = latest ? latest.status : 'Unknown';
    const finalStatus = keys.some(k => isOnLeaveToday.has(String(k))) ? 'on leave' : baseStatus;
    return { id: u.facultyId || u.userId || '', name: u.name, status: finalStatus };
  });

  const present = employees.filter(e => (e.status || '').toLowerCase() === 'present').length;
  const late = employees.filter(e => (e.status || '').toLowerCase() === 'late').length;
  const onleave = employees.filter(e => (e.status || '').toLowerCase() === 'on leave').length;

  console.log('\n[HR Dashboard Simulation]');
  console.log('Employees considered:', employees.map(e => `${e.id}:${e.status}`).join(', '));
  console.log('Counts -> present:', present, 'late:', late, 'on leave:', onleave);
}

// Run simulation as well
simulateHRDashboard();

run();
