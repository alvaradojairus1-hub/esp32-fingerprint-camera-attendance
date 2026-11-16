// src/services/firebaseService.js
import { database, dbRef } from '../firebase';
import { ref, get, set, remove, onValue, update, push } from 'firebase/database';
import { pairAttendanceRecords } from '../utils/attendanceUtils';
import { computeHourlyEarnings } from './hourlyCalculator';
import { normalizeEmployeeType } from '../utils/employeeTypeNormalizer';

/**
 * Fetch all user records from Firebase.
 */
async function getUsers() {
  const snapshot = await get(ref(database, dbRef('users')));
  if (!snapshot.exists()) return [];
  const val = snapshot.val();

  return Object.entries(val).map(([key, user]) => ({
    id: key,
    ...user,
  }));
}

/**
 * Fetch all pending attendance records from Firebase.
 */
async function getPendingAttendance() {
  const snapshot = await get(ref(database, dbRef('pendingAttendance')));
  if (!snapshot.exists()) return [];

  const val = snapshot.val();
  const pendingEntries = [];

  const traverse = (node, path = []) => {
    Object.entries(node).forEach(([key, value]) => {
      // If the value looks like a pending attendance record (has userId/facultyId/fingerprintId/timestamp/type/status),
      // treat it as a leaf and push it. Otherwise recurse deeper.
      const isRecordLike = value && typeof value === 'object' && (
        value.userId !== undefined || value.facultyId !== undefined || value.fingerprintId !== undefined || value.timestamp !== undefined || value.type !== undefined || value.status !== undefined
      );

      if (isRecordLike) {
        const [year, month, day, time] = path;
        pendingEntries.push({ year, month, day, time: key, ...value });
      } else if (value && typeof value === 'object') {
        traverse(value, [...path, key]);
      }
    });
  };

  traverse(val);
  return pendingEntries;
}

/**
 * Write a log entry to Firebase auditLogs node.
 */
