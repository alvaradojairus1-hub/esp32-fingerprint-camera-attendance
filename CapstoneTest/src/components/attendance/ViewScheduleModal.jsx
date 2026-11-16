import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock } from 'lucide-react';

const ViewScheduleModal = ({ schedule, employeeName, isOpen, onClose }) => {
  if (!isOpen) return null;

  const formatTime = (time) => {
    if (!time) return '—';
    const [hours, minutes] = time.split(':');
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes} ${period}`;
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const getDayShifts = (daySchedule) => {
    if (!daySchedule) return [];
    if (Array.isArray(daySchedule)) return daySchedule;
    return daySchedule.isWorking ? [{ startTime: daySchedule.startTime, endTime: daySchedule.endTime }] : [];
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Weekly Schedule</h3>
              <p className="text-sm text-gray-600">{employeeName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Schedule Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
            <div className="space-y-4">
              {days.map((day, index) => {
                const daySchedule = schedule?.weekly?.[day.toLowerCase()] || schedule?.weekly?.[index];
                const shifts = getDayShifts(daySchedule);
                return (
                  <div key={day} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                    <h4 className="font-medium text-gray-900 mb-2">{day}</h4>
                    {shifts.length > 0 ? (
                      <div className="space-y-2">
                        {shifts.map((shift, shiftIndex) => (
                          <div key={shiftIndex} className="flex items-center gap-2 text-gray-600">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span>
                              {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No shifts scheduled</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ViewScheduleModal;