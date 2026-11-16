// Utility helpers for attendance normalization and common operations

export function normalizeAttendanceForUI(record) {
  if (!record) return record;

  // Handle nested date structure (year/month/day)
  let dateStr = record.date;
  if (!dateStr && record.year && record.month && record.day) {
    dateStr = `${record.year}-${record.month.toString().padStart(2, '0')}-${record.day.toString().padStart(2, '0')}`;
  }

  // Handle timestamp
  if (!dateStr && record.timestamp) {
    dateStr = record.timestamp.split('T')[0];
  }

  const checkIn = record.type === 'check_in' ? (record.time || record.timestamp?.split('T')[1]) : null;
  const checkOut = record.type === 'check_out' ? (record.time || record.timestamp?.split('T')[1]) : null;
  const check_in_iso = checkIn ? `${dateStr}T${checkIn}` : record.timestamp;

  // Normalize various status tokens into a single canonical set used by the UI
  const raw = (record.status ?? 'present').toString().toLowerCase().trim();
  let status = '';
  if (raw === 'present' || raw === 'on time' || raw === 'ontime') status = 'present';
  else if (raw === 'late' || raw === 'tardy') status = 'late';
  else if (raw === 'on_leave' || raw === 'on leave' || raw === 'leave' || raw === 'onleave') status = 'on leave';
  else if (raw === 'absent') status = 'absent';
  else status = raw || '';

  return {
    ...record,
    check_in: check_in_iso,
    checkIn,
    checkOut,
    faculty_name: record.faculty_name || null, // preserved when available
    status
  };
}

export function groupAttendanceByUser(records) {
  const map = new Map();
  records.forEach(r => {
    const arr = map.get(r.userId) || [];
    arr.push(r);
    map.set(r.userId, arr);
  });
  return map;
}

export function getLatestRecordPerUser(records) {
  const latest = new Map();
  records.forEach(r => {
    // Prefer userId, fall back to facultyId so grouping works for both shapes
    const key = r.userId || r.facultyId;
    const existing = latest.get(key);
    if (!existing) latest.set(key, r);
    else {
      const t1 = new Date(existing.rawTimestamp || `${existing.date}T${existing.time || '00:00:00'}`);
      const t2 = new Date(r.rawTimestamp || `${r.date}T${r.time || '00:00:00'}`);
      if (t2 > t1) latest.set(key, r);
    }
  });
  return Array.from(latest.values());
}

/**
 * Pair check-in and check-out records per user per date and compute hours.
 * Input: array of normalized attendance records where each record has at least
 * { userId, facultyId, date, time, type, rawTimestamp, status }
 * Output: array of paired rows: { userId, facultyId, date, checkIn, checkOut, hours, status, rawRecords }
 */
