import React, { useState, useEffect } from 'react';
import { firebaseService } from '../../services/firebaseService';

export default function DepartmentManager() {
  // State management
  const [departments, setDepartments] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDepartment, setNewDepartment] = useState({
    name: '',
    code: '',
    schedule: null
  });

  const defaultWeekly = {
    0: { working: false, start: '09:00', end: '17:00' },
    1: { working: true, start: '09:00', end: '17:00' },
    2: { working: true, start: '09:00', end: '17:00' },
    3: { working: true, start: '09:00', end: '17:00' },
    4: { working: true, start: '09:00', end: '17:00' },
    5: { working: true, start: '09:00', end: '17:00' },
    6: { working: false, start: '09:00', end: '17:00' },
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deps, types] = await Promise.all([
          firebaseService.getDepartments(),
          firebaseService.getEmployeeTypes()
        ]);
        setDepartments(deps || []);
        setEmployeeTypes(types || []);
      } catch (err) {
        setError('Failed to load departments and employee types');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSave = async (department) => {
    try {
      const savedDepartment = await firebaseService.saveDepartment(department);
      setDepartments(prev => {
        const index = prev.findIndex(d => d.id === savedDepartment.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = savedDepartment;
          return updated;
        }
        return [...prev, savedDepartment];
      });
      resetForm();
    } catch (err) {
      setError('Failed to save department');
      console.error(err);
    }
  };

  const handleDelete = async (departmentId) => {
    if (!window.confirm('Are you sure you want to delete this department?')) return;
    try {
      await firebaseService.deleteDepartment(departmentId);
      setDepartments(prev => prev.filter(d => d.id !== departmentId));
    } catch (err) {
      setError('Failed to delete department');
      console.error(err);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingDepartment(null);
    setNewDepartment({
      name: '',
      code: '',
      schedule: null
    });
  };

  if (loading) return <div className="p-4">Loading departments...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  const currentDepartment = editingDepartment || newDepartment;
  const isEditing = Boolean(editingDepartment);

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Departments</h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className={`px-4 py-2 ${showAddForm ? 'bg-gray-500' : 'bg-blue-500'} text-white rounded-md hover:opacity-90 flex items-center gap-2 transition-colors`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showAddForm ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            )}
          </svg>
          {showAddForm ? 'Cancel' : 'Add Department'}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={(e) => {
            e.preventDefault();
            const departmentToSave = currentDepartment;
            if (!departmentToSave.schedule) {
              departmentToSave.schedule = {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                weekly: {}
              };
            }
            handleSave(departmentToSave);
          }}>
            {/* Department Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Department Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    placeholder="e.g. College of Computing Studies"
                    value={currentDepartment.name}
                    onChange={e => isEditing 
                      ? setEditingDepartment({...currentDepartment, name: e.target.value})
                      : setNewDepartment({...currentDepartment, name: e.target.value})
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input
                    type="text"
                    placeholder="e.g. CCS"
                    value={currentDepartment.code}
                    onChange={e => isEditing
                      ? setEditingDepartment({...currentDepartment, code: e.target.value})
                      : setNewDepartment({...currentDepartment, code: e.target.value})
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
                    value={(currentDepartment.schedule?.type || '')}
                    onChange={(e) => {
                      const update = {
                        schedule: {
                          ...(currentDepartment.schedule || {}),
                          type: e.target.value
                        }
                      };
                      isEditing
                        ? setEditingDepartment({...currentDepartment, ...update})
                        : setNewDepartment({...currentDepartment, ...update});
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

                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Day</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Working</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">End Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(defaultWeekly).map(([dayIndex, cfg]) => {
                        const schedule = currentDepartment.schedule?.weekly?.[dayIndex];
                        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        
                        return (
                          <tr key={dayIndex} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {days[dayIndex]}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={!!schedule}
                                onChange={(e) => {
                                  const update = {
                                    schedule: {
                                      ...(currentDepartment.schedule || {}),
                                      weekly: {
                                        ...(currentDepartment.schedule?.weekly || {}),
                                        [dayIndex]: e.target.checked
                                          ? { startTime: cfg.start, endTime: cfg.end }
                                          : undefined
                                      }
                                    }
                                  };
                                  if (!e.target.checked) {
                                    delete update.schedule.weekly[dayIndex];
                                  }
                                  isEditing
                                    ? setEditingDepartment({...currentDepartment, ...update})
                                    : setNewDepartment({...currentDepartment, ...update});
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="time"
                                value={schedule?.startTime || cfg.start}
                                onChange={(e) => {
                                  const update = {
                                    schedule: {
                                      ...(currentDepartment.schedule || {}),
                                      weekly: {
                                        ...(currentDepartment.schedule?.weekly || {}),
                                        [dayIndex]: {
                                          ...(currentDepartment.schedule?.weekly?.[dayIndex] || {}),
                                          startTime: e.target.value
                                        }
                                      }
                                    }
                                  };
                                  isEditing
                                    ? setEditingDepartment({...currentDepartment, ...update})
                                    : setNewDepartment({...currentDepartment, ...update});
                                }}
                                className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                disabled={!schedule}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="time"
                                value={schedule?.endTime || cfg.end}
                                onChange={(e) => {
                                  const update = {
                                    schedule: {
                                      ...(currentDepartment.schedule || {}),
                                      weekly: {
                                        ...(currentDepartment.schedule?.weekly || {}),
                                        [dayIndex]: {
                                          ...(currentDepartment.schedule?.weekly?.[dayIndex] || {}),
                                          endTime: e.target.value
                                        }
                                      }
                                    }
                                  };
                                  isEditing
                                    ? setEditingDepartment({...currentDepartment, ...update})
                                    : setNewDepartment({...currentDepartment, ...update});
                                }}
                                className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                disabled={!schedule}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                {isEditing ? 'Save Changes' : 'Add Department'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Department Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map(dept => (
          <div key={dept.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col h-full">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{dept.name}</h3>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-sm rounded-full">{dept.code}</span>
                </div>
                {dept.schedule && (
                  <div className="text-sm text-gray-600">
                    <p className="font-medium text-gray-900 mb-1">
                      {employeeTypes.find(t => t.id === dept.schedule.type)?.name || 'Not set'}
                    </p>
                    {Object.entries(dept.schedule.weekly || {}).map(([day, schedule]) => (
                      <p key={day} className="text-sm">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}: {schedule.startTime} - {schedule.endTime}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-auto pt-4">
                <button
                  onClick={() => {
                    setEditingDepartment(dept);
                    setShowAddForm(true);
                  }}
                  className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(dept.id)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}