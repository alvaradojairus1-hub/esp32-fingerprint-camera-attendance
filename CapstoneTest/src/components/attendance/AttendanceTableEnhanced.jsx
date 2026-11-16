import { useEffect, useState, useMemo } from 'react';
import { database } from '../../firebase';
import { ref, get, child } from 'firebase/database';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Calendar,
  User,
  Building
} from 'lucide-react';

const AttendanceTableEnhanced = () => {
  const [attendance, setAttendance] = useState([]);
  const [queryText, setQueryText] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);

  const perPage = 10;

  useEffect(() => {
    setLoading(true);
    setError(null);

    const dbRef = ref(database);
    get(child(dbRef, 'attendance'))
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const loadedAttendance = [];

          Object.values(data).forEach((facultyEntries) => {
            Object.values(facultyEntries).forEach((entry) => {
              // Filter out entries with missing or empty faculty_name, check_in, check_out, and status
              const facultyName = entry.faculty_name && entry.faculty_name.trim() !== '' ? entry.faculty_name : null;
              const checkIn = entry.check_in && entry.check_in.trim() !== '' ? entry.check_in : null;
              const checkOut = entry.check_out && entry.check_out.trim() !== '' ? entry.check_out : null;
              const statusRaw = entry.status && entry.status.trim() !== '' ? entry.status : null;
              const status = statusRaw ? statusRaw.replace('_', ' ') : null;

              if (facultyName && checkIn && checkOut && status) {
                loadedAttendance.push({
                  faculty_name: facultyName,
                  check_in: checkIn,
                  check_out: checkOut,
                  status: status,
                  employeeId: entry.employeeId || '',
                  department: entry.department || '',
                });
              }
            });
          });

          // Sort by latest check-in time (optional)
          loadedAttendance.sort((a, b) => {
            return new Date(b.check_in) - new Date(a.check_in);
          });

          setAttendance(loadedAttendance);
        } else {
          setAttendance([]);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching attendance from Firebase:', error);
        setError(error.message);
        setLoading(false);
      });
  }, []);

  const filteredAndSorted = useMemo(() => {
    let filtered = attendance;

    // Apply search filter
    const q = queryText.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (entry) =>
          (entry.faculty_name || '').toLowerCase().includes(q) ||
          (entry.check_in || '').toLowerCase().includes(q) ||
          (entry.check_out || '').toLowerCase().includes(q) ||
          (entry.status || '').toLowerCase().includes(q) ||
          (entry.employeeId || '').toLowerCase().includes(q) ||
          (entry.department || '').toLowerCase().includes(q)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.status.toLowerCase() === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.check_in) - new Date(a.check_in);
        case 'oldest':
          return new Date(a.check_in) - new Date(b.check_in);
        case 'name':
          return (a.faculty_name || '').localeCompare(b.faculty_name || '');
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [attendance, queryText, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / perPage));
  const pageItems = filteredAndSorted.slice((page - 1) * perPage, page * perPage);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter(a => a.status.toLowerCase() === 'present').length;
    const late = attendance.filter(a => a.status.toLowerCase() === 'late').length;
    const onLeave = attendance.filter(a => a.status.toLowerCase() === 'on leave').length;

    return { total, present, late, onLeave };
  }, [attendance]);

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'present':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'late':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'on leave':
        return <Clock className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'on leave':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const exportToCSV = () => {
    if (filteredAndSorted.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Faculty Name', 'Employee ID', 'Department', 'Check In', 'Check Out', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredAndSorted.map(entry => [
        `"${entry.faculty_name}"`,
        `"${entry.employeeId}"`,
        `"${entry.department}"`,
        `"${entry.check_in}"`,
        `"${entry.check_out}"`,
        `"${entry.status}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-white rounded-lg shadow"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-lg shadow"></div>
              ))}
            </div>
            <div className="h-96 bg-white rounded-lg shadow"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Real-Time Attendance</h1>
          <p className="text-gray-600 text-lg">Monitor and track employee attendance</p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Present</p>
                <p className="text-2xl font-bold text-green-600">{stats.present}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Late</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.late}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">On Leave</p>
                <p className="text-2xl font-bold text-blue-600">{stats.onLeave}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, ID, department, or status..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition text-sm sm:text-base"
                  value={queryText}
                  onChange={(e) => {
                    setQueryText(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Search attendance records"
                />
              </div>
            </div>

            {/* Filters and Export */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Toggle filters"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-3 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Export to CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </motion.button>
            </div>
          </div>

          {/* Advanced Filters */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: showFilters ? 1 : 0,
              height: showFilters ? "auto" : 0
            }}
            className="mt-4 pt-4 border-t border-gray-200 overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="on leave">On Leave</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="status">Status</option>
                </select>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
        >
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">
                  Attendance Records
                </h2>
              </div>
              <div className="text-sm text-gray-600">
                {filteredAndSorted.length} of {attendance.length} records
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden">
            <div className="divide-y divide-gray-200">
              {pageItems.map((entry, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800">{entry.faculty_name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(entry.status)}`}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(entry.status)}
                        {entry.status}
                      </div>
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>{entry.employeeId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      <span>{entry.department || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{entry.check_in}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{entry.check_out}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left" role="table" aria-label="Attendance records table">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Employee</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Department</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check In</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check Out</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length > 0 ? (
                  pageItems.map((entry, index) => (
                    <motion.tr
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-800">{entry.faculty_name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.employeeId}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.department || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.check_in}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.check_out}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(entry.status)}`}>
                          {getStatusIcon(entry.status)}
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </span>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-gray-500">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      No attendance data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-xl shadow-lg p-6 border border-gray-100"
          >
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * perPage + 1} - {Math.min(page * perPage, filteredAndSorted.length)} of {filteredAndSorted.length} entries
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Prev</span>
              </motion.button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  if (pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        page === pageNum
                          ? 'bg-red-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                      aria-label={`Go to page ${pageNum}`}
                      aria-current={page === pageNum ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition flex items-center gap-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AttendanceTableEnhanced;