export function pairAttendanceRecords(records) {
  const byUser = new Map();
  console.error('🔵 pairAttendanceRecords - Input records:', records.length, 'records');
  
  if (records && records.length > 0) {
    console.error('🔵 First record sample:', {
      userId: records[0].userId,
      facultyId: records[0].facultyId,
      date: records[0].date,
      type: records[0].type,
      timestamp: records[0].timestamp,
      checkIn: records[0].checkIn,
      checkOut: records[0].checkOut,
      rawTimestamp: records[0].rawTimestamp
    });
  }

  // First pass: group all records by user only (not by date)
  (records || []).forEach((r, idx) => {
    try {
      const uid = (r.userId || r.facultyId || '').toString();
      if (!uid) {
        console.error(`🔵 Record ${idx}: Skipped - no userId/facultyId`);
        return;
      }
      const arr = byUser.get(uid) || [];
      arr.push(r);
      byUser.set(uid, arr);
      console.error(`🔵 Record ${idx}: Added to user "${uid}"`);
    } catch (e) {
      console.error(`🔵 Record ${idx}: Error -`, e?.message);
    }
  });

  console.error('🔵 byUser map size:', byUser.size, 'users');
  
  const out = [];
  
  // Second pass: pair check-in/check-out per user (can span dates for night shifts)
  for (const [uid, arr] of byUser.entries()) {
    console.error(`🔵 Processing user: "${uid}" with ${arr.length} records`);
    
    // Sort by timestamp to process in chronological order
    arr.sort((a, b) => {
      const t1 = new Date(a.rawTimestamp || a.timestamp || `${a.date}T${a.time || '00:00:00'}`);
      const t2 = new Date(b.rawTimestamp || b.timestamp || `${b.date}T${b.time || '00:00:00'}`);
      return (t1 && typeof t1.getTime === 'function' ? t1.getTime() : new Date(t1).getTime()) - (t2 && typeof t2.getTime === 'function' ? t2.getTime() : new Date(t2).getTime());
    });

    console.error(`🔵 Sorted records for user ${uid}:`, arr.map(a => ({ type: a.type, date: a.date, time: a.time, timestamp: a.timestamp })));
    
    // Pair consecutive check-in with next check-out
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const currentType = (current.type || '').toString().toLowerCase();
      
      // Look for a check-in
      if (currentType !== 'check_in' && currentType !== 'in') continue;
      
      // Find the next check-out after this check-in
      let checkOut = null;
      let checkOutIdx = -1;
      for (let j = i + 1; j < arr.length; j++) {
        const nextType = (arr[j].type || '').toString().toLowerCase();
        if (nextType === 'check_out' || nextType === 'out') {
          checkOut = arr[j];
          checkOutIdx = j;
          break;
        }
      }
      
      // If we found a check-out, create a paired record
      if (checkOut && checkOutIdx > i) {
        const checkInIso = current.rawTimestamp || current.timestamp || `${current.date}T${current.time}`;
        let checkOutIso = checkOut.rawTimestamp || checkOut.timestamp || `${checkOut.date}T${checkOut.time}`;
        
        console.error(`🔵 Pairing: checkIn="${checkInIso}" with checkOut="${checkOutIso}"`);
        
        let t1 = new Date(checkInIso);
        let t2 = new Date(checkOutIso);
        let ms1 = (t1 && typeof t1.getTime === 'function') ? t1.getTime() : new Date(t1).getTime();
        let ms2 = (t2 && typeof t2.getTime === 'function') ? t2.getTime() : new Date(t2).getTime();
        let diff = (ms2 - ms1) / (1000 * 60 * 60); // hours
        
        // If checkout is before checkin on same day, assume checkout is from next day
        if (diff < 0) {
          const nextDate = new Date(t2);
          nextDate.setDate(nextDate.getDate() + 1);
          checkOutIso = nextDate.toISOString().split('T')[0] + 'T' + checkOut.time;
          t2 = new Date(checkOutIso);
          ms2 = t2.getTime();
          diff = (ms2 - ms1) / (1000 * 60 * 60);
          console.error(`🔵 Adjusted checkout to next day: "${checkOutIso}", diff=${diff} hours`);
        }
        
        // Skip pairing if gap is too large (more than 18 hours)
        if (diff > 18) {
          console.error(`🔵 Skipping invalid pairing: diff=${diff} hours (too large)`);
          continue;
        }
        
        const hours = isFinite(diff) ? Math.max(0, Math.round(diff * 100) / 100) : null;
        
        console.error(`🔵 User ${uid}: Calculated hours=${hours} from checkIn to checkOut`);
        
        // Use the check-in date for the pairing
        const date = current.date || t1.toISOString().split('T')[0];
        const status = (current.status || '').toString().toLowerCase() || 'present';
        
        out.push({
          userId: uid,
          facultyId: uid,
          date,
          checkIn: checkInIso,
          checkOut: checkOutIso,
          hours,
          status,
          rawRecords: [current, checkOut]
        });
        
        // Mark this check-out as used so we don't pair it again
        checkOut._paired = true;
      } else {
        // No checkout found - create orphaned check-in record so user can add checkout manually
        const checkInIso = current.rawTimestamp || current.timestamp || `${current.date}T${current.time}`;
        const date = current.date || new Date(checkInIso).toISOString().split('T')[0];
        const status = (current.status || '').toString().toLowerCase() || 'present';
        
        console.error(`🔵 Orphaned check-in for user ${uid}: "${checkInIso}" (no matching checkout)`);
        
        out.push({
          userId: uid,
          facultyId: uid,
          date,
          checkIn: checkInIso,
          checkOut: null,  // No checkout - will show "Add Check-out" button
          hours: null,
          status,
          rawRecords: [current]
        });
      }
    }
  }

  // return array sorted by date then userId for predictability
  console.error('🔵 pairAttendanceRecords - Output:', out.length, 'paired records');
  if (out.length > 0) {
    console.error('🔵 First few paired records:', out.slice(0, 3).map(p => ({ userId: p.userId, date: p.date, checkIn: p.checkIn, checkOut: p.checkOut, hours: p.hours })));
  }
  return out.sort((a,b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    if (a.userId < b.userId) return -1;
    if (a.userId > b.userId) return 1;
    return 0;
  });
}
