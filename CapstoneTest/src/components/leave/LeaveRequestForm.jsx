// inside your imports...
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, FileText, Upload, Send, CheckCircle, AlertCircle, Clock, Eye, X } from 'lucide-react';
import { database, dbRef } from '../../firebase';
import { firebaseService } from '../../services/firebaseService';
import { LEAVE_TYPES, getLeaveBalance } from '../../services/leaveService';
import { push, ref, set } from 'firebase/database';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import useAuth from '../../contexts/authcontext';
import { formatDate } from '../../utils/dateUtils';

// ✅ Toast component same as yours...
// ... no change

// Small Toast component used by this form (keeps file self-contained)
const Toast = ({ message, type = 'info', onClose }) => {
  const bgColor = ({ success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' }[type] || 'bg-blue-500');
  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      className={`fixed top-4 right-4 z-50 flex items-center ${bgColor} text-white px-6 py-4 rounded-lg shadow-lg`}
    >
      <span className="mr-4">{message}</span>
      <button onClick={onClose} className="ml-auto hover:text-gray-200 transition-colors" aria-label="Close notification">✕</button>
    </motion.div>
  );
};

const LeaveRequestForm = () => {
  const { user } = useAuth();
  const facultyId = user?.id || 'bayani004';
  const facultyName = user?.name || 'Bayani';

  // ✅ states
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES.SICK.id);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [reason, setReason] = useState('');
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [proofFile, setProofFile] = useState(null);
  const [preview, setPreview] = useState(null); // image/pdf preview
  const [uploadedProofUrl, setUploadedProofUrl] = useState('');
  const [proofBase64, setProofBase64] = useState(null); // full data URL for storage/viewing (client-side base64)
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [leaveRequests, setLeaveRequests] = useState([]);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  // ✅ removed setProofPreview + setProofMeta since not used

  // Toast handler
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // ✅ Fetch leave balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!user?.userId || !leaveType) return;
      setLoadingBalance(true);
      try {
        const balance = await getLeaveBalance(user.userId, leaveType);
        setLeaveBalance(balance);
      } catch (error) {
        console.error('Error fetching leave balance:', error);
        setError('Failed to fetch leave balance');
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchBalance();
  }, [user?.userId, leaveType]);

  // ✅ Load user requests
  useEffect(() => {
    let mounted = true;
    const loadUserLeaveRequests = async () => {
      if (!user?.userId) {
        setLoadingRequests(false);
        return;
      }
      try {
        const all = await firebaseService.getLeaveRequests();
        const mine = (all || []).filter(r => String(r.userId) === String(user.userId));
        mine.sort((a, b) => (b.requestedAt || b.createdAt || 0) - (a.requestedAt || a.createdAt || 0));
        if (mounted) setLeaveRequests(mine);
      } catch (error) {
        setError('Failed to load leave requests');
      } finally {
        if (mounted) setLoadingRequests(false);
      }
    };
    loadUserLeaveRequests();
    return () => (mounted = false);
  }, [user?.userId]);

  // ✅ file change + upload to App Script
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select an image (JPG, PNG, GIF) or PDF file');
      return;
    }

    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        // reader.result is a data URL (e.g. data:image/png;base64,AAA...)
        setPreview(file.type.startsWith('image/') ? reader.result : null);
        setProofBase64(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
      setProofBase64(null);
    }

    setProofFile(file);
    setError('');
  };

  // ✅ fixed handleSubmit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      if (!dateRange.from || !dateRange.to) {
        setError("Please select a date range");
        return;
      }
      if (new Date(dateRange.from) > new Date(dateRange.to)) {
        setError("Start date cannot be after end date");
        return;
      }
      if (!reason.trim()) {
        setError("Please provide a reason for your leave");
        return;
      }
      if (!user?.userId) {
        setError("User not authenticated. Please log in again.");
        return;
      }

      // We now store the proof as a base64 data URL in the record (client-side)
      // proofBase64 contains the full data URL (or null)
      const proofUrl = ''; // kept for compatibility with UI which expects a URL optionally
      const proofBase64Payload = proofBase64 || null;

      const leaveRequestRef = push(ref(database, dbRef(`leaveRequests/${facultyId}`)));
      const newRequest = {
        userId: user.userId,
        employeeId: user.id || user.userId,
        employeeName: user.name || '',
        type: leaveType.toLowerCase().replace(' ', '_'),
        status: 'pending',
        startDate: dateRange.from,
        endDate: dateRange.to,
        reason: reason.trim(),
  proofUrl: proofUrl,
  proofBase64: proofBase64Payload,
        submittedAt: new Date().toISOString(),
        decidedAt: null,
        decisionComment: ''
      };

      console.log('Submitting leave request:', newRequest);
      await set(leaveRequestRef, newRequest);

      setLeaveRequests(prev => [{ id: leaveRequestRef.key, ...newRequest }, ...prev]);
      setSubmitted(true);

      // reset form
      setLeaveType(LEAVE_TYPES.SICK.id);
      setDateRange({ from: '', to: '' });
      setReason('');
      setProofFile(null);
      setPreview(null);
      setUploadedProofUrl('');

      showToast('Leave request submitted successfully!', 'success');
    } catch (error) {
      console.error('Submission error:', error);
      showToast('Failed to submit leave request: ' + error.message, 'error');
    } finally {
      setLoadingSubmit(false);
      setSubmitting(false);
    }
  };

  // ✅ rest of component unchanged...
  // UI form, preview, requests list (adapted from bundle)
  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Leave Request</h1>
          <p className="text-gray-600 text-lg">Submit your leave request with ease</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100"
            >
              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-6" role="alert" aria-live="polite">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3" htmlFor="leave-type">Leave Type</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      id="leave-type"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition text-gray-700 font-medium"
                      aria-describedby="leave-type-desc"
                      disabled={loadingRequests || loadingSubmit}
                    >
                      {Object.values(LEAVE_TYPES).map((lt) => (
                        <option key={lt.id} value={lt.id}>{lt.name} ({leaveBalance !== null ? `${leaveBalance} days remaining` : 'Loading...'})</option>
                      ))}
                    </select>
                    <p id="leave-type-desc" className="sr-only">Select the type of leave you are requesting</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Date Range</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="date" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          min={(leaveType === LEAVE_TYPES.SICK.id || leaveType === LEAVE_TYPES.EMERGENCY.id) ? undefined : new Date().toISOString().split('T')[0]} required disabled={loadingRequests || loadingSubmit} />
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="date" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                        className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        min={ (leaveType === LEAVE_TYPES.SICK.id || leaveType === LEAVE_TYPES.EMERGENCY.id) ? undefined : (dateRange.from || new Date().toISOString().split('T')[0]) } required />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3" htmlFor="leave-reason">Reason</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-4 w-5 h-5 text-gray-400" />
                    <textarea id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Please provide a detailed reason for your leave request..."
                      className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" rows="4" required />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3" htmlFor="proof-file">Supporting Documentation - Optional</label>
                  <div className="relative">
                    <input type="file" id="proof-file" onChange={handleFileChange} accept="image/*,.pdf" className="hidden" />
                    <label htmlFor="proof-file" className="w-full flex items-center justify-center px-6 py-4 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-red-500 transition-colors">
                      <div className="flex items-center gap-3">
                        <Upload className="w-6 h-6 text-gray-400" />
                        <span className="text-gray-600">{proofFile ? 'Change file' : 'Upload supporting document'}</span>
                      </div>
                    </label>
                    {proofFile && (
                      <div className="mt-3 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-500" />
                        <span className="text-sm text-gray-600 truncate">{proofFile.name}</span>
                        <button type="button" onClick={() => { setProofFile(null); setPreview(null); setUploadedProofUrl(''); }} className="ml-auto text-red-500 hover:text-red-700"><X className="w-5 h-5" /></button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">Upload medical certificate or other supporting documents (PDF or images)</p>
                </div>

                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} type="submit" disabled={submitting}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-red-600 text-red-600 dark:text-red-400 dark:border-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 dark:border-red-400" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit Request</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.form>
          </div>

          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 mb-6">My Leave Requests</h2>
              {loadingRequests ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto" />
                  <p className="text-gray-600 mt-2">Loading requests...</p>
                </div>
              ) : leaveRequests.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No leave requests found.</p>
              ) : (
                <div className="space-y-4">
                  {leaveRequests.map((req, idx) => (
                    <motion.div key={req.id || idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * idx }} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{req.type}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${req.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' : req.status === 'denied' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`} role="status" aria-label={`Request status: ${req.status}`}>{(req.status || '').charAt(0).toUpperCase() + (req.status || '').slice(1)}</span>
                      </div>
                      <p className="text-gray-600 mb-2"><Calendar className="w-4 h-4 inline mr-2" />{req.startDate} {req.endDate !== req.startDate ? `to ${req.endDate}` : ''}</p>
                      <p className="text-gray-600 mb-2 text-sm"><Clock className="w-4 h-4 inline mr-2" />{req.reason}</p>
                      {req.proofUrl && (
                        <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded flex items-center justify-between">
                          <div><strong>Documentation:</strong> Supporting Document</div>
                          <button onClick={() => {
                            try {
                              if (req.proofUrl && String(req.proofUrl).startsWith('http')) {
                                window.open(req.proofUrl, '_blank');
                              } else if (req.proofBase64) {
                                // open base64 data URL in new window/tab
                                const w = window.open('about:blank');
                                if (w) {
                                  w.document.write(`<iframe src="${req.proofBase64}" frameborder="0" style="width:100%;height:100%"></iframe>`);
                                  w.document.close();
                                } else {
                                  alert('Popup blocked: enable popups to view document');
                                }
                              } else if (req.proofUrl) {
                                window.open(req.proofUrl, '_blank');
                              } else {
                                alert('No proof document available');
                              }
                            } catch (err) { alert('Failed to open proof image'); }
                          }} className="ml-2 p-1 text-red-600 hover:text-red-800 transition-colors" title="View document"><Eye className="w-4 h-4" /></button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Requested on {formatDate(req.requestedAt || req.createdAt)}</p>
                      {req.decisionComment && <p className="text-xs text-gray-700 mt-1 p-2 bg-gray-50 rounded"><strong>Comment:</strong> {req.decisionComment}</p>}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
