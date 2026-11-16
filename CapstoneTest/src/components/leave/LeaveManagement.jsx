import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { firebaseService } from '../../services/firebaseService';
import { approveLeave, denyLeave } from '../../services/leaveService';
import { auth } from '../../firebase';

import {
  Search,
  Download,
  CheckCircle,
  XCircle,
  FileText,
  Users,
  Eye,
  Filter,
  Calendar,
  User,
  Building,
  Clock,
  AlertCircle,
  Check,
  X,
  RefreshCw
} from "lucide-react";

const statusConfig = {
  Pending: {
    color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700",
    icon: Clock,
    label: "Pending Review"
  },
  Approved: {
    color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700",
    icon: CheckCircle,
    label: "Approved"
  },
  Denied: {
    color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700",
    icon: XCircle,
    label: "Denied"
  },
};

export default function LeaveManagement() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedReason, setSelectedReason] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [approverId, setApproverId] = useState('');

  // 🔁 Load from Firebase
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [all, usersList] = await Promise.all([
          firebaseService.getLeaveRequests(),
          firebaseService.getUsers(),
        ]);

        // build a quick lookup for users by facultyId/userId/id
        const usersMap = {};
        (usersList || []).forEach(u => {
          const keys = [u.facultyId, u.userId, u.id].filter(Boolean).map(String);
          keys.forEach(k => { if (k) usersMap[k] = u; });
        });
        setUsers(usersList || []);

        const normalizeSingle = (r) => {
          if (!r || typeof r !== 'object') return null;
          const id = r.id || r.requestId || (r && r._id) || '';
          const facultyId = r.facultyId || r.userId || '';
          let employeeName = r.employeeName || r.name || '';
          const employeeId = r.employeeId || r.userId || facultyId || '';
          const proofUrl = r.proofUrl || r.proofFile || r.proof || r.proofFileUrl || '';
          const proofBase64 = r.proofBase64 || r.proof_base64 || r.proofData || r.proof || null;

          let requestedAt = null;
          if (r.requestedAt) requestedAt = typeof r.requestedAt === 'number' ? r.requestedAt : Date.parse(r.requestedAt);
          else if (r.submittedAt) requestedAt = typeof r.submittedAt === 'number' ? r.submittedAt : Date.parse(r.submittedAt);
          else if (r.createdAt) requestedAt = typeof r.createdAt === 'number' ? r.createdAt : Date.parse(r.createdAt);

          const rawStatus = (r.status ?? r.state ?? r.statusText ?? '').toString().toLowerCase();
          let status = 'Pending';
          const isApproved = (
            r.approved === true || r.isApproved === true || r.approved === 'true' ||
            rawStatus === 'approved' || rawStatus.includes('approve') || rawStatus === 'accepted' || rawStatus === 'on_leave' || rawStatus === 'on leave'
          );
          if (isApproved) status = 'Approved';
          else if (rawStatus === 'rejected' || rawStatus === 'denied' || rawStatus === 'reject') status = 'Denied';
          else if (rawStatus === 'pending' || rawStatus === '') status = 'Pending';

          // fill missing employee info from users map when possible
          const userLookup = usersMap[String(facultyId)] || usersMap[String(employeeId)];
          if ((!employeeName || employeeName === '') && userLookup) {
            employeeName = userLookup.name || employeeName;
          }

          const departmentFromUser = (userLookup && (userLookup.department || userLookup.dept)) || '';

          return {
            id,
            facultyId,
            employeeName,
            employeeId,
            department: r.department || departmentFromUser || '',
            startDate: r.startDate || '',
            endDate: r.endDate || '',
            type: r.type || '',
            reason: r.reason || '',
            status,
            proofUrl,
            proofBase64,
            requestedAt: requestedAt || 0,
            decidedAt: r.decidedAt ? (typeof r.decidedAt === 'number' ? r.decidedAt : Date.parse(r.decidedAt)) : r.decidedAt || null,
            decisionComment: r.decisionComment || r.decision_reason || '',
            _raw: r,
          };
        };

        const list = (all || []).map(normalizeSingle).filter(Boolean).filter(n => n.status === 'Pending');

        if (!mounted) return;
        setPending(list);
      } catch (err) {
        alert('Failed to load leave requests.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => (mounted = false);
  }, []);

  useEffect(() => {
    try {
      if (auth && auth.currentUser) {
        setApproverId(auth.currentUser.uid || auth.currentUser.email || '');
      }
      const unsub = (auth && auth.onAuthStateChanged)
        ? auth.onAuthStateChanged(u => setApproverId(u ? (u.uid || u.email || '') : ''))
        : null;
      return () => { try { unsub && unsub(); } catch (e) {} };
    } catch (e) { /* ignore */ }
  }, []);

  const filteredAndSorted = useMemo(() => {
    let filtered = pending;

    // Apply search filter
    const q = query.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (p) =>
          (p.employeeName || "").toLowerCase().includes(q) ||
          (p.employeeId || "").toLowerCase().includes(q) ||
          (p.department || "").toLowerCase().includes(q)
      );
    }

    // Apply status filter
    if (filterStatus !== "all") {
      filtered = filtered.filter(p => p.status?.toLowerCase() === filterStatus);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return (b.requestedAt || 0) - (a.requestedAt || 0);
        case "oldest":
          return (a.requestedAt || 0) - (b.requestedAt || 0);
        case "name":
          return (a.employeeName || "").localeCompare(b.employeeName || "");
        case "department":
          return (a.department || "").localeCompare(b.department || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [pending, query, filterStatus, sortBy]);

  const handleDecision = async (request, decision) => {
    if (!request || !request.id) return;
    if (!window.confirm(`${decision === 'Approved' ? 'Approve' : 'Deny'} leave request ${request.id}?`)) return;

    const comment = decision === 'Denied' ? (window.prompt('Reason (optional):', '') || '') : '';
    setRefreshing(true);
    try {
      let res;
      if (decision === 'Approved') {
        res = await approveLeave({
          facultyId: request.facultyId || request.employeeId || request.userId,
          requestId: request.id,
          approverId,
          decisionComment: comment
        });
      } else {
        res = await denyLeave({
          facultyId: request.facultyId || request.employeeId || request.userId,
          requestId: request.id,
          approverId,
          decisionComment: comment
        });
      }

      if (!res || !res.success) {
        throw new Error(res && (res.reason || res.error) ? (res.reason || res.error) : 'Action failed');
      }

      // update UI
      setPending(p => p.filter(x => x.id !== request.id));
      window.alert(`Request ${decision}`);
    } catch (err) {
      window.alert('Failed: ' + String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenDocument = (url) => {
    if (!url) {
      alert('No document available.');
      return;
    }

    // Try to extract Google Drive file ID
    try {
      const fileIdMatch = url.match(/id=([^&]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        const fileId = fileIdMatch[1];
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        window.open(downloadUrl, '_blank');
        return;
      }
    } catch (err) {
      // ignore and fallback
    }

    // Fallback — open raw URL
    window.open(url, '_blank');
  };

  // 🔄 Refresh data from Firebase
  const refreshData = async () => {
    if (refreshing) return; // Prevent multiple simultaneous refreshes

    setRefreshing(true);
    try {
      const [all, usersList] = await Promise.all([
        firebaseService.getLeaveRequests(),
        firebaseService.getUsers(),
      ]);

      const usersMap = {};
      (usersList || []).forEach(u => {
        const keys = [u.facultyId, u.userId, u.id].filter(Boolean).map(String);
        keys.forEach(k => { if (k) usersMap[k] = u; });
      });

      const normalizeSingle = (r) => {
        if (!r || typeof r !== 'object') return null;
        const id = r.id || r.requestId || (r && r._id) || '';
        const facultyId = r.facultyId || r.userId || '';
        let employeeName = r.employeeName || r.name || '';
        const employeeId = r.employeeId || r.userId || facultyId || '';
        const proofUrl = r.proofUrl || r.proofFile || r.proof || r.proofFileUrl || '';

        let requestedAt = null;
        if (r.requestedAt) requestedAt = typeof r.requestedAt === 'number' ? r.requestedAt : Date.parse(r.requestedAt);
        else if (r.submittedAt) requestedAt = typeof r.submittedAt === 'number' ? r.submittedAt : Date.parse(r.submittedAt);
        else if (r.createdAt) requestedAt = typeof r.createdAt === 'number' ? r.createdAt : Date.parse(r.createdAt);

        const rawStatus = (r.status ?? r.state ?? r.statusText ?? '').toString().toLowerCase();
        let status = 'Pending';
        const isApproved = (
          r.approved === true || r.isApproved === true || r.approved === 'true' ||
          rawStatus === 'approved' || rawStatus.includes('approve') || rawStatus === 'accepted' || rawStatus === 'on_leave' || rawStatus === 'on leave'
        );
        if (isApproved) status = 'Approved';
        else if (rawStatus === 'rejected' || rawStatus === 'denied' || rawStatus === 'reject') status = 'Denied';
        else if (rawStatus === 'pending' || rawStatus === '') status = 'Pending';

        const userLookup = usersMap[String(facultyId)] || usersMap[String(employeeId)];
        if ((!employeeName || employeeName === '') && userLookup) {
          employeeName = userLookup.name || employeeName;
        }
        const departmentFromUser = (userLookup && (userLookup.department || userLookup.dept)) || '';

        return {
          id,
          facultyId,
          employeeName,
          employeeId,
          role: r.role || r.department || departmentFromUser || '', // Support both new role and legacy department
          startDate: r.startDate || '',
          endDate: r.endDate || '',
          type: r.type || '',
          reason: r.reason || '',
          status,
          proofUrl,
          requestedAt: requestedAt || 0,
          decidedAt: r.decidedAt ? (typeof r.decidedAt === 'number' ? r.decidedAt : Date.parse(r.decidedAt)) : r.decidedAt || null,
          decisionComment: r.decisionComment || r.decision_reason || '',
          _raw: r,
        };
      };

      const list = (all || []).map(normalizeSingle).filter(Boolean).filter(n => n.status === 'Pending');
      setPending(list);
      console.log(`✅ Refreshed data: ${list.length} pending requests loaded`);
    } catch (err) {
      console.error('❌ Failed to refresh leave requests:', err);
      alert('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const exportCSV = (rows = filteredAndSorted) => {
    if (!rows.length) return alert("No leaves to export.");
    const headers = [
      "ID",
      "Employee",
      "Department",
      "From",
      "To",
      "Type",
      "Reason",
      "Status",
      "Timestamp",
      "ProofUrl",
    ];
    const csv = [
      headers,
      ...rows.map((r) => [
        r.id,
        r.employeeName || r.employeeId || "",
        r.department || "",
        r.startDate || "",
        r.endDate || "",
        r.type || "",
        (r.reason || "").replace(/\r?\n/g, " "),
        r.status || "Pending",
        r.requestedAt ? new Date(r.requestedAt).toISOString() : "",
        r.proofUrl || "",
      ]),
    ]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaves_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    const total = pending.length;
    const today = pending.filter(r =>
      r.requestedAt && new Date(r.requestedAt).toDateString() === new Date().toDateString()
    ).length;

    return { total, today };
  }, [pending]);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white mb-2">Leave Management</h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">Manage and review leave requests</p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Pending</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Today's Requests</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.today}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">This Week</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                  {pending.filter(r => {
                    const requestDate = new Date(r.requestedAt);
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return requestDate >= weekAgo;
                  }).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Avg. Processing</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">2.3d</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="Search by name, ID, department..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search leave requests"
                />
              </div>
            </div>

            {/* Filters and Export */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                aria-label="Toggle filters"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={refreshData}
                disabled={refreshing}
                className={`approve-button flex items-center gap-2 px-4 py-3 border-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                  refreshing
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-50 dark:hover:bg-blue-900/30"
                }`}
                aria-label="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{refreshing ? "Refreshing..." : "Refresh"}</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => exportCSV()}
                className="reject-button flex items-center gap-2 px-4 py-3 border-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30"
                aria-label="Export to CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </motion.button>
            </div>
          </div>

          {/* Advanced Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-gray-200"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Sort By
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="name">Employee Name</option>
                      <option value="department">Department</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-100 dark:border-gray-700"
        >
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-white">
                  Pending Leave Requests
                </h2>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {filteredAndSorted.length} of {pending.length} requests
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden">
            {filteredAndSorted.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg">No pending requests</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSorted.map((r, index) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-800 dark:text-white">{r.employeeName || 'Unknown Employee'}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{r.employeeId}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusConfig[r.status || 'Pending'].color}`}>
                        {statusConfig[r.status || 'Pending'].label}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        <span>{r.role || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{r.startDate || ""} {r.endDate ? `→ ${r.endDate}` : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{r.type || "—"}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 mb-3">
                      {((r.proofBase64 && !String(r.proofBase64).toLowerCase().includes('application/pdf')) || (r.proofUrl && !String(r.proofUrl).toLowerCase().endsWith('.pdf'))) ? (
                        <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden border flex-shrink-0">
                          <img
                            src={r.proofBase64 ? r.proofBase64 : (r.proofUrl.includes('drive.google.com') ? 
                              (() => {
                                try {
                                  let fileId = '';
                                  if (r.proofUrl.includes('/file/d/')) {
                                    fileId = r.proofUrl.split('/file/d/')[1]?.split('/')[0];
                                  } else if (r.proofUrl.includes('id=')) {
                                    fileId = r.proofUrl.split('id=')[1]?.split('&')[0];
                                  } else if (r.proofUrl.includes('/uc?export=view&id=')) {
                                    fileId = r.proofUrl.split('id=')[1];
                                  }
                                  return fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : r.proofUrl;
                                } catch (err) {
                                  return r.proofUrl;
                                }
                              })() : r.proofUrl)}
                            alt="attachment"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                          />
                        </div>
                      ) : null}

                      <div className="flex-1">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{(r.reason && r.reason.length > 220) ? `${String(r.reason).slice(0,220)}...` : (r.reason || "—")}</p>
                        <div className="mt-2 flex items-center gap-2">
                          {(r.reason && r.reason.length > 220) && (
                            <button onClick={() => setSelectedReason(r.reason)} className="text-xs text-blue-600 hover:underline">Read more</button>
                          )}
                          {(r.proofBase64 || r.proofUrl) && (
                            <button onClick={(e) => { e.preventDefault(); const url = r.proofBase64 || r.proofUrl; if (r.proofBase64) setSelectedImage(r.proofBase64); else handleOpenDocument(url); }} className="text-xs text-blue-600 hover:underline">View Attachment</button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDecision(r, "Approved")}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
                        aria-label={`Approve leave request for ${r.employeeName}`}
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecision(r, "Denied")}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition font-medium text-sm"
                        aria-label={`Deny leave request for ${r.employeeName}`}
                      >
                        <X className="w-4 h-4" />
                        Deny
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left" role="table" aria-label="Leave requests table">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Employee</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Department</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Date Range</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Type</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Reason & Proof</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-gray-500">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      No pending requests
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((r, index) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{r.id}</td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.employeeName || 'Unknown Employee'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{r.employeeId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{r.department || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {(r.startDate || "") + (r.endDate ? ` → ${r.endDate}` : "")}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{r.type || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                        <div className="flex items-start gap-3">
                          {/* Thumbnail / document preview */}
                          {((r.proofBase64 && !String(r.proofBase64).toLowerCase().includes('application/pdf')) || (r.proofUrl && !String(r.proofUrl).toLowerCase().endsWith('.pdf'))) ? (
                            <div className="flex-shrink-0 w-20 h-20 bg-gray-100 rounded overflow-hidden border">
                              <img
                                src={r.proofBase64 ? r.proofBase64 : (r.proofUrl.includes('drive.google.com') ? 
                                  (() => {
                                    try {
                                      let fileId = '';
                                      if (r.proofUrl.includes('/file/d/')) {
                                        fileId = r.proofUrl.split('/file/d/')[1]?.split('/')[0];
                                      } else if (r.proofUrl.includes('id=')) {
                                        fileId = r.proofUrl.split('id=')[1]?.split('&')[0];
                                      } else if (r.proofUrl.includes('/uc?export=view&id=')) {
                                        fileId = r.proofUrl.split('id=')[1];
                                      }
                                      return fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : r.proofUrl;
                                    } catch (err) {
                                      console.error('Error parsing Google Drive URL for thumbnail:', err);
                                      return r.proofUrl;
                                    }
                                  })() : r.proofUrl)}
                                alt="attachment"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                              />
                            </div>
                          ) : (r.proofUrl ? (
                            <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center bg-gray-50 border rounded text-gray-500 text-xs">Document</div>
                          ) : null)}

                          <div className="flex-1">
                            <div className="text-sm text-gray-700 whitespace-pre-wrap break-words max-h-20 overflow-hidden">
                              {r.reason || "—"}
                            </div>

                            {/* Read more for long reasons */}
                            {(r.reason && String(r.reason).length > 220) && (
                              <div className="mt-2">
                                <button onClick={() => setSelectedReason(r.reason)} className="text-xs text-blue-600 hover:underline">Read more</button>
                              </div>
                            )}

                            {/* View button */}
                            {(r.proofBase64 || r.proofUrl) && (
                              <div className="mt-2">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const urlToOpen = r.proofBase64 || r.proofUrl;
                                    if (r.proofBase64) {
                                      setSelectedImage(r.proofBase64);
                                    } else {
                                      handleOpenDocument(urlToOpen);
                                    }
                                  }}
                                  className="inline-flex items-center gap-2 px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                  aria-label="View proof document"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>{(r.proofBase64 && String(r.proofBase64).toLowerCase().includes('application/pdf')) || (r.proofUrl && r.proofUrl.toLowerCase().endsWith('.pdf')) ? 'View PDF' : 'View Image'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDecision(r, "Approved")}
                            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            aria-label={`Approve leave request for ${r.employeeName}`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecision(r, "Denied")}
                            className="flex items-center gap-2 px-3 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition font-medium text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                            aria-label={`Deny leave request for ${r.employeeName}`}
                          >
                            <XCircle className="w-4 h-4" />
                            Deny
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Document Preview Modal */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedImage(null);
              }}
            >
              <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl max-h-[90vh] w-full overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Supporting Document Preview</h3>
                  <button
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setSelectedImage(null)}
                    aria-label="Close preview"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-auto max-h-[calc(90vh-8rem)]">
                  {/* Removed raw Document URL display to avoid showing large base64 text; render preview only */}
                  {String(selectedImage).toLowerCase().endsWith('.pdf') || String(selectedImage).startsWith('data:application/pdf') ? (
                    <div className="min-h-[500px] flex flex-col items-center justify-center">
                      <iframe
                        src={selectedImage}
                        className="w-full h-[70vh] border-0 rounded"
                        title="PDF Document"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <div className="relative w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                        <img
                          src={String(selectedImage).includes('drive.google.com') ? 
                            (() => {
                              try {
                                // Handle different Google Drive URL formats
                                let fileId = '';
                                if (selectedImage.includes('/file/d/')) {
                                  fileId = selectedImage.split('/file/d/')[1]?.split('/')[0];
                                } else if (selectedImage.includes('id=')) {
                                  fileId = selectedImage.split('id=')[1]?.split('&')[0];
                                } else if (selectedImage.includes('/uc?export=view&id=')) {
                                  fileId = selectedImage.split('id=')[1];
                                }
                                return fileId ? `https://drive.google.com/uc?export=view&id=${fileId}` : selectedImage;
                              } catch (err) {
                                console.error('Error parsing Google Drive URL:', err);
                                return selectedImage;
                              }
                            })() : 
                            selectedImage}
                          alt="Supporting document"
                          className="max-w-full max-h-[70vh] w-auto h-auto object-contain"
                          onError={(e) => {
                            console.error('Image failed to load:', selectedImage);
                            e.target.onerror = null;
                            alert('Failed to load image. Please try again.');
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Reason Preview Modal */}
        <AnimatePresence>
          {selectedReason && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setSelectedReason(null); }}
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 overflow-auto max-h-[80vh]">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Full Reason / Comment</h3>
                  <button onClick={() => setSelectedReason(null)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white rounded p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="prose prose-sm dark:prose-invert text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                  {selectedReason}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