async function writeAuditLog(entry) {
  try {
    const nodeRef = ref(database, dbRef(`auditLogs/${Date.now()}`));
    await set(nodeRef, {
      ...entry,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('writeAuditLog failed', err);
  }
}

/**
 * Process pending attendance entries and save them in year/month/day/time structure.
 * Deletes all pendingAttendance entries after processing.
 */
async function processPendingAttendance() {
  try {
    const [pendingAttendance, users] = await Promise.all([
      getPendingAttendance(),
      getUsers(),
    ]);

    if (!pendingAttendance || pendingAttendance.length === 0) return [];

    const processed = [];
    const processedKeys = new Set(); // prevent duplicates within this run

    for (const entry of pendingAttendance) {
      const { year, month, day, time, fingerprintId, type, status, timestamp, userId, facultyId } = entry;
      // Build a best-effort uniqueKey using available fields
      const uniqueKey = `${year || 'yr'}-${month || 'mo'}-${day || 'dd'}-${time || 'tt'}-${String(fingerprintId || userId || facultyId || '')}`;
      if (processedKeys.has(uniqueKey)) {
        console.log(`[AutoSync] Skipping duplicate key ${uniqueKey}`);
        continue;
      }
      processedKeys.add(uniqueKey);

      // Resolve user: prefer explicit userId/facultyId in pending entry, fallback to fingerprint matching
      let matchedUser = null;
      try {
        // First try to match by comparing userId with last number in fingerprintId
        const uidStr = userId ? String(userId) : null;
        const fidStr = facultyId ? String(facultyId) : null;

        if (uidStr || fidStr) {
          matchedUser = users.find(u => {
            try {
              // Extract numbers from fingerprint IDs
              const fp1 = u.fingerprintId1 ? String(u.fingerprintId1).split('_')[2] : null;
              const fp2 = u.fingerprintId2 ? String(u.fingerprintId2).split('_')[2] : null;
              const fp3 = u.fingerprintId3 ? String(u.fingerprintId3).split('_')[2] : null;
              const fp4 = u.fingerprintId4 ? String(u.fingerprintId4).split('_')[2] : null;

              // Compare userId with fingerprint numbers
              if (uidStr) {
                return [fp1, fp2, fp3, fp4].includes(uidStr);
              }
              // Fallback to facultyId comparison
              if (fidStr) {
                return [fp1, fp2, fp3, fp4].includes(fidStr);
              }
              return false;
            } catch (e) { return false; }
          });
        }

        // If no match found by fingerprint, fall back to original userId matching strategy
        if (!matchedUser && uidStr) {
          // Primary strategy: if pending.userId is present, check the users/{userId} node
          // and compare its internal `userId` field. Only accept this as a match when
          // users/{pending.userId}.userId === pending.userId (strict equality) — this
          // enforces the mapping you requested.
          if (uidStr) {
            try {
              const directSnap = await get(ref(database, dbRef(`users/${uidStr}`)));
              if (directSnap.exists()) {
                const directUser = directSnap.val();
                const nodeUserId = directUser && directUser.userId !== undefined ? String(directUser.userId) : null;
                // If the users/{userId} node's internal userId matches the pending.userId value,
                // treat this as a confirmed match and use the node as matchedUser.
                if (nodeUserId && nodeUserId === uidStr) {
                  matchedUser = { id: String(uidStr), ...(directUser || {}) };
                } else {
                  // If they don't match, record an audit entry for investigation but do not
                  // immediately accept this node as the matched user.
                    // Skip writing an audit log here to avoid creating excessive records in the DB.
                }
              }
            } catch (e) {
              // ignore direct fetch errors and fall back to scanning the users array
            }
          }

          // If we didn't get a strict node match, fall back to scanning the cached users array
          // and match by the user's internal `userId` field (this covers cases where pending.userId
          // contains the internal id but not the node key).
          if (!matchedUser && uidStr) {
            try {
              matchedUser = users.find(u => {
                try {
                  if (u && u.userId !== undefined && String(u.userId) === uidStr) return true;
                  if (u && u.id !== undefined && String(u.id) === uidStr) return true;
                  return false;
                } catch (e) { return false; }
              });
            } catch (e) {
              // ignore
            }
          }

          // fallback: try matching by facultyId or other id fields in the cached users array
          if (!matchedUser && fidStr) {
            matchedUser = users.find(u => {
              try {
                if (fidStr && (String(u.facultyId) === fidStr || String(u.id) === fidStr)) return true;
                return false;
              } catch (e) { return false; }
            });
          }
        }

        if (!matchedUser && fingerprintId) {
          const fp = String(fingerprintId).trim();
          matchedUser = users.find(u => {
            try {
              return [u.fingerprintId1, u.fingerprintId2, u.fingerprintId3, u.fingerprintId4]
                .filter(Boolean)
                .map(x => String(x).trim())
                .includes(fp);
            } catch (e) { return false; }
          });
        }
      } catch (e) {
        console.warn('Error matching user for pending entry', e);
      }

        if (!matchedUser) {
          // user not found: skip and leave pending node for retry. Do not write an audit log
          // here to avoid filling the database with repeated missing-user entries.
          continue;
      }

      // determine timestamp
      const dateObj = timestamp ? new Date(timestamp) : new Date();
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const t = time || dateObj.toISOString().split('T')[1].split('.')[0];

      // Build record payload and call recordAttendance() to centralize validation and duplicate checks
      const payload = {
        facultyId: matchedUser.facultyId || null,
        userId: matchedUser.userId ? String(matchedUser.userId) : (matchedUser.id ? String(matchedUser.id) : null),
        type: type || 'check_in',
        status: status || undefined, // let recordAttendance compute status when undefined
        timestamp: timestamp || dateObj.toISOString(),
        date: `${y}-${m}-${d}`,
        time: t,
      };

      try {
        const res = await recordAttendance(payload);
        if (res && res.success) {
          processed.push({ ...payload, status: res.record ? res.record.status : res.status });
          await writeAuditLog({
            action: 'process_pending_attendance',
            status: 'success',
            facultyId: matchedUser.facultyId,
            userId: matchedUser.userId || matchedUser.id,
            time: t,
            date: `${y}-${m}-${d}`,
          });

          // delete only the processed pending node so others remain
          try {
            const pendingNodeRef = ref(database, dbRef(`pendingAttendance/${year}/${month}/${day}/${time}`));
            await remove(pendingNodeRef);
          } catch (e) {
            console.warn('Failed to remove processed pendingAttendance node', e);
          }
        } else {
          // log but keep the pending node for retry
          await writeAuditLog({ action: 'process_pending_attendance', status: 'skipped', detail: res });
        }
      } catch (e) {
        console.error('Failed to record attendance for pending entry', e);
        await writeAuditLog({ action: 'process_pending_attendance', status: 'error', error: String(e), entry });
        // keep pending node for manual inspection/retry
      }
    }

    return processed;
  } catch (error) {
    console.error('Failed to process pending attendance:', error);
    await writeAuditLog({
      action: 'process_pending_attendance',
      status: 'error',
      error: error.message,
    });
    throw error;
  }
}

// --- Helpers for attendance/leave flattening -----------------
function _flattenAttendanceNode(node, out = [], path = []) {
  // node may be deeply nested: year -> month -> day -> time -> record
  if (!node || typeof node !== 'object') return out;

  // If node itself looks like a record, enrich with path-derived date/time and push
  const nodeLooksLikeRecord = node && (node.userId || node.facultyId || node.status || node.timestamp || node.time || node.date);
  if (nodeLooksLikeRecord && !Array.isArray(node)) {
    const enriched = _enrichRecordWithPath(node, path);
    out.push(enriched);
    return out;
  }

  Object.entries(node).forEach(([k, v]) => {
    if (!v) return;
    if (v && typeof v === 'object') {
      const maybeRecord = v && (v.userId || v.facultyId || v.status || v.timestamp || v.time || v.date);
      if (maybeRecord) {
        // If value is a record, pass the path plus the current key so we can infer year/month/day/time
        const enriched = _enrichRecordWithPath(v, [...path, k]);
        out.push(enriched);
      } else {
        // Recurse deeper, track the key path
        _flattenAttendanceNode(v, out, [...path, k]);
      }
    }
  });

  return out;
}

function _enrichRecordWithPath(record, path = []) {
  // path is expected like [year, month, day, time?]
  const out = { ...(record || {}) };
  try {
    const [y, m, d, t] = path;
    if (!out.date) {
      if (y && m && d) out.date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (!out.time) {
      if (t) out.time = String(t);
      else if (out.timestamp) {
        const parts = String(out.timestamp).split('T');
        if (parts[1]) out.time = parts[1].split('.')[0];
      }
    }
    if (!out.timestamp) {
      if (out.date && out.time) out.timestamp = `${out.date}T${out.time}`;
      else if (y && m && d && t) out.timestamp = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(t)}`;
    }
    // ensure userId/facultyId are strings for consistency
    if (out.userId !== undefined && out.userId !== null) out.userId = String(out.userId);
    if (out.facultyId !== undefined && out.facultyId !== null) out.facultyId = String(out.facultyId);

    // provide rawTimestamp alias (some UI code expects rawTimestamp)
    if (!out.rawTimestamp && out.timestamp) out.rawTimestamp = out.timestamp;

    // ensure an id exists for mapping; prefer existing id otherwise derive from user+timestamp
    if (!out.id) {
      const keyUser = out.userId || out.facultyId || 'unknown';
      const keyTs = out.rawTimestamp || out.timestamp || `${out.date || 'nodate'}T${out.time || 'notime'}`;
      out.id = `${String(keyUser)}::${String(keyTs)}`;
    }
  } catch (e) {
    // ignore enrichment failures
  }
  return out;
}

async function getAttendance() {
  const snapshot = await get(ref(database, dbRef('attendance')));
  if (!snapshot.exists()) return [];
  const val = snapshot.val();
  return _flattenAttendanceNode(val, []);
}

async function getLeaveRequests() {
  const snapshot = await get(ref(database, dbRef('leaveRequests')));
  if (!snapshot.exists()) return [];
  const val = snapshot.val();

  // val is likely an object keyed by facultyId -> { requestId: request }
  const out = [];
  Object.entries(val).forEach(([facultyId, reqs]) => {
    if (!reqs || typeof reqs !== 'object') return;
    Object.entries(reqs).forEach(([reqId, req]) => {
      if (!req) return;
      out.push({ facultyId, requestId: reqId, ...req });
    });
  });
  return out;
}

async function getEmployees() {
  const users = await getUsers();
  return (users || []).filter(u => ((u.role || '').toString().toLowerCase()) !== 'hr');
}

/**
 * Employee Type Management
 */
async function getEmployeeTypes() {
  const snapshot = await get(ref(database, dbRef('employeeTypes')));
  if (!snapshot.exists()) return [];
  const val = snapshot.val();
  return Object.entries(val).map(([id, type]) => ({ id, ...type }));
}

// NOTE: employeeType normalization logic moved to `src/utils/employeeTypeNormalizer.js`.

async function saveEmployeeType(type) {
  // If caller already normalized the payload, respect it to avoid double-normalization
  let normalized;
  if (type && type.__normalized) {
    // shallow copy to avoid mutating caller object and remove internal flag
    const copy = { ...(type || {}) };
    delete copy.__normalized;
    normalized = copy;
  } else {
    // Normalize shape and sensible isPercentage flags before saving
    normalized = normalizeEmployeeType(type || {});
  }
  let id = normalized.id || type.id;
  if (!id) {
    // Create new type
    const newRef = push(ref(database, dbRef('employeeTypes')));
    id = newRef.key;
    // sanitize normalized payload: remove redundant 'value' on tax bracket objects
    try {
      if (normalized && normalized.standardDeductions && typeof normalized.standardDeductions.tax === 'object') {
        // if tax uses bracket structure, remove any 'value' property which is redundant
        const t = normalized.standardDeductions.tax;
        if ('bracket' in t || 'rate' in t) {
          if ('value' in t) delete t.value;
        }
      }
    } catch (e) {
      // ignore sanitization errors
    }
    await set(newRef, { ...normalized, id });
    return { ...normalized, id };
  } else {
    // Update existing type
    const nodeRef = ref(database, dbRef(`employeeTypes/${id}`));
    // sanitize normalized payload before update
    try {
      if (normalized && normalized.standardDeductions && typeof normalized.standardDeductions.tax === 'object') {
        const t = normalized.standardDeductions.tax;
        if ('bracket' in t || 'rate' in t) {
          if ('value' in t) delete t.value;
        }
      }
    } catch (e) {
      // ignore
    }
    await set(nodeRef, { ...normalized, id });
    return { ...normalized, id };
  }
}

async function deleteEmployeeType(id) {
  if (!id) throw new Error('Missing employee type id');
  const nodeRef = ref(database, dbRef(`employeeTypes/${id}`));
  await remove(nodeRef);
  return true;
}

// Update holiday dates for a standardAdditions field (e.g., 'holidayPay' or 'specialHolidayPay')
async function saveEmployeeTypeHolidayDates(typeId, fieldKey, datesArray = []) {
  if (!typeId || !fieldKey) throw new Error('Missing typeId or fieldKey');
  const nodeRef = ref(database, dbRef(`employeeTypes/${typeId}/standardAdditions/${fieldKey}`));
  try {
    const snap = await get(nodeRef);
    const cur = snap.exists() ? snap.val() : null;
    let payload;
    if (cur === null) {
      // create object with default value 0
      payload = { value: 0, applyDates: Array.isArray(datesArray) ? datesArray.slice() : [] };
    } else if (typeof cur === 'number') {
      payload = { value: Number(cur || 0), applyDates: Array.isArray(datesArray) ? datesArray.slice() : [] };
    } else if (typeof cur === 'object') {
      payload = { ...cur, applyDates: Array.isArray(datesArray) ? datesArray.slice() : [] };
    } else {
      payload = { value: String(cur || ''), applyDates: Array.isArray(datesArray) ? datesArray.slice() : [] };
    }
    await set(nodeRef, payload);
    return payload;
  } catch (e) {
    console.error('saveEmployeeTypeHolidayDates failed', e);
    throw e;
  }
}

// --- Realtime listeners -------------------------------------
function onUsersUpdate(cb) {
  const node = ref(database, dbRef('users'));
  const unsub = onValue(node, (snap) => {
    if (!snap.exists()) return cb([]);
    const val = snap.val();
    if (Array.isArray(val)) return cb(val.map(u => ({ ...u })));
    const arr = Object.entries(val).map(([key, u]) => ({ id: key, ...(u || {}) }));
    cb(arr);
  });
  return unsub;
}

function onAttendanceUpdate(cb) {
  const node = ref(database, dbRef('attendance'));
  const unsub = onValue(node, (snap) => {
    if (!snap.exists()) return cb([]);
    const val = snap.val();
    const flattened = _flattenAttendanceNode(val, []);
    cb(flattened);
  });
  return unsub;
}

function onLeaveRequestsUpdate(cb) {
  const node = ref(database, dbRef('leaveRequests'));
  const unsub = onValue(node, (snap) => {
    if (!snap.exists()) return cb([]);
    const val = snap.val();
    const out = [];
    Object.entries(val).forEach(([facultyId, reqs]) => {
      if (!reqs || typeof reqs !== 'object') return;
      Object.entries(reqs).forEach(([reqId, req]) => {
        if (!req) return;
        out.push({ facultyId, requestId: reqId, ...req });
      });
    });
    cb(out);
  });
  return unsub;
}

function onScheduleTrackingUpdate(cb) {
  const node = ref(database, dbRef('scheduleTracking'));
  const unsub = onValue(node, (snap) => {
    if (!snap.exists()) return cb(null);
    const val = snap.val();
    cb(val);
  });
  return unsub;
}

// --- Other helpful operations --------------------------------
async function recordAttendance(payload = {}) {
  try {
      // Determine canonical date/time
      const ts = payload.timestamp ? new Date(payload.timestamp) : new Date();
      const y = ts.getFullYear();
      const m = String(ts.getMonth() + 1).padStart(2, '0');
      const d = String(ts.getDate()).padStart(2, '0');
      const time = payload.time || (ts.toISOString().split('T')[1] || '').split('.')[0];

      // Paths
      const dayPath = `attendance/${y}/${m}/${d}`;
      const nodePath = `${dayPath}/${time}`;
      const nodeRef = ref(database, dbRef(nodePath));
      const dayRef = ref(database, dbRef(dayPath));

      const record = {
        facultyId: payload.facultyId || payload.userId || payload.employeeId || null,
        userId: payload.userId ? String(payload.userId) : (payload.userId === 0 ? '0' : null),
        type: payload.type || 'check_in',
        status: payload.status || 'present',
        timestamp: payload.timestamp || ts.toISOString(),
        date: payload.date || `${y}-${m}-${d}`,
        time,
        message: payload.message || ''
      };

      // Check schedule if this is a check_in
      const isCheckIn = (record.type || '').toString().toLowerCase() === 'check_in' || (record.type || '').toString().toLowerCase() === 'in';
      if (isCheckIn) {
        const uid = String(record.userId || record.facultyId || record.employeeId || '');
        if (uid) {
          try {
            const scheduleSnap = await get(ref(database, dbRef(`schedules/${uid}`)));
            if (scheduleSnap.exists()) {
              const schedule = scheduleSnap.val();
              if (schedule && schedule.schedule) {
                const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][ts.getDay()];
                const daySchedule = schedule.schedule[dayOfWeek];
                if (daySchedule) {
                  const { startTime, endTime } = daySchedule;
                  const [schedHour, schedMin] = startTime.split(':').map(Number);
                  const [checkHour, checkMin] = time.split(':').map(Number);

                  // Convert both times to minutes since midnight for comparison
                  const scheduleMinutes = schedHour * 60 + schedMin;
                  const checkInMinutes = checkHour * 60 + checkMin;

                  // Grace period for being late (15 minutes)
                  const gracePeriod = 15;
                  const isLate = checkInMinutes > (scheduleMinutes + gracePeriod);

                  if (isLate) {
                    record.status = 'late';
                    record.message = `Late by ${Math.floor((checkInMinutes - scheduleMinutes) / 60)}h ${(checkInMinutes - scheduleMinutes) % 60}m`;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Schedule validation failed:', e);
          }
        }
      }    // Fast-fail: require a canonical userId (or facultyId) on incoming payloads.
    // This prevents different fingerprintIds from creating duplicate user records if userId is available.
    if (!record.userId && !record.facultyId) {
      return { success: false, reason: 'missing_userid', message: 'Incoming attendance must include userId or facultyId' };
    }

    // DEBUG: log incoming and day's snapshot summary to help diagnose duplicate writes
    // Only log in development mode or when RECORD_ATTENDANCE_DEBUG is enabled
    if (import.meta.env.MODE === 'development' && import.meta.env.VITE_RECORD_ATTENDANCE_DEBUG === 'true') {
      try {
        const daySnap = await get(dayRef);
        if (!daySnap.exists()) {
          console.info('[recordAttendance] daySnapshot: none', { date: record.date, incomingUserId: record.userId, incomingType: record.type, incomingTimestamp: record.timestamp });
        } else {
          const raw = daySnap.val();
          const summary = Object.entries(raw || {}).map(([k, v]) => ({ timeKey: k, userId: v?.userId, facultyId: v?.facultyId, type: v?.type, timestamp: v?.timestamp }));
          console.info('[recordAttendance] daySnapshot summary', { date: record.date, incoming: { userId: record.userId, type: record.type, timestamp: record.timestamp }, existingCount: summary.length, summary });
        }
      } catch (dbgErr) {
        console.warn('[recordAttendance] debug snapshot read failed', dbgErr);
      }
    }

    // Enforce single check-in/check-out per user per day
    try {
      const snap = await get(dayRef);
      const existing = snap.exists() ? snap.val() : null;
      if (existing) {
        // Iterate existing child nodes (times) to find matches
        for (const [childTime, childRecord] of Object.entries(existing)) {
          try {
            if (!childRecord) continue;

            // Build a set of identifiers for existing record and for the incoming record
            const gatherIds = (r) => {
              const ids = new Set();
              const push = (v) => { if (v !== undefined && v !== null) ids.add(String(v).trim()); };
              push(r.userId);
              push(r.facultyId);
              push(r.employeeId);
              push(r.uid);
              push(r.id);
              push(r.email);
              push(r.fingerprintId);
              push(r.fingerprint);
              return ids;
            };

            // Prefer direct userId comparison (most reliable)
            const existingUserId = (childRecord.userId || childRecord.facultyId || null);
            const incomingUserId = (record.userId || record.facultyId || null);
            let sameUser = false;
            if (existingUserId && incomingUserId) {
              if (String(existingUserId).trim() === String(incomingUserId).trim()) sameUser = true;
            } else {
              // Fall back to broader id matching when userId is not present on either side
              const existingIds = gatherIds(childRecord);
              const incomingIds = gatherIds(record);
              for (const v of existingIds) {
                if (!v) continue;
                if (incomingIds.has(v)) { sameUser = true; break; }
                // Also allow substring matches for cases where stored id contains timestamp suffix
                for (const w of incomingIds) {
                  if (!w) continue;
                  if (v.includes(w) || w.includes(v)) { sameUser = true; break; }
                }
                if (sameUser) break;
              }
            }

            if (!sameUser) continue;

            const existingType = (childRecord.type || '').toString().toLowerCase();
            const newType = (record.type || '').toString().toLowerCase();
            if (existingType === newType) {
              // If existing record has a timestamp newer or equal to incoming, skip write
              try {
                const parseTs = (v) => {
                  if (!v) return null;
                  const n = Date.parse(String(v));
                  return Number.isNaN(n) ? null : n;
                };
                const existingTs = parseTs(childRecord.timestamp) || parseTs(childRecord.rawTimestamp) || null;
                const incomingTs = parseTs(record.timestamp) || parseTs(record.rawTimestamp) || null;

                if (existingTs && incomingTs) {
                  if (incomingTs <= existingTs) {
                    return { success: false, reason: `not_newer_${newType}`, message: `Incoming ${newType} is not newer than existing record for ${record.date}` };
                  }
                  // incoming is newer: allow write (we do not delete old node here)
                } else {
                  // If we can't parse timestamps, fallback to rejecting duplicates to be safe
                  return { success: false, reason: `already_${newType}`, message: `User already has a ${newType} for ${record.date}` };
                }
              } catch (e) {
                // On any parsing error, conservatively reject
                return { success: false, reason: `already_${newType}`, message: `User already has a ${newType} for ${record.date}` };
              }
            }
          } catch (e) { /* ignore per-child errors */ }
        }
      }
    } catch (err) {
      console.warn('recordAttendance: failed to validate duplicates', err);
    }

    await set(nodeRef, record);
    // If this is a check_out for an hourly employee, compute hours/earnings for that date and persist a per-day earnings record.
    try {
      const isCheckOut = (record.type || '').toString().toLowerCase() === 'check_out' || (record.type || '').toString().toLowerCase() === 'out';
      if (isCheckOut) {
        // Resolve user id candidates
        const uid = String(record.userId || record.facultyId || record.employeeId || '');
        if (uid) {
          // fetch user to determine if hourly
          const userSnap = await get(ref(database, dbRef(`users/${uid}`)));
          const user = userSnap.exists() ? userSnap.val() : null;
          // fallback: try to find by facultyId among users
          let userIdKey = uid;
          if (!user) {
            const allUsersSnap = await get(ref(database, dbRef('users')));
            if (allUsersSnap.exists()) {
              const uobj = allUsersSnap.val();
              const found = Object.entries(uobj).find(([k, v]) => {
                const vals = [v && v.userId, v && v.facultyId, v && v.id].map(x => x && String(x));
                return vals.includes(uid);
              });
              if (found) {
                userIdKey = found[0];
              }
            }
          }

          const userDataSnap = await get(ref(database, dbRef(`users/${userIdKey}`)));
          const userData = userDataSnap.exists() ? userDataSnap.val() : user;
          // Determine hourly
          let isHourly = false;
          let baseRate = 0;
          let overtimeRate = 0;
          let lateDeduction = 0;
          let expectedDailyHours = 8;

          if (userData) {
            // prefer salaryInfo on user, else lookup employeeType
            const salaryInfo = userData.salaryInfo || {};
            if (salaryInfo && String(salaryInfo.salaryType || '').toLowerCase() === 'hourly') {
              isHourly = true;
              baseRate = Number(salaryInfo.rate || salaryInfo.salaryRate || 0);
              overtimeRate = Number(salaryInfo.overtimeRate || 0) || Math.round(baseRate * 1.25 * 100) / 100;
              lateDeduction = Number(salaryInfo.lateDeduction || 0);
              expectedDailyHours = Number(salaryInfo.expectedDailyHours || 8);
            }
            if (!isHourly && userData.employeeType) {
              try {
                const etSnap = await get(ref(database, dbRef(`employeeTypes/${userData.employeeType}`)));
                if (etSnap.exists()) {
                  const et = etSnap.val();
                  if (String(et.salaryType || '').toLowerCase() === 'hourly') {
                    isHourly = true;
                    baseRate = Number(et.rate || 0);
                    overtimeRate = Number(et.overtimeRate || 0) || Math.round(baseRate * 1.25 * 100) / 100;
                    lateDeduction = Number(et.lateDeduction || 0) || 0;
                    expectedDailyHours = Number(et.expectedDailyHours || 8);
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }

          if (isHourly) {
            // compute date components from record.timestamp or record.date
            const ts = record.timestamp ? new Date(record.timestamp) : new Date();
            const y = ts.getFullYear();
            const m = String(ts.getMonth() + 1).padStart(2, '0');
            const d = String(ts.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;

            // fetch flattened attendance and pair
            const allAttendance = await getAttendance();
            const userAttendance = (allAttendance || []).filter(a => String(a.userId) === String(userIdKey) || String(a.facultyId) === String(userIdKey) || String(a.userId) === String(uid));
            const paired = pairAttendanceRecords(userAttendance);
            const dayRow = paired.find(p => p.date === dateKey);
            if (dayRow && (dayRow.hours || dayRow.hours === 0)) {
              const result = computeHourlyEarnings([dayRow], { baseRate, overtimeRate, lateDeduction, expectedDailyHours });
              // Persist per-day earnings under attendanceEarnings/year/month/userId/date
              const earningsPath = `attendanceEarnings/${y}/${m}/${userIdKey}/${dateKey}`;
              const earningsNode = {
                userId: userIdKey,
                date: dateKey,
                hours: dayRow.hours,
                baseEarnings: result.baseEarnings,
                overtimeEarnings: result.overtimeEarnings,
                lateDeductions: result.totalLateDeductions,
                gross: result.computedGross,
                rate: baseRate,
                overtimeRate: overtimeRate,
                createdAt: new Date().toISOString()
              };
              await set(ref(database, dbRef(earningsPath)), earningsNode);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to compute/persist attendance earnings:', e);
    }
    return { success: true, record };
  } catch (err) {
    console.error('recordAttendance error', err);
    return { success: false, error: String(err) };
  }
}

async function updateLeaveRequest(facultyId, requestId, updates = {}) {
  if (!facultyId || !requestId) throw new Error('Missing facultyId or requestId');
  const node = ref(database, dbRef(`leaveRequests/${facultyId}/${requestId}`));
  await update(node, updates);
  return { success: true };
}

async function writeNotification(fid, payload = {}) {
  try {
    const node = ref(database, dbRef(`notifications/${fid}/${Date.now()}`));
    await set(node, { ...payload, timestamp: Date.now() });
    return { success: true };
  } catch (err) {
    console.warn('writeNotification failed', err);
    return { success: false, error: String(err) };
  }
}

async function getUserEmail(id) {
  // Accept facultyId, userId, or uid
  const users = await getUsers();
  const found = (users || []).find(u => String(u.facultyId) === String(id) || String(u.userId) === String(id) || String(u.id) === String(id));
  return found?.email || null;
}

async function getHREmail() {
  const users = await getUsers();
  const hr = (users || []).find(u => ((u.role || '').toString().toLowerCase()) === 'hr');
  return hr?.email || null;
}

async function findLeaveRequestById(requestId) {
  if (!requestId) return null;
  const snapshot = await get(ref(database, dbRef('leaveRequests')));
  if (!snapshot.exists()) return null;
  const val = snapshot.val();
  for (const [facultyId, reqs] of Object.entries(val)) {
    if (!reqs || typeof reqs !== 'object') continue;
    if (reqs[requestId]) return { facultyId, request: reqs[requestId] };
  }
  return null;
}

// --- Payroll helpers --------------------------------------
async function getPayroll() {
  const s = await get(ref(database, dbRef('payroll')));
  if (!s.exists()) return [];
  const v = s.val();
  if (v && v.employees) return Object.entries(v.employees).map(([id, e]) => ({ id, ...e }));
  return Object.entries(v).map(([id, p]) => ({ id, ...p }));
}

// Payroll configuration (frequency, custom ranges)
// Data model is stored under `payroll_config/current` with an audit trail in `payroll_config/history`
async function getPayrollConfig() {
  try {
    const snap = await get(ref(database, dbRef('payroll_config/current')));
    if (!snap.exists()) return null;
    return snap.val();
  } catch (e) {
    console.error('getPayrollConfig failed', e);
    return null;
  }
}

/**
 * Create or update the current payroll config.
 * If a current config exists and is locked, this will throw to prevent overwriting a locked config.
 * The function will stamp createdBy/createdAt when creating a new config.
 */
async function savePayrollConfig(cfg = {}, authUser = null) {
  try {
    const curRef = ref(database, dbRef('payroll_config/current'));
    const snap = await get(curRef);
    const cur = snap.exists() ? snap.val() : null;

    if (cur && cur.locked) {
      throw new Error('Cannot overwrite locked payroll configuration');
    }

    const now = new Date().toISOString();
    const payload = {
      frequency: cfg.frequency || (cur && cur.frequency) || 'monthly',
      range: cfg.range || (cur && cur.range) || null,
      week: cfg.week || (cur && cur.week) || null,
      recurrence: cfg.recurrence || (cur && cur.recurrence) || null,
      note: cfg.note || (cur && cur.note) || null,
      locked: Boolean(cfg.locked) || false,
      consumed: Boolean(cur && cur.consumed) || false,
      updatedAt: now,
      updatedBy: authUser ? String(authUser.uid || authUser) : (cur && cur.updatedBy) || null
    };

    // If creating for the first time, set created metadata
    if (!cur) {
      payload.createdAt = now;
      payload.createdBy = authUser ? String(authUser.uid || authUser) : null;
    } else {
      payload.createdAt = cur.createdAt || now;
      payload.createdBy = cur.createdBy || (authUser ? String(authUser.uid || authUser) : null);
    }

    await set(curRef, payload);
    return payload;
  } catch (e) {
    console.error('savePayrollConfig failed', e);
    throw e;
  }
}

// Helper: clamp day to last day of given year/month
function _clampDay(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Number(day || 1), last);
}

// Helper: format date to YYYY-MM-DD
function _fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Given a base date (YYYY-MM-DD) and recurrence { type:'monthly'|'semimonthly', days:[n] }
// compute the next occurrence strictly after baseDate (or equal if includeToday=true)
function computeNextOccurrenceFrom(baseDateIso, recurrence) {
  try {
    if (!recurrence || !recurrence.days || !Array.isArray(recurrence.days) || recurrence.days.length === 0) return null;
    const days = recurrence.days.map(n => Number(n)).filter(n => n > 0).sort((a,b) => a-b);
    if (days.length === 0) return null;

    const base = new Date(baseDateIso + 'T00:00:00');
    if (isNaN(base.getTime())) return null;
    const by = base.getFullYear();
    const bm = base.getMonth() + 1; // 1-based
    const bd = base.getDate();

    // Search same month for next day > bd
    for (const d of days) {
      if (d > bd) {
        const dayClamped = _clampDay(by, bm, d);
        return `${by}-${String(bm).padStart(2,'0')}-${String(dayClamped).padStart(2,'0')}`;
      }
    }

    // None found in this month -> go to next month and pick first recurrence day
    let nextMonth = bm + 1;
    let nextYear = by;
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    const firstDay = days[0];
    const dayClamped = _clampDay(nextYear, nextMonth, firstDay);
    return `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(dayClamped).padStart(2,'0')}`;
  } catch (e) { return null; }
}

/**
 * Lock the current payroll config and archive the snapshot to history.
 * This is used to finalize a payroll schedule so it becomes authoritative.
 */
async function lockPayrollConfig(locker = null) {
  try {
    const curRef = ref(database, dbRef('payroll_config/current'));
    const curSnap = await get(curRef);
    if (!curSnap.exists()) throw new Error('No current payroll config to lock');
    const cur = curSnap.val();
    if (cur.locked) return cur; // already locked

    const now = new Date().toISOString();
    const historyKeyRef = push(ref(database, dbRef('payroll_config/history')));
    const historyKey = historyKeyRef.key;

    const archived = { ...(cur || {}), archivedAt: now, archivedBy: locker ? String(locker.uid || locker) : null };

    const updatedCurrent = { ...cur, locked: true, lockedAt: now, lockedBy: locker ? String(locker.uid || locker) : null };

    // Multi-path update: write history entry and update current atomically
    const updates = {};
    updates[`/payroll_config/history/${historyKey}`] = archived;
    updates['/payroll_config/current'] = updatedCurrent;

    await update(ref(database, '/'), updates);
    return updatedCurrent;
  } catch (e) {
    console.error('lockPayrollConfig failed', e);
    throw e;
  }
}

/**
 * Mark current payroll config as consumed (after payroll generation) and archive final snapshot.
 */
async function consumePayrollConfig(runId = null, consumer = null) {
  try {
    const curRef = ref(database, dbRef('payroll_config/current'));
    const curSnap = await get(curRef);
    if (!curSnap.exists()) throw new Error('No current payroll config to consume');
    const cur = curSnap.val();
    // allow consuming even if cur.consumed=false; always archive snapshot with consumed metadata
    const now = new Date().toISOString();
    const historyKeyRef = push(ref(database, dbRef('payroll_config/history')));
    const historyKey = historyKeyRef.key;

    const archived = { ...(cur || {}), consumedAt: now, consumedBy: consumer ? String(consumer.uid || consumer) : null, runId: runId || null };

    // Compute nextRange based on recurrence if present
    let nextRange = cur.range || null;
    try {
      if (cur.recurrence && Array.isArray(cur.recurrence.days) && cur.recurrence.days.length > 0) {
        // Determine consumed date: prefer cur.nextRange.start, else use today
        const consumedDate = (cur.nextRange && cur.nextRange.start) ? cur.nextRange.start : _fmtDate(new Date(now));
        const nextDate = computeNextOccurrenceFrom(consumedDate, cur.recurrence);
        if (nextDate) nextRange = { start: nextDate, end: nextDate };
      }
    } catch (e) {
      console.warn('Failed to compute nextRange from recurrence', e);
    }

    // Update current: keep locked true, set consumed:false (ready for next run), update nextRange
    const updatedCurrent = { ...cur, consumed: false, nextRange: nextRange || cur.nextRange || null, lastRun: { runId: runId || null, consumedAt: now, consumedBy: consumer ? String(consumer.uid || consumer) : null } };

    const updates = {};
    updates[`/payroll_config/history/${historyKey}`] = archived;
    updates['/payroll_config/current'] = updatedCurrent;

    await update(ref(database, '/'), updates);
    return updatedCurrent;
  } catch (e) {
    console.error('consumePayrollConfig failed', e);
    throw e;
  }
}

async function getPayrollHistory() {
  try {
    const snap = await get(ref(database, dbRef('payroll_config/history')));
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.entries(val).map(([k, v]) => ({ id: k, ...(v || {}) })).sort((a,b) => (a.archivedAt || a.createdAt || '') < (b.archivedAt || b.createdAt || '') ? 1 : -1);
  } catch (e) {
    console.error('getPayrollHistory failed', e);
    return [];
  }
}

async function getDeductions() {
  const s = await get(ref(database, dbRef('deductions')));
  return s.exists() ? s.val() : {};
}

async function updateAttendanceCheckOut(userId, dateStr, checkOutDateTime) {
  try {
    // dateStr format: 'YYYY-MM-DD'
    const [year, month, day] = dateStr.split('-');
    
    // Get all attendance records for this user on this date
    const dayPath = `attendance/${year}/${month}/${day}`;
    const dayRef = ref(database, dbRef(dayPath));
    const snapshot = await get(dayRef);
    
    if (!snapshot.exists()) {
      throw new Error('No attendance records found for this date');
    }
    
    const records = snapshot.val();
    let userRecord = null;
    
    // Find the check-in record for this user to get their info
    for (const [timeKey, record] of Object.entries(records)) {
      const uid = String(record.userId || record.facultyId || '');
      const isCheckIn = (record.type || '').toString().toLowerCase() === 'check_in';
      
      if (uid === String(userId) && isCheckIn) {
        userRecord = record;
        break;
      }
    }
    
    if (!userRecord) {
      throw new Error('Could not find check-in record for this user on this date');
    }
    
    // Extract time from checkOutDateTime (format: HH:MM:SS)
    const checkOutDate = new Date(checkOutDateTime);
    const hours = String(checkOutDate.getHours()).padStart(2, '0');
    const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
    const seconds = String(checkOutDate.getSeconds()).padStart(2, '0');
    const checkOutTime = `${hours}:${minutes}:${seconds}`;
    
    // Create a new check-out record with the same structure as check-in
    const checkOutRecord = {
      date: dateStr,
      facultyId: userRecord.facultyId,
      message: '',
      status: 'present',
      time: checkOutTime,
      timestamp: checkOutDateTime,
      type: 'check_out',
      userId: userRecord.userId
    };
    
    // Save as a NEW record in the same day node with the check-out time as key
    const checkOutRef = ref(database, dbRef(`${dayPath}/${checkOutTime}`));
    await set(checkOutRef, checkOutRecord);
    
    return { success: true, message: 'Check-out time recorded successfully' };
  } catch (err) {
    console.error('Error updating attendance check-out:', err);
    throw err;
  }
}

export const firebaseService = {
  // users
  getUsers,
  getEmployees,
  onUsersUpdate,
  // attendance
  getAttendance,
  onAttendanceUpdate,
  getPendingAttendance,
  processPendingAttendance,
  recordAttendance,
  updateAttendanceCheckOut,
  getScheduleTracking: async () => {
    const snapshot = await get(ref(database, dbRef('scheduleTracking')));
    return snapshot.exists() ? snapshot.val() : null;
  },
  onScheduleTrackingUpdate,

  // leave
  getLeaveRequests,
  onLeaveRequestsUpdate,
  updateLeaveRequest,

  // misc
  writeAuditLog,
  writeNotification,
  getUserEmail,
  getHREmail,
  findLeaveRequestById,
  // payroll
  getPayroll,
  getPayrollConfig,
  savePayrollConfig,
  lockPayrollConfig,
  consumePayrollConfig,
  getPayrollHistory,
  getDeductions,

  // employee types
  getEmployeeTypes,
  saveEmployeeType,
  deleteEmployeeType,
  saveEmployeeTypeHolidayDates,

  // Role management
  getRoles: async () => {
    const mod = await import('./roleService');
    return mod.getRoles();
  },
  saveRole: async (role) => {
    const mod = await import('./roleService');
    return mod.saveRole(role);
  },
  deleteRole: async (id) => {
    const mod = await import('./roleService');
    return mod.deleteRole(id);
  },
  migrateDepartmentsToRoles: async () => {
    const mod = await import('./roleService');
    return mod.migrateDepartmentsToRoles();
  },

  // User role management
  getPendingRoleUsers: async function() {
    const mod = await import('./userRoleService');
    return mod.getPendingRoleUsers();
  },
  assignUserRole: async function(userId, roleData) {
    const mod = await import('./userRoleService');
    return mod.assignUserRole(userId, roleData);
  },
  onPendingRoleUsersChange: function(callback) {
    import('./userRoleService').then(mod => {
      return mod.onPendingRoleUsersChange(callback);
    });
  },

  // Deprecated department methods (compatibility layer)
  getDepartments: async () => {
    console.warn('getDepartments is deprecated. Please use getRoles instead.');
    const mod = await import('./roleService');
    return mod.getRoles();
  },
  saveDepartment: async (department) => {
    console.warn('saveDepartment is deprecated. Please use saveRole instead.');
    const mod = await import('./roleService');
    return mod.saveRole(department);
  },
  deleteDepartment: async (id) => {
    console.warn('deleteDepartment is deprecated. Please use deleteRole instead.');
    const mod = await import('./roleService');
    return mod.deleteRole(id);
  },
};
