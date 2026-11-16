import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { scheduleService } from '../../services/scheduleService';
import useAuth from '../../contexts/authcontext';
import { Clock, Calendar, UserCog } from 'lucide-react';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ScheduleManager = ({ initialUser }) => {
  const { user: authUser } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSchedule, setEditedSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, initialUser]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      setError('');
      const target = initialUser || authUser;
      if (target?.id) {
        const userSchedule = await scheduleService.getSchedule(target.id);
        setSchedule(userSchedule || {
          type: (target.role === 'cos' || target.staffType === 'cos') ? 'cos' : 'permanent',
          shiftType: (target.role === 'cos' || target.staffType === 'cos') ? 'flexible' : 'regular',
          schedule: {}
        });
        setEditedSchedule(userSchedule?.schedule || {});
      }
    } catch (err) {
      setError('Failed to load schedule');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeChange = (day, field, value) => {
    setEditedSchedule(prev => ({
      ...prev,
      [day.toLowerCase()]: {
        ...(prev[day.toLowerCase()] || {}),
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await scheduleService.updateSchedule(user.id, {
        schedule: editedSchedule
      });
      setSuccess('Schedule updated successfully');
      setIsEditing(false);
      loadSchedule();
    } catch (err) {
      setError(err.message || 'Failed to update schedule');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-100 mt-10"
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="w-8 h-8 text-red-600" />
            Schedule Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage your work schedule and view attendance rules
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500">Schedule Type</p>
            <p className="text-lg font-semibold text-gray-800 capitalize">{schedule?.type || 'Not Set'}</p>
          </div>
          <div className="h-10 w-px bg-gray-200"></div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500">Shift Type</p>
            <p className="text-lg font-semibold text-gray-800 capitalize">{schedule?.shiftType || 'Not Set'}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative">
          {success}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Clock className="w-6 h-6 text-red-600" />
            Weekly Schedule
          </h2>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            <UserCog className="w-5 h-5" />
            {isEditing ? 'Cancel Editing' : 'Edit Schedule'}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="grid grid-cols-12 gap-4 items-center p-4 bg-white rounded-lg shadow-sm">
                <div className="col-span-3">
                  <h3 className="text-lg font-medium text-gray-800">{day}</h3>
                </div>
                <div className="col-span-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editedSchedule[day.toLowerCase()]?.startTime || ''}
                    onChange={(e) => handleTimeChange(day, 'startTime', e.target.value)}
                    disabled={!isEditing}
                    required={schedule?.type === 'permanent'}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={editedSchedule[day.toLowerCase()]?.endTime || ''}
                    onChange={(e) => handleTimeChange(day, 'endTime', e.target.value)}
                    disabled={!isEditing}
                    required={schedule?.type === 'permanent'}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {schedule?.type === 'permanent' && editedSchedule[day.toLowerCase()]?.startTime && editedSchedule[day.toLowerCase()]?.endTime && (
                    <span className="text-green-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isEditing && (
            <div className="mt-6 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditedSchedule(schedule?.schedule || {});
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Save Changes
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">Schedule Rules</h3>
        <ul className="list-disc list-inside text-blue-700 text-sm space-y-1">
          <li>Permanent staff must maintain 8-hour shifts</li>
          <li>C.O.S staff can have flexible hours</li>
          <li>Grace period for late arrival is 15 minutes</li>
          <li>Early departure requires supervisor approval</li>
        </ul>
      </div>
    </motion.div>
  );
};

export default ScheduleManager;