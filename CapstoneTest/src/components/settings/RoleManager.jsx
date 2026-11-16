import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { firebaseService } from '../../services/firebaseService';
import { 
  PlusCircle, 
  Trash2, 
  Clock, 
  Plus,
  X, 
  Users,
  Calendar,
  ChevronRight,
  AlertCircle,
  Info
} from 'lucide-react';

export default function RoleManager() {
  // State management
  const [roles, setRoles] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRole, setNewRole] = useState({
    name: '',
    schedule: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      type: '',
      weekly: {
        0: [], // Array of shifts for Monday
        1: [], // Tuesday
        2: [], // Wednesday
        3: [], // Thursday
        4: [], // Friday
        5: [], // Saturday
        6: [], // Sunday
      }
    }
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const addShiftToDay = (dayIndex) => {
    const currentRole = editingRole || newRole;
    const newShift = { startTime: '09:00', endTime: '17:00' };
    const dayShifts = [...(currentRole.schedule.weekly[dayIndex] || []), newShift];
    
    const updatedSchedule = {
      ...currentRole.schedule,
      weekly: {
        ...currentRole.schedule.weekly,
        [dayIndex]: dayShifts
      }
    };

    if (editingRole) {
      setEditingRole({ ...currentRole, schedule: updatedSchedule });
    } else {
      setNewRole({ ...currentRole, schedule: updatedSchedule });
    }
  };

  const removeShiftFromDay = (dayIndex, shiftIndex) => {
    const currentRole = editingRole || newRole;
    const dayShifts = [...(currentRole.schedule.weekly[dayIndex] || [])];
    dayShifts.splice(shiftIndex, 1);
    
    const updatedSchedule = {
      ...currentRole.schedule,
      weekly: {
        ...currentRole.schedule.weekly,
        [dayIndex]: dayShifts
      }
    };

    if (editingRole) {
      setEditingRole({ ...currentRole, schedule: updatedSchedule });
    } else {
      setNewRole({ ...currentRole, schedule: updatedSchedule });
    }
  };

  const updateShift = (dayIndex, shiftIndex, field, value) => {
    const currentRole = editingRole || newRole;
    const dayShifts = [...(currentRole.schedule.weekly[dayIndex] || [])];
    dayShifts[shiftIndex] = { ...dayShifts[shiftIndex], [field]: value };
    
    const updatedSchedule = {
      ...currentRole.schedule,
      weekly: {
        ...currentRole.schedule.weekly,
        [dayIndex]: dayShifts
      }
    };

    if (editingRole) {
      setEditingRole({ ...currentRole, schedule: updatedSchedule });
    } else {
      setNewRole({ ...currentRole, schedule: updatedSchedule });
    }
  };

  // Remove a day entirely from the schedule (mark as deleted by making it undefined)
  const removeDay = (dayIndex) => {
    if (!window.confirm('Delete this day from the schedule?')) return;
    const currentRole = editingRole || newRole;
    const updatedWeekly = { ...(currentRole.schedule.weekly || {}) };
    // remove the property
    delete updatedWeekly[dayIndex];

    const updatedSchedule = { ...currentRole.schedule, weekly: updatedWeekly };
    if (editingRole) setEditingRole({ ...currentRole, schedule: updatedSchedule });
    else setNewRole({ ...currentRole, schedule: updatedSchedule });
  };

  const restoreDay = (dayIndex) => {
    const currentRole = editingRole || newRole;
    const updatedWeekly = { ...(currentRole.schedule.weekly || {}) };
    updatedWeekly[dayIndex] = [];

    const updatedSchedule = { ...currentRole.schedule, weekly: updatedWeekly };
    if (editingRole) setEditingRole({ ...currentRole, schedule: updatedSchedule });
    else setNewRole({ ...currentRole, schedule: updatedSchedule });
  };

  const fetchPendingRoleAssignments = async () => {
    try {
      // Query users with roleStatus: 'pending'
      const pendingUsersData = await firebaseService.getPendingRoleUsers();
      setPendingUsers(pendingUsersData || []);
    } catch (err) {
      console.error('Failed to fetch pending role assignments:', err);
      // Don't show error to avoid disrupting main UI
    }
  };

  // Function to assign role to a user
  const assignRoleToUser = async (userId, role) => {
    try {
      await firebaseService.assignUserRole(userId, {
        roleId: role.id,
        roleName: role.name,
        roleSchedule: role.schedule
      });
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      setSelectedUser(null);
    } catch (err) {
      setError('Failed to assign role to user');
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedRoles, types] = await Promise.all([
          firebaseService.getRoles(), // Updated to use roles collection
          firebaseService.getEmployeeTypes()
        ]);
        setRoles(fetchedRoles || []);
        setEmployeeTypes(types || []);
        
        // Fetch pending role assignments
        await fetchPendingRoleAssignments();
      } catch (err) {
        setError('Failed to load roles and employee types');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time listener for pending role assignments
    const unsubscribe = firebaseService.onPendingRoleUsersChange((users) => {
      setPendingUsers(users || []);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleSave = async (role) => {
    try {
      const savedRole = await firebaseService.saveRole(role); // Updated to use roles collection
      setRoles(prev => {
        const index = prev.findIndex(r => r.id === savedRole.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = savedRole;
          return updated;
        }
        return [...prev, savedRole];
      });
      resetForm();
    } catch (err) {
      setError('Failed to save role');
      console.error(err);
    }
  };

  const handleDelete = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await firebaseService.deleteRole(roleId); // Updated to use roles collection
      setRoles(prev => prev.filter(r => r.id !== roleId));
    } catch (err) {
      setError('Failed to delete role');
      console.error(err);
    }
  };

    const resetForm = () => {
    setShowAddForm(false);
    setEditingRole(null);
    setNewRole({
      name: '',
      schedule: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        type: '',
        weekly: {
          0: [], // Monday
          1: [], // Tuesday
          2: [], // Wednesday
          3: [], // Thursday
          4: [], // Friday
          5: [], // Saturday
          6: []  // Sunday
        }
      }
    });
  };  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg h-48"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2">
        <X className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  const currentRole = editingRole || newRole;
  const isEditing = Boolean(editingRole);

  return (
    <div className="p-4 space-y-6 dark:text-gray-100">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h2>
        </div>
        <motion.button 
          onClick={() => setShowAddForm(!showAddForm)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`px-4 py-2 ${
            showAddForm 
              ? 'bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-700 text-white' 
              : 'approve-button border-2 rounded-lg font-medium transition-all hover:bg-blue-50 dark:hover:bg-blue-900/30'
          } rounded-lg flex items-center gap-2 transition-colors shadow-sm`}
        >
          {showAddForm ? (
            <X className="w-5 h-5" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
          <span>{showAddForm ? 'Cancel' : 'Add Role'}</span>
        </motion.button>
      </motion.div>

      {/* Add/Edit Form */}
      <AnimatePresence mode="wait">
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6"
          >
            <form onSubmit={(e) => {
            e.preventDefault();
            const roleToSave = currentRole;
            if (!roleToSave.schedule) {
              roleToSave.schedule = {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                weekly: {}
              };
            }
            handleSave(roleToSave);
          }}>
            {/* Role Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Role Information</h4>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Developer"
                    value={currentRole.name}
                    onChange={e => isEditing 
                      ? setEditingRole({...currentRole, name: e.target.value})
                      : setNewRole({...currentRole, name: e.target.value})
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Default Work Schedule</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Employee Type</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={(currentRole.schedule?.type || '')}
                    onChange={(e) => {
                      const update = {
                        schedule: {
                          ...(currentRole.schedule || {}),
                          type: e.target.value
                        }
                      };
                      isEditing
                        ? setEditingRole({...currentRole, ...update})
                        : setNewRole({...currentRole, ...update});
                    }}
                    required
                  >
                    <option value="">Select Employee Type</option>
                    {employeeTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-6">
                  {days.map((day, dayIndex) => (
                    <div key={dayIndex} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-sm font-medium text-gray-900">{day}</h5>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addShiftToDay(dayIndex)}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                          >
                            <PlusCircle size={16} />
                            Add Shift
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDay(dayIndex)}
                            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                            title={`Delete ${day}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {currentRole.schedule.weekly[dayIndex] === undefined ? (
                          <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                            <p className="text-sm text-gray-500 italic">Day removed</p>
                            <button
                              type="button"
                              onClick={() => restoreDay(dayIndex)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              Restore
                            </button>
                          </div>
                        ) : (
                          <>
                            {currentRole.schedule.weekly[dayIndex]?.map((shift, shiftIndex) => (
                              <div key={shiftIndex} className="flex items-center gap-3 bg-gray-50 p-2 rounded">
                                <Clock size={16} className="text-gray-400" />
                                <input
                                  type="time"
                                  value={shift.startTime}
                                  onChange={(e) => updateShift(dayIndex, shiftIndex, 'startTime', e.target.value)}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <span className="text-gray-500">to</span>
                                <input
                                  type="time"
                                  value={shift.endTime}
                                  onChange={(e) => updateShift(dayIndex, shiftIndex, 'endTime', e.target.value)}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeShiftFromDay(dayIndex, shiftIndex)}
                                  className="ml-auto text-red-500 hover:text-red-600"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            {currentRole.schedule.weekly[dayIndex]?.length === 0 && (
                              <p className="text-sm text-gray-500 italic">No shifts scheduled</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {isEditing ? 'Save Changes' : 'Add Role'}
              </button>
            </div>
          </form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Pending Role Assignments */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="role-assignment-card bg-white dark:bg-gray-800 rounded-lg shadow-sm border p-6 mb-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="role-assignment-title text-lg font-semibold">Role Assignments</h3>
          {pendingUsers.length > 0 && (
            <div className="ml-auto px-3 py-1 rounded-full flex items-center gap-2" style={{
              backgroundColor: `var(--color-role-assignment-bg)`,
              borderColor: `var(--color-role-assignment-border)`,
              color: `var(--color-role-assignment-text)`
            }}>
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{pendingUsers.length} pending</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {pendingUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4" style={{ backgroundColor: 'transparent' }}>
                <Info className="w-6 h-6" style={{ color: 'var(--color-role-assignment-text)' }} />
              </div>
              <h4 className="role-assignment-title text-base font-medium mb-2">No Pending Assignments</h4>
              <p className="role-assignment-text text-sm">
                Currently there are no employees waiting for role assignment.<br />
                New enrollments will appear here for role assignment.
              </p>
            </div>
          ) : pendingUsers.map(user => (
              <div key={user.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                </div>
                {selectedUser?.id === user.id ? (
                  <div className="flex items-center gap-3">
                    <select
                      className="px-3 py-1.5 text-sm border rounded"
                      value={selectedUser.roleId || ''}
                      onChange={(e) => setSelectedUser({...selectedUser, roleId: e.target.value})}
                    >
                      <option value="">Select Role</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const role = roles.find(r => r.id === selectedUser.roleId);
                        if (role) {
                          assignRoleToUser(user.id, role);
                        }
                      }}
                      disabled={!selectedUser.roleId}
                      className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedUser({...user, roleId: ''})}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
                  >
                    Assign Role
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>

      {/* Role Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role, index) => (
          <motion.div
            key={role.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-200"
          >
            <div className="flex flex-col h-full">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{role.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm rounded-full">
                    {employeeTypes.find(t => t.id === role.schedule?.type)?.name || 'No Type'}
                  </span>
                </div>
                {role.schedule && (
                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">Work Schedule</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(role.schedule?.weekly || {}).map(([dayIndex, shifts]) => (
                        shifts && shifts.length > 0 && (
                          <div key={dayIndex} className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500" />
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">{days[dayIndex]}</span>
                              <div className="space-y-1">
                                {shifts.map((shift, index) => (
                                  <div key={index} className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {shift.startTime} - {shift.endTime}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-auto pt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setEditingRole(role);
                    setShowAddForm(true);
                  }}
                  className="approve-button flex-1 px-3 py-1.5 border-2 rounded-md text-sm font-medium transition-all"
                >
                  Edit
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleDelete(role.id)}
                  className="reject-button px-3 py-1.5 border-2 rounded-md text-sm font-medium transition-all"
                >
                  Delete
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}