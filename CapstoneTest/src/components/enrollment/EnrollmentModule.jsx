    import React, { useState, useEffect, useCallback } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import {
        Users,
        Clock,
        CheckCircle,
        XCircle,
        Save,
        User,
        Mail,
        Building,
        Briefcase,
        DollarSign,
        FileText,
        Camera,
        AlertCircle,
        RefreshCw,
        Filter,
        Eye,
        Download,
        TrendingUp,
        Activity,
        Fingerprint,
        UserPlus
    } from 'lucide-react';

    import { format } from 'date-fns';
    import { ref, onValue, update } from 'firebase/database';
    import { database, dbRef } from '../../firebase';
    import {
        getPendingEnrollments,
        assignFingerprintToExistingUser,
        rejectEnrollment,
        getActiveUsers,
        getPendingFingerprintIds,
        onPendingEnrollments,
        updatePendingEnrollment
    } from '../../services/enrollmentService';
    import { callApproveEnrollment } from '../../services/callableService';

    const statusConfig = {
        pending: {
            color: "bg-yellow-100 text-yellow-800 border-yellow-200",
            icon: Clock,
            label: "Pending Review"
        },
        approved: {
            color: "bg-green-100 text-green-800 border-green-200",
            icon: CheckCircle,
            label: "Approved"
        },
        rejected: {
            color: "bg-red-100 text-red-800 border-red-200",
            icon: XCircle,
            label: "Rejected"
        }
    };

    const containerVariants = {
        hidden: { opacity: 0, y: -8 },
        enter: { opacity: 1, y: 0, transition: { staggerChildren: 0.03 } },
        exit: { opacity: 0, y: -6 }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
        exit: { opacity: 0, y: -8, transition: { duration: 0.14 } }
    };

    const EnrollmentModule = () => {
        const [pendingEnrollments, setPendingEnrollments] = useState([]);
        const [activeUsers, setActiveUsers] = useState([]);
        const [loading, setLoading] = useState(false);
        const [isUploading, setIsUploading] = useState(false);
        const [selectedFingerprint, setSelectedFingerprint] = useState(null);
        // allow selecting multiple pending fingerprints (up to 4) as backups
        const [selectedFingerprints, setSelectedFingerprints] = useState([]);
        // index of the grouped pending batch currently selected (groups of 4)
    const [selectedGroupIndex, setSelectedGroupIndex] = useState(null);
        const [enrollmentType, setEnrollmentType] = useState('new'); // 'new' or 'existing'
        const [selectedUserId, setSelectedUserId] = useState('');
        const [roles, setRoles] = useState([]);
    const [formData, setFormData] = useState({
            firstName: '',
            lastName: '',
            email: '',
            password: '',
            profilePicture: ''
        });


        // Note: work schedule moved to Department settings. Enrollment no longer edits schedules.

        useEffect(() => {
            // Import firebaseService and fetch roles
            import('../../services/firebaseService').then(({ firebaseService }) => {
                const fetchRoles = async () => {
                    try {
                        const fetchedRoles = await firebaseService.getRoles();
                        if (fetchedRoles && Array.isArray(fetchedRoles)) {
                            console.log('Fetched roles:', fetchedRoles);
                            setRoles(fetchedRoles);
                        } else {
                            console.warn('No roles found or invalid format:', fetchedRoles);
                            setRoles([]);
                        }
                    } catch (error) {
                        console.error('Failed to fetch roles:', error);
                        setRoles([]);
                    }
                };
                fetchRoles();
            }).catch(err => {
                console.error('Failed to import firebaseService:', err);
                setRoles([]);
            });

            // subscribe to realtime pending enrollments using service helper
            const unsubPend = onPendingEnrollments((entries) => {
                setPendingEnrollments(entries || []);
            });

            // keep a users listener for active users
            const usersRef = ref(database, dbRef('users'));
            const unsubscribeUsers = onValue(usersRef, (snap) => {
                const val = snap.exists() ? snap.val() : {};
                const list = Object.entries(val || {})
                    .filter(([_, u]) => u && (u.status === 'active' || typeof u.status === 'undefined'))
                    .map(([userId, user]) => ({
                        userId,
                        name: user.name || user.fullName || user.employeeName || '',
                        email: user.email || user.employeeEmail || '',
                        department: user.department || '',
                    }));
                setActiveUsers(list);
            });

            return () => {
                try { unsubPend && unsubPend(); } catch (e) { /* ignore */ }
                try { unsubscribeUsers && unsubscribeUsers(); } catch (e) { /* ignore */ }
            };
        }, []);

        const fetchPendingEnrollments = async () => {
            try {
                const enrollments = await getPendingEnrollments();
                setPendingEnrollments(enrollments || []);
            } catch (error) {
                setPendingEnrollments([]);
                console.error('fetchPendingEnrollments error', error);
                alert('Failed to load pending enrollments. See console for details.');
            }
        };

        const fetchPendingFingerprintIds = async () => {
            try {
                const minimal = await getPendingFingerprintIds();
                setPendingEnrollments(minimal || []);
            } catch (err) {
                console.error('fetchPendingFingerprintIds error', err);
                setPendingEnrollments([]);
            }
        };

        const fetchActiveUsers = async () => {
            try {
                const users = await getActiveUsers();
                setActiveUsers(users || []);
            } catch (error) {
                setActiveUsers([]);
                console.error('fetchActiveUsers error', error);
                alert('Failed to load active users. See console for details.');
            }
        };

        const [notificationState, setNotificationState] = useState({ show: false, type: '', message: '' });
        const [confirmation, setConfirmation] = useState(null);
        const [toast, setToast] = useState(null);

        const showToast = (message, type = 'info') => {
            setToast({ message, type });
            setTimeout(() => setToast(null), 4000);
        };

        const showNotification = (type, message) => {
            setNotificationState({
                show: true,
                type,
                message
            });
            setTimeout(() => {
                setNotificationState({ show: false, type: '', message: '' });
            }, 3000);
        };

        const handleEnrollmentAction = async (action) => {
            setLoading(true);
            try {
                if (action === 'approve') {
                    if (enrollmentType === 'new') {
                        // validations
                        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
                            showNotification('error', 'Please fill in all required fields');
                            setLoading(false);
                            return;
                        }
                        if (!selectedFingerprints || selectedFingerprints.length < 4) {
                            showNotification('error', 'Please select 4 fingerprints for enrollment (primary + 3 backups)');
                            setLoading(false);
                            return;
                        }

                        const userData = {
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            name: `${formData.firstName} ${formData.lastName}`,
                            email: formData.email,
                            password: formData.password,
                            roleId: null,  // Role will be assigned later
                            roleName: null,
                            roleSchedule: null,
                            roleStatus: 'pending', // New field to track role assignment status
                            profilePicture: formData.profilePicture
                        };

                        const enrollmentKeys = selectedFingerprints.map(f => f.key);
                        const result = await callApproveEnrollment(enrollmentKeys, { ...userData });
                        setConfirmation({ facultyId: result.facultyId || result.userId || result.authUserId, email: result.email || userData.email, uid: result.uid || result.authUserId || null });
                        showNotification('success', 'New user enrolled successfully.');
                        showToast('New user enrolled successfully!', 'success');
                        setTimeout(() => window.location.reload(), 800);
                    } else {
                        // existing user: assign fingerprints
                        const targets = (selectedFingerprints && selectedFingerprints.length) ? selectedFingerprints.map(f => f.key) : (selectedFingerprint ? [selectedFingerprint.key] : []);
                        if (!targets.length) {
                            showNotification('error', 'Please select one or more fingerprints to assign');
                            setLoading(false);
                            return;
                        }
                        await assignFingerprintToExistingUser(targets, selectedUserId);
                        showNotification('success', `Assigned ${targets.length} fingerprint(s) to existing user successfully!`);
                        showToast(`Assigned ${targets.length} fingerprint(s)`, 'success');

                        // Work schedule is managed per-department now; enrollment will not modify schedules.
                    }
                } else if (action === 'reject') {
                    const targets = selectedFingerprints.length ? selectedFingerprints.map(f => f.key) : (selectedFingerprint ? [selectedFingerprint.key] : []);
                    for (const id of targets) await rejectEnrollment(id);
                    showNotification('success', 'Enrollment(s) rejected successfully!');
                    showToast('Enrollment(s) rejected', 'success');
                }

                // Reset form and refresh data
                resetForm();
                await fetchPendingEnrollments();
                setTimeout(async () => {
                    try { await fetchPendingEnrollments(); setSelectedFingerprints([]); } catch (e) { /* ignore */ }
                }, 800);
            } catch (error) {
                console.error('Enrollment error:', error);
                const msg = error?.original?.message || error?.message || 'Error processing enrollment. Please try again.';
                showNotification('error', msg);
            } finally {
                setLoading(false);
            }
        };

        const resetForm = () => {
            setSelectedFingerprint(null);
            setSelectedFingerprints([]);
            setEnrollmentType('new');
            setSelectedUserId('');
            setFormData({
                firstName: '',
                lastName: '',
                email: '',
                password: '',
                roleId: '',
                profilePicture: ''
            });
        };

        const handleInputChange = (field, value) => {
            setFormData(prev => ({
                ...prev,
                [field]: value
            }));
        };

        const handleSelectPending = (pendingOrGroup, groupIndex = null) => {
            // If an array is passed, treat it as a grouped selection (4 pending entries per enrollment)
            if (Array.isArray(pendingOrGroup)) {
                const group = pendingOrGroup.map(p => {
                    const normalized = { ...p };
                    if (!normalized.fingerprintId && normalized.key) normalized.fingerprintId = normalized.key;
                    return normalized;
                });

                // toggle selection of the whole group
                if (selectedGroupIndex === groupIndex) {
                    setSelectedGroupIndex(null);
                    setSelectedFingerprints([]);
                    setSelectedFingerprint(null);
                    return;
                }

                // select up to 4 from the group (defensive)
                const chosen = group.slice(0, 4);
                setSelectedGroupIndex(groupIndex);
                setSelectedFingerprints(chosen);
                setSelectedFingerprint(chosen[0] || null);

                // prefill form fields from primary pending in group
                const primary = chosen[0] || {};
                if (primary.name) handleInputChange('name', primary.name);
                if (primary.email) handleInputChange('email', primary.email);
                if (primary.department) handleInputChange('department', primary.department);
                if (primary.profilePicture || primary.profile_picture) {
                    handleInputChange('profilePicture', primary.profilePicture || primary.profile_picture);
                }

                return;
            }

            // Backwards-compatible single selection behavior
            const normalized = { ...pendingOrGroup };
            if (!normalized.fingerprintId && normalized.key) normalized.fingerprintId = normalized.key;

            // Toggle in selectedFingerprints
            const exists = selectedFingerprints.find(f => f.key === normalized.key);
            if (exists) {
                setSelectedFingerprints(prev => prev.filter(f => f.key !== normalized.key));
                // if it was the active selectedFingerprint, clear it
                setSelectedFingerprint(prev => (prev && prev.key === normalized.key ? null : prev));
                setSelectedGroupIndex(null);
            } else {
                setSelectedFingerprints(prev => {
                    if (prev.length >= 4) {
                        showNotification('error', 'You can only select up to 4 fingerprints');
                        return prev;
                    }
                    return [...prev, normalized];
                });
                setSelectedFingerprint(normalized);
                if (normalized.name) handleInputChange('name', normalized.name);
                if (normalized.email) handleInputChange('email', normalized.email);
                if (normalized.department) handleInputChange('department', normalized.department);
                if (normalized.profilePicture || normalized.profile_picture) {
                    handleInputChange('profilePicture', normalized.profilePicture || normalized.profile_picture);
                }
                if (normalized.timestamp) {
                    setSelectedFingerprint(prev => ({ ...prev, timestamp: normalized.timestamp }));
                }
            }
        };

        const handleFileChange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            // Read file as base64 (data URL) and save directly to pending enrollment / user like ProfileSettings
            try {
                setIsUploading(true);

                // Validate size (10MB) and type similar to ProfileSettings
                const MAX = 10 * 1024 * 1024;
                const allowed = ['image/jpeg', 'image/png', 'image/gif'];
                if (file.size > MAX) {
                    showNotification('error', 'File size must be less than 10MB');
                    return;
                }
                if (!allowed.includes(file.type)) {
                    showNotification('error', 'Please select an image (JPG, PNG, GIF)');
                    return;
                }

                // First, create a local preview only (no Apps Script upload for enrollments)
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(file);
                });
                // store preview locally in form data; approval will persist this if desired
                handleInputChange('profilePicture', base64);
                showNotification('success', 'Profile picture ready (preview only).');

            } catch (err) {
                console.error('Enrollment image base64 conversion failed', err);
                showNotification('error', 'Image processing failed. Please try again.');
            } finally {
                setIsUploading(false);
            }
        };

        // ... no payroll calculations required for enrollment

        // group pending enrollments into sets of 4 for the UI (do not change DB)
        const groupedPendingEnrollments = [];
        for (let i = 0; i < (pendingEnrollments || []).length; i += 4) {
            groupedPendingEnrollments.push((pendingEnrollments || []).slice(i, i + 4));
        }

        // no search UI: use groupedPendingEnrollments directly
        const filteredGroups = groupedPendingEnrollments;

        return (
            <div className="min-h-screen bg-white dark:bg-gray-900">
                {notificationState.show && (
                    <div className={`fixed top-4 right-4 p-4 rounded-md shadow-lg z-50 ${
                        notificationState.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                    } text-white`}>
                        {notificationState.message}
                    </div>
                )}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: -50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                            className={`fixed top-4 right-4 z-50 flex items-center ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white px-6 py-4 rounded-lg shadow-lg`}
                        >
                            <span className="mr-4">{toast.message}</span>
                            <button onClick={() => setToast(null)} className="ml-auto hover:text-gray-200 transition-colors" aria-label="Close notification">✕</button>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className="text-center mb-8"
                    >
                        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Enrollment Management</h1>
                        <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">Manage and approve fingerprint enrollments for employees</p>
                    </motion.div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="lg:col-span-5 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                        <Fingerprint className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pending Fingerprints</h2>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                                    {pendingEnrollments.length} pending
                                </div>
                            </div>

                            <div className="max-h-96 overflow-auto">
                                <AnimatePresence>
                                    {filteredGroups.length === 0 ? (
                                        <motion.div
                                            key="empty"
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="flex flex-col items-center justify-center py-12 text-center text-sm text-gray-500"
                                        >
                                            <Activity className="mb-3 text-gray-300" />
                                            No pending enrollments.
                                        </motion.div>
                                    ) : (
                                        <motion.ul className="space-y-2" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
                                            {filteredGroups.map((group, gidx) => {
                                                const groupKey = (group || []).map(x => x.key).join('_') || String(gidx);
                                                const isSelected = selectedGroupIndex === gidx;
                                                return (
                                                    <motion.li
                                                        layout
                                                        key={groupKey}
                                                        variants={itemVariants}
                                                        whileHover={{ scale: 1.01 }}
                                                        whileTap={{ scale: 0.995 }}
                                                        onClick={() => handleSelectPending(group, gidx)}
                                                        className={`p-3 rounded border cursor-pointer flex justify-between items-center transition-shadow ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:shadow-sm'}`}
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                                                                <User size={16} />
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-sm">Group {gidx + 1} — {group.length} fingerprint{group.length > 1 ? 's' : ''}</div>
                                                                <div className="text-xs text-gray-500 mt-1">{group.map(g => g.fingerprintId || g.key).join(' • ')}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-gray-400 text-right">
                                                            <div className="mt-1 text-[11px]">{group.map(g => g.key).join(', ')}</div>
                                                        </div>
                                                    </motion.li>
                                                );
                                            })}
                                        </motion.ul>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="lg:col-span-7 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                        <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Enrollment Details</h2>
                                </div>
                                <div className="text-sm text-gray-500">Selected: <span className="font-medium text-gray-700">{selectedGroupIndex !== null ? `Group ${selectedGroupIndex + 1} (${selectedFingerprints.length})` : (selectedFingerprint ? selectedFingerprint.fingerprintId : 'None')}</span></div>
                            </div>

                            <div className="mb-4 flex items-center gap-4">
                                <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700/50 p-1">
                                    <motion.button
                                        onClick={() => setEnrollmentType('new')}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                                            enrollmentType === 'new' 
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <UserPlus className="w-4 h-4" />
                                            Create New
                                        </div>
                                    </motion.button>
                                    <motion.button
                                        onClick={() => setEnrollmentType('existing')}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                                            enrollmentType === 'existing' 
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' 
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4" />
                                            Assign Existing
                                        </div>
                                    </motion.button>
                                </div>

                                <div className="ml-auto text-xs text-gray-400">Tip: select a fingerprint on the left</div>
                            </div>

                            {confirmation && (
                                <div className="mb-4 p-4 rounded border bg-green-50 border-green-200">
                                    <div className="flex items-start gap-4">
                                        <div className="text-green-700 font-semibold">Enrollment successful</div>
                                        <div className="ml-auto text-xs text-gray-500">{format(new Date(), 'PPpp')}</div>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-700">
                                        <div><strong>Faculty ID:</strong> {confirmation.facultyId}</div>
                                        <div><strong>Email:</strong> {confirmation.email}</div>
                                        {confirmation.uid && <div><strong>Auth UID:</strong> {confirmation.uid}</div>}
                                    </div>
                                    <div className="mt-3">
                                        <button className="px-3 py-1 bg-white border rounded" onClick={() => setConfirmation(null)}>Close</button>
                                    </div>
                                </div>
                            )}

                            <AnimatePresence mode="wait">
                                {enrollmentType === 'existing' ? (
                                    <motion.div
                                        key="existing"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                    >
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Select User</label>
                                        <select className="w-full border p-2 rounded" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                                            <option value="">-- choose user --</option>
                                            {activeUsers.map(u => (
                                                <option key={u.userId} value={u.userId}>{u.name} — {u.email}</option>
                                            ))}
                                        </select>

                                        {/* Work schedule removed from enrollment; managed per-department */}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="new"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                    >
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">First Name</label>
                                                <input 
                                                    className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm" 
                                                    value={formData.firstName} 
                                                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                                                    placeholder="Enter first name" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Last Name</label>
                                                <input 
                                                    className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm" 
                                                    value={formData.lastName} 
                                                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                                                    placeholder="Enter last name" 
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Email</label>
                                                <input 
                                                    type="email"
                                                    className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm" 
                                                    value={formData.email} 
                                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                                    placeholder="Enter email address" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                                                <input 
                                                    type="password"
                                                    className="mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white sm:text-sm" 
                                                    value={formData.password} 
                                                    onChange={(e) => handleInputChange('password', e.target.value)}
                                                    placeholder="Enter password" 
                                                />
                                            </div>
                                        </div>



                                        <div className="grid grid-cols-1 gap-4 mt-4">
                                            <motion.div
                                                initial={{ opacity: 0, y: -20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="role-assignment-card bg-white dark:bg-gray-800 rounded-lg p-6 border"
                                            >
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'transparent' }}>
                                                        <AlertCircle className="w-5 h-5" style={{ color: 'var(--color-role-assignment-text)' }} />
                                                    </div>
                                                    <h4 className="role-assignment-title text-lg font-semibold">Role Assignment</h4>
                                                </div>
                                                <p className="role-assignment-text text-sm">
                                                    The user's role will be assigned by an administrator after enrollment.
                                                </p>
                                            </motion.div>

                                            <div className="mt-4">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profile Picture</label>
                                                <div className="flex items-start gap-4">
                                                    <div className="relative group">
                                                        {formData.profilePicture ? (
                                                            <div className="relative">
                                                                <img 
                                                                    src={formData.profilePicture} 
                                                                    alt="Profile preview" 
                                                                    className="h-24 w-24 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            profilePicture: ''
                                                                        }));
                                                                    }}
                                                                    className="absolute -top-2 -right-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                                                    title="Remove photo"
                                                                >
                                                                    <XCircle className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="h-24 w-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                                                                <Camera className="w-6 h-6 text-gray-400 dark:text-gray-500 mb-1" />
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">Upload photo</span>
                                                            </div>
                                                        )}
                                                        <input 
                                                            type="file" 
                                                            accept="image/*" 
                                                            onChange={handleFileChange}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                                            Recommended: Square image, at least 300x300 pixels
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                            Supported formats: JPG, PNG, GIF (max 5MB)
                                                        </div>
                                                        {isUploading && (
                                                            <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                                Uploading image...
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="mt-6 flex items-center space-x-3">
                                <div className="flex items-center space-x-3 justify-center">
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg transition font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed approve-button"
                                        disabled={loading || isUploading || (enrollmentType === 'existing' && !selectedUserId) || (enrollmentType === 'new' && selectedFingerprints.length < 4)}
                                        onClick={() => handleEnrollmentAction('approve')}
                                    >
                                        {loading ? <Activity className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                        Approve
                                    </motion.button>

                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="inline-flex items-center gap-2 px-4 py-3 border rounded-lg transition font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed reject-button"
                                        disabled={loading || (!selectedFingerprint && selectedFingerprints.length === 0)}
                                        onClick={() => handleEnrollmentAction('reject')}
                                    >
                                        <XCircle size={16} /> Reject
                                    </motion.button>
                                </div>
                                <div className="mt-4 text-sm text-gray-600 text-center">
                                    <span className="inline-flex items-center gap-1"><User size={14} /> {selectedFingerprints.length ? `${selectedFingerprints.length} selected` : (selectedFingerprint ? (selectedFingerprint.name || 'Unknown') : 'No selection')}</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        );
    };

    export default EnrollmentModule;
