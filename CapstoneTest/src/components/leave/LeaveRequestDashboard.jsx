import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Filter, Search, Check, X, RefreshCcw, Clock } from 'lucide-react';
import { firebaseService } from '../../services/firebaseService';
import { LEAVE_TYPES, LEAVE_STATUS, approveLeave, denyLeave } from '../../services/leaveService';
import { formatDate } from '../../utils/dateUtils';

const LeaveRequestDashboard = () => {
  // State for leave requests and filters
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: '',
    dateRange: {
      from: '',
      to: ''
    }
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'submittedAt',
    direction: 'desc'
  });

  // Load leave requests
  useEffect(() => {
    const loadLeaveRequests = async () => {
      setLoading(true);
      try {
        const requests = await firebaseService.getLeaveRequests();
        setLeaveRequests(requests);
        setError(null);
      } catch (err) {
        setError('Failed to load leave requests');
        console.error('Error loading leave requests:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLeaveRequests();
  }, []);

  // Filter and sort leave requests
  const filteredRequests = leaveRequests
    .filter(request => {
      // Status filter
      if (filters.status !== 'all' && request.status !== filters.status) {
        return false;
      }

      // Type filter
      if (filters.type !== 'all' && request.type !== filters.type) {
        return false;
      }

      // Date range filter
      if (filters.dateRange.from && new Date(request.startDate) < new Date(filters.dateRange.from)) {
        return false;
      }
      if (filters.dateRange.to && new Date(request.endDate) > new Date(filters.dateRange.to)) {
        return false;
      }

      // Search filter (check employee name or ID)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          request.employeeName?.toLowerCase().includes(searchLower) ||
          request.employeeId?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  // Handle request approval
  const handleApprove = async (request) => {
    try {
      const result = await approveLeave({
        facultyId: request.employeeId,
        requestId: request.id,
        approverId: 'HR_ADMIN', // TODO: Get from auth context
        decisionComment: ''
      });

      if (result.success) {
        // Update local state
        setLeaveRequests(prev => prev.map(r => 
          r.id === request.id ? { ...r, status: LEAVE_STATUS.APPROVED } : r
        ));
      } else {
        throw new Error(result.error || 'Failed to approve request');
      }
    } catch (error) {
      setError('Failed to approve request: ' + error.message);
    }
  };

  // Handle request denial
  const handleDeny = async (request) => {
    try {
      const result = await denyLeave({
        facultyId: request.employeeId,
        requestId: request.id,
        approverId: 'HR_ADMIN', // TODO: Get from auth context
        decisionComment: ''
      });

      if (result.success) {
        // Update local state
        setLeaveRequests(prev => prev.map(r => 
          r.id === request.id ? { ...r, status: LEAVE_STATUS.REJECTED } : r
        ));
      } else {
        throw new Error(result.error || 'Failed to deny request');
      }
    } catch (error) {
      setError('Failed to deny request: ' + error.message);
    }
  };

  // Handle sort change
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case LEAVE_STATUS.APPROVED.toLowerCase():
        return 'bg-green-100 text-green-800 border-green-200';
      case LEAVE_STATUS.REJECTED.toLowerCase():
        return 'bg-red-100 text-red-800 border-red-200';
      case LEAVE_STATUS.PENDING.toLowerCase():
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Leave Requests</h1>
            <p className="mt-1 text-sm text-gray-500">Manage and process employee leave requests</p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Search by name or ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 appearance-none bg-none"
              >
                <option value="all">All Status</option>
                <option value={LEAVE_STATUS.PENDING}>Pending</option>
                <option value={LEAVE_STATUS.APPROVED}>Approved</option>
                <option value={LEAVE_STATUS.REJECTED}>Rejected</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="relative">
              <Filter className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select
                value={filters.type}
                onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 appearance-none bg-none"
              >
                <option value="all">All Types</option>
                {Object.values(LEAVE_TYPES).map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Calendar className="h-5 w-5 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={filters.dateRange.from}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, from: e.target.value }
                  }))}
                  className="w-full pl-9 pr-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div className="relative">
                <Calendar className="h-5 w-5 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={filters.dateRange.to}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, to: e.target.value }
                  }))}
                  className="w-full pl-9 pr-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Leave Requests Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('employeeName')}
                  >
                    Employee
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('type')}
                  >
                    Leave Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('startDate')}
                  >
                    Date Range
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <Clock className="h-5 w-5 text-gray-400 animate-spin mr-2" />
                        <span>Loading requests...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                      No leave requests found
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request, idx) => (
                    <motion.tr
                      key={request.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{request.employeeName}</div>
                        <div className="text-sm text-gray-500">{request.employeeId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {Object.values(LEAVE_TYPES).find(t => t.id === request.type)?.name || request.type}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(request.startDate)}
                          {request.startDate !== request.endDate && ` - ${formatDate(request.endDate)}`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {request.status === LEAVE_STATUS.PENDING && (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleApprove(request)}
                              className="inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                              title="Approve request"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeny(request)}
                              className="inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              title="Deny request"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LeaveRequestDashboard;