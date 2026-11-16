import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Users, Clock, Calendar, FileText } from 'lucide-react';
import { scheduleService } from '../../services/scheduleService';
import { scheduleTrackingService } from '../../services/scheduleTrackingService';
import { firebaseService } from '../../services/firebaseService';
import { normalizeAttendanceForUI, pairAttendanceRecords } from '../../utils/attendanceUtils';

const ITEMS_PER_PAGE = 5;

export default function PersonDTR() {
  const { uid } = useParams();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [employeeName, setEmployeeName] = useState('');
  const [stats, setStats] = useState({ totalRecords: 0, lateCount: 0, totalLateMins: 0, absenceCount: 0 });
  const [filter, setFilter] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Helper to parse date/time strings flexibly (matches DTRSummary)
  function parseIsoLikeToDate(val) {
    if (!val && val !== 0) return null;
    const s = String(val);
    try {
      let d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]?)([0-9:\-\._]{4,})(.*)$/);
      if (m) {
        const datePart = m[1];
        let timePart = m[2].replace(/[-\._]/g, ':');
        if (/^\d{6}(?:\.\d+)?$/.test(timePart)) timePart = timePart.replace(/^(\d{2})(\d{2})(\d{2})/, '$1:$2:$3');
        const rest = m[3] || '';
        const fixed = `${datePart}T${timePart}${rest}`;
        d = new Date(fixed); if (!isNaN(d.getTime())) return d;
      }
      const tIdx = s.indexOf('T');
      if (tIdx !== -1) {
        const head = s.slice(0, tIdx + 1);
        let tail = s.slice(tIdx + 1);
        tail = tail.replace(/[-\._]/g, ':');
        const digitsOnly = tail.match(/^(\d{6})(.*)$/);
        if (digitsOnly) tail = digitsOnly[1].replace(/^(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') + (digitsOnly[2] || '');
        d = new Date(head + tail); if (!isNaN(d.getTime())) return d;
      }
    } catch (e) {}
    return null;
  }

  // Helper to get check-in ISO timestamp (matches DTRSummary getCheckInIso)
  function getCheckInIso(entry) {
    if (!entry) return null;
    const candidates = [entry.checkIn, entry.check_in, entry.rawTimestamp, entry.timestamp, entry.raw_time, (entry.date && entry.time) ? `${entry.date}T${entry.time}` : null].filter(Boolean);
    for (const c of candidates) {
      try { const d = new Date(c); if (!isNaN(d.getTime())) return d.toISOString(); } catch (e) {}
    }
    return null;
  }

  // Helper to get check-out ISO timestamp (matches DTRSummary getCheckOutIso)
  function getCheckOutIso(entry) {
    if (!entry) return null;
    // Only return checkout if it came from an actual paired record (has rawRecords with both check-in and check-out)
    if (entry.rawRecords && entry.rawRecords.length === 2) {
      const hasCheckOut = entry.rawRecords.some(r => (r.type || '').toLowerCase() === 'check_out');
      if (hasCheckOut) {
        const candidates = [entry.checkOut, entry.checkOutTime, entry.check_out, entry.check_out_time, entry.checkOutTimestamp, entry.rawTimestampOut].filter(Boolean);
        for (const c of candidates) { try { const d = new Date(c); if (!isNaN(d.getTime())) return d.toISOString(); } catch (e) {} }
      }
    }
    return null;
  }

  useEffect(() => {
    let mounted = true;

    async function fetchUserStats() {
      setLoading(true);
      try {
        // Load all attendance data using firebaseService and pair records
        const allAttendance = await firebaseService.getAttendance();
        const normalizedAttendance = (allAttendance || []).map(normalizeAttendanceForUI);
        const pairedAttendance = pairAttendanceRecords(normalizedAttendance);
        
        // Load all users to get employee name
        const allUsers = await firebaseService.getEmployees();
        let name = '';
        if (allUsers && Array.isArray(allUsers)) {
          const user = allUsers.find(u => String(u.userId || u.facultyId || u.id) === String(uid));
          if (user) {
            name = user.name || user.fullName || user.employeeName || `User ${uid}`;
          }
        }
        if (!name) name = `User ${uid}`;
        if (mounted) setEmployeeName(name);

        // Load user's schedule
        let schedule = null;
        try {
          schedule = await scheduleService.getSchedule(uid);
        } catch (err) {
          console.warn('Could not load schedule for user:', err);
        }

        // Filter records for this user
        const userRecords = (pairedAttendance || []).filter(rec => {
          if (!rec) return false;
          const uidStr = String(uid);
          const recUser = String(rec.userId || rec.facultyId || '');
          return recUser === uidStr;
        });

        // Get schedule start time (default to 09:00)
        const scheduleStart = schedule?.scheduleStart || '09:00';
        const [scheduledHour, scheduledMin = 0] = scheduleStart.split(':').map(Number);
        const scheduledMins = scheduledHour * 60 + scheduledMin;

        // Normalize and compute late minutes per entry
        const normalized = userRecords.map(rec => {
          const checkInIso = getCheckInIso(rec);
          const checkOutIso = getCheckOutIso(rec);
          const timestamp = checkInIso || rec.timestamp || rec.date || null;
          const status = (rec.status || '').toString().toLowerCase();

          // Compute late minutes: calculate from check-in vs scheduled time
          let lateMinutes = 0;
          if (checkInIso) {
            const checkInDate = parseIsoLikeToDate(checkInIso);
            if (checkInDate && !isNaN(checkInDate.getTime())) {
              const checkInMins = checkInDate.getHours() * 60 + checkInDate.getMinutes();
              lateMinutes = Math.max(0, checkInMins - scheduledMins);
            }
          }

          return {
            timestamp,
            checkIn: checkInIso,
            checkOut: checkOutIso,
            status,
            lateMinutes,
            raw: rec
          };
        });

        // Merge schedule-tracking absences into recent records so they appear in the table
        // sort by newest first (we'll merge tracking entries then sort again)
        const merged = [...normalized];

        // Compute stats: count lates and sum late minutes (from attendance records)
        const lateEntries = normalized.filter(e => e.lateMinutes > 0);
        const totalLateMins = lateEntries.reduce((s, it) => s + (it.lateMinutes || 0), 0);

        // Fetch schedule tracking absences for this employee in a sensible date range
        let absenceCountFromSchedule = 0;
        try {
          const today = new Date();
          const endDate = today.toISOString().slice(0, 10);
          let startDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
          if (normalized.length > 0) {
            const parsedDates = normalized.map(r => {
              const d = new Date(r.timestamp || r.checkIn || null);
              return isNaN(d.getTime()) ? null : d;
            }).filter(Boolean);
            if (parsedDates.length > 0) {
              const minD = new Date(Math.min(...parsedDates.map(d => d.getTime())));
              startDate = minD;
            }
          }
          const startDateStr = startDate.toISOString().slice(0, 10);
          const tracking = await scheduleTrackingService.getEmployeeTrackingInRange(String(uid), startDateStr, endDate);

          // tracking is keyed by YYYYMMDD; for each absent tracking entry, add a synthetic record
          Object.entries(tracking || {}).forEach(([dateKey, t]) => {
            if (!t) return;
            const lab = String(t.label || '').toLowerCase();
            const col = String(t.color || '').toLowerCase();
            const isAbsent = lab.includes('absent') || col === 'red';
            if (!isAbsent) return;

            // derive a ISO-like timestamp for the dateKey (YYYYMMDD)
            const dateStr = `${dateKey.slice(0,4)}-${dateKey.slice(4,6)}-${dateKey.slice(6,8)}`;
            const timestamp = t.timestamp || `${dateStr}T00:00:00`;

            // avoid duplicates: skip if we already have an entry for the same date
            const hasEntryForDate = merged.some(e => {
              const d = new Date(e.timestamp || e.checkIn || null);
              if (isNaN(d.getTime())) return false;
              const dStr = d.toISOString().slice(0,10);
              return dStr === dateStr;
            });
            if (hasEntryForDate) return;

            merged.push({
              timestamp,
              checkIn: null,
              checkOut: null,
              // mark as synthetic absence so UI can render date but keep other fields blank
              status: '',
              syntheticAbsent: true,
              lateMinutes: 0,
              raw: t
            });
          });

          absenceCountFromSchedule = Object.values(tracking || {}).filter(t => {
            if (!t) return false;
            const lab = String(t.label || '').toLowerCase();
            const col = String(t.color || '').toLowerCase();
            return lab.includes('absent') || col === 'red';
          }).length;
        } catch (err) {
          // fallback: compute absences from paired attendance entries
          const absenceEntries = normalized.filter(e => e.status === 'absent');
          absenceCountFromSchedule = absenceEntries.length;
        }

        // Final sorting and set state
        merged.sort((a, b) => {
          const ta = new Date(a.timestamp || 0).getTime();
          const tb = new Date(b.timestamp || 0).getTime();
          return tb - ta;
        });

        if (!mounted) return;
        setEntries(merged);
        setCurrentPage(1);
        setStats({ totalRecords: merged.length, lateCount: lateEntries.length, totalLateMins, absenceCount: absenceCountFromSchedule });
      } catch (e) {
        console.error('Error fetching person DTR data:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchUserStats();
    return () => { mounted = false; };
  }, [uid]);

  // Filtering and pagination logic
  const filteredEntries = filter === 'absent'
    ? entries.filter(e => (e.syntheticAbsent === true) || (String(e.status || '').toLowerCase() === 'absent'))
    : entries;

  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE) || 1;
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEntries = filteredEntries.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const goToPage = (page) => {
    const pageNum = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNum);
  };

  // Helper to format timestamp to date (YYYY-MM-DD)
  function formatDate(ts) {
    if (!ts) return '—';
    const d = parseIsoLikeToDate(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' });
  }

  // Helper to format timestamp to time (HH:MM:SS AM/PM)
  function formatTime(ts) {
    if (!ts) return '—';
    const d = parseIsoLikeToDate(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{employeeName}</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">UID: {uid}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/dtr"
              className="inline-flex items-center gap-2 px-3 py-2 theme-btn rounded-md text-sm font-medium shadow"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to DTR
            </Link>
            {filter && (
              <button
                onClick={() => { setFilter(null); setCurrentPage(1); }}
                className="ml-2 px-2 py-1 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="relative p-4 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Records</div>
                <div className="text-3xl font-bold text-gray-900 mt-1">{stats.totalRecords}</div>
                <div className="text-xs text-gray-400 mt-1">Total attendance entries</div>
              </div>
              <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
            </div>

            <div className="relative p-4 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Late Count</div>
                <div className="text-3xl font-bold text-red-600 mt-1">{stats.lateCount}</div>
                <div className="text-xs text-gray-400 mt-1">Occurrences late</div>
              </div>
              <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
            </div>

            <div className="relative p-4 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Total Late Minutes</div>
                <div className="text-3xl font-bold text-gray-900 mt-1">{stats.totalLateMins}</div>
                <div className="text-xs text-gray-400 mt-1">Cumulative minutes</div>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => { setFilter(filter === 'absent' ? null : 'absent'); setCurrentPage(1); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setFilter(filter === 'absent' ? null : 'absent'); setCurrentPage(1); } }}
              className={`relative p-4 rounded-xl shadow-lg border border-gray-100 flex items-center justify-between cursor-pointer ${filter === 'absent' ? 'bg-indigo-50' : 'bg-white'}`}
            >
              <div>
                <div className="text-xs text-gray-500">Absence Count</div>
                <div className={`text-3xl font-bold mt-1 ${filter === 'absent' ? 'text-indigo-700' : 'text-red-600'}`}>{stats.absenceCount}</div>
                <div className="text-xs text-gray-400 mt-1">Click to filter</div>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recent Records</h3>
            {filter && (
              <div className="text-sm text-indigo-700 bg-indigo-50 px-2 py-1 rounded">Filtered: {filter}</div>
            )}
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : !filteredEntries.length ? (
            <div className="text-sm text-gray-500">No records found for this user.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Check-in Time</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Check-out Time</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Late Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{formatDate(r.timestamp || r.checkIn)}</td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{formatTime(r.checkIn)}</td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{r.checkOut ? formatTime(r.checkOut) : '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                            r.syntheticAbsent
                              ? 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300'
                              : (r.status === 'absent'
                                ? 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300'
                                : r.lateMinutes > 0
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300')
                          }`}>
                            {r.syntheticAbsent ? 'Absent' : (r.status === 'absent' ? 'Absent' : (r.lateMinutes > 0 ? 'Late' : 'On Time'))}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {r.status === 'absent' ? (
                            <span className="text-gray-500">—</span>
                          ) : r.lateMinutes > 0 ? (
                            <span className="text-red-600 dark:text-red-400">{r.lateMinutes}</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {[...Array(totalPages)].map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => goToPage(idx + 1)}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${
                          currentPage === idx + 1
                            ? 'pagination-current'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 pagination-page'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
