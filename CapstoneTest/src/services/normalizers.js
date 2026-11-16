// src/services/normalizers.js
export const normalizers = {
  // User normalization
  normalizeUser: (u = {}, key) => {
    const nodeKey = (key !== undefined && key !== null)
      ? String(key)
      : (u && u.userId !== undefined)
        ? String(u.userId)
        : (u && u.facultyId ? String(u.facultyId) : '');

    const facultyId = (u && u.facultyId) ? String(u.facultyId) : (nodeKey || '');
    const userId = (u && (u.userId !== undefined)) ? u.userId : null;

    return {
      id: facultyId || nodeKey,
      userId,
      facultyId,
      originalKey: nodeKey,
      name: u.name ?? '',
      department: u.department ?? '',
      role: (u.role || 'faculty').toString().toLowerCase(),
      position: u.position ?? u.role ?? '',
      email: u.email ?? '',
      fingerprintId: u.fingerprintId ?? null,
      profilePicture: u.profilePicture ?? u.profile_picture ?? '',
      status: u.status ?? 'active',
      createdAt: u.createdAt,
      enrolledAt: u.enrolledAt,
      sourceKey: u.sourceKey,
      salaryInfo: u.salary_info ?? u.salaryInfo ?? {}
    };
  },

  // Attendance record normalization
  normalizeAttendance: (r = {}, date, time) => {
    const base = {
      id: `${r.userId || r.facultyId || 'unknown'}-${date}-${time}`,
      userId: r.userId ?? r.facultyId ?? null,
      facultyId: r.facultyId ?? r.userId ?? null,
      date,
      time,
      type: r.type ?? 'check_in',
      status: r.status ?? 'present',
      rawTimestamp: r.timestamp ?? r.rawTimestamp ?? null
    };

    // Normalize date formats
    if (base.rawTimestamp) {
      try {
        const d = new Date(base.rawTimestamp);
        if (!isNaN(d.getTime())) {
          base.date = d.toISOString().split('T')[0];
          base.time = d.toTimeString().split(' ')[0];
        }
      } catch (e) {}
    }

    return base;
  },

  // Leave request normalization
  normalizeLeaveRequest: (r = {}, facultyId = '', id = '') => ({
    id: String(id),
    facultyId: String(facultyId || r.facultyId || r.userId || ''),
    status: (r.status ?? r.state ?? '').toString().toLowerCase(),
    startDate: normalizers.normalizeDateStr(r.startDate ?? r.start_date ?? r.start ?? null),
    endDate: normalizers.normalizeDateStr(r.endDate ?? r.end_date ?? r.end ?? null),
    createdAt: normalizers.normalizeDateStr(r.createdAt ?? r.created_at ?? r.created ?? null),
    type: r.leaveType ?? r.type ?? r.leave_type ?? 'regular',
    reason: r.reason ?? r.description ?? '',
    approver: r.approver ?? r.approvedBy ?? null,
    proofUrl: r.proofUrl ?? r.proof_url ?? r.attachmentUrl ?? null,
    comments: r.comments ?? r.notes ?? [],
    history: r.history ?? []
  }),

  // Date string normalization
  normalizeDateStr: (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return null;
    }
    if (typeof v === 'number') {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return null;
    }
    if (v instanceof Date) {
      if (!isNaN(v.getTime())) return v.toISOString().slice(0, 10);
      return null;
    }
    try {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch (e) {}
    return null;
  }
};