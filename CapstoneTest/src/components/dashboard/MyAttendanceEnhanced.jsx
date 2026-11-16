import React, { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { database } from "../../firebase";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  CalendarDays,
  Timer,
  UserCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

const MyAttendanceEnhanced = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalDays: 0,
    presentDays: 0,
    lateDays: 0,
    onTimePercentage: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    const auth = getAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !user.email || typeof user.email !== 'string') {
        setRecords([]);
        setUserInfo(null);
        setLoading(false);
        return;
      }

      const username = user.email.split("@")[0];
      setUserInfo({
        email: user.email,
        username: username,
        displayName: user.displayName || username
      });

      const userRef = ref(database, `attendance/${username}`);

      const unsubscribeDB = onValue(userRef, (snapshot) => {
        try {
          const data = snapshot.val();
          const userRecords = [];

          if (data) {
            for (const key in data) {
              if (["faculty_name", "department", "role", "profile_picture"].includes(key)) continue;
              const record = data[key];
              userRecords.push({
                id: key,
                check_in: record.check_in,
                check_out: record.check_out,
                status: record.status,
                date: record.date || record.check_in?.split('T')[0],
              });
            }
          }

          userRecords.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
          setRecords(userRecords);

          // Calculate statistics
          const totalDays = userRecords.length;
          const presentDays = userRecords.filter(r => r.status === 'present').length;
          const lateDays = userRecords.filter(r => r.status === 'late').length;
          const onTimePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

          setStats({
            totalDays,
            presentDays,
            lateDays,
            onTimePercentage
          });

          setLoading(false);
        } catch (err) {
          console.error('Error processing attendance data:', err);
          setError('Failed to load attendance data');
          setLoading(false);
        }
      }, (error) => {
        console.error('Database error:', error);
        setError('Failed to connect to database');
        setLoading(false);
      });

      // Clean up the DB listener
      return () => unsubscribeDB();
    });

    // Clean up auth listener
    return () => unsubscribeAuth();
  }, []);

  const filteredRecords = React.useMemo(() => {
    let filtered = records;

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        record.check_in?.toLowerCase().includes(search) ||
        record.check_out?.toLowerCase().includes(search) ||
        record.status?.toLowerCase().includes(search) ||
        record.date?.includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(record => record.status === statusFilter);
    }

    return filtered;
  }, [records, searchTerm, statusFilter]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'late':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-blue-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  };

  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No records to export');
      return;
    }

    const headers = ['Date', 'Check In', 'Check Out', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(record => [
        `"${record.date || formatDate(record.check_in).date}"`,
        `"${record.check_in || ''}"`,
        `"${record.check_out || ''}"`,
        `"${record.status || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
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
        <div className="max-w-4xl mx-auto">
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
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">My Attendance</h1>
          <p className="text-gray-600 text-lg">Track your daily attendance records</p>
          {userInfo && (
            <p className="text-sm text-gray-500 mt-2">
              Welcome back, {userInfo.displayName}
            </p>
          )}
        </motion.div>

        {/* Statistics Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Days</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalDays}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-gray-500">All records</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Present</p>
                <p className="text-2xl font-bold text-green-600">{stats.presentDays}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-green-600 flex items-center">
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                    On-time record
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Late Arrivals</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.lateDays}</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-yellow-600 flex items-center">
                    <ArrowDownRight className="w-3 h-3 mr-1" />
                    Needs improvement
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">On-Time Rate</p>
                <p className="text-2xl font-bold text-purple-600">{stats.onTimePercentage}%</p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-purple-600">Performance metric</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by date, time, or status..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search attendance records"
                />
              </div>
            </div>

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
                <span className="hidden sm:inline">Export</span>
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
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                </select>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Attendance Records */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
        >
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCheck className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-800">Attendance Records</h2>
              </div>
              <div className="text-sm text-gray-600">
                {filteredRecords.length} of {records.length} records
              </div>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No attendance records found</p>
              <p className="text-gray-400 text-sm">Your attendance records will appear here</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block sm:hidden">
                <div className="divide-y divide-gray-200">
                  {filteredRecords.slice(0, 10).map((record, index) => {
                    const formatted = formatDate(record.check_in);
                    const checkoutFormatted = record.check_out ? formatDate(record.check_out) : null;

                    return (
                      <motion.div
                        key={record.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(record.status)}
                            <div>
                              <p className="font-semibold text-gray-800">{formatted.date}</p>
                              <p className="text-sm text-gray-600">{record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                            {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>Check-in: {formatted.time}</span>
                          </div>
                          {checkoutFormatted && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>Check-out: {checkoutFormatted.time}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left" role="table" aria-label="Attendance records table">
                  <thead>
                    <tr className="border-b-2 border-gray-200 bg-gray-50">
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check In</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check Out</th>
                      <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.slice(0, 10).map((record, index) => {
                      const formatted = formatDate(record.check_in);
                      const checkoutFormatted = record.check_out ? formatDate(record.check_out) : null;

                      return (
                        <motion.tr
                          key={record.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-800">{formatted.date}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{formatted.time}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {checkoutFormatted ? checkoutFormatted.time : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                              {getStatusIcon(record.status)}
                              {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {filteredRecords.length > 10 && (
            <div className="p-4 bg-gray-50 text-center border-t border-gray-200">
              <p className="text-gray-600 text-sm">
                Showing 10 most recent records out of {filteredRecords.length} total
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default MyAttendanceEnhanced;
