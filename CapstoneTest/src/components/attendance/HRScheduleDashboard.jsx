import React, { useEffect, useState } from 'react';
import { scheduleService } from '../../services/scheduleService';
import { firebaseService } from '../../services/firebaseService';
import ScheduleManager from './ScheduleManager';

const HRScheduleDashboard = () => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
  // reuse existing firebase helper to load faculty users
  const all = await firebaseService.getUsers();
        // filter to faculty/staff — infer by role or non-empty employeeId
        const faculty = (all || []).filter(u => u.employeeId || u.role === 'faculty' || u.staffType === 'permanent');
        setUsers(faculty);
      } catch (err) {
        console.error('Failed to load users for HR schedule dashboard', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">HR Schedule Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Faculty list</h3>
          {loading && <div>Loading...</div>}
          {!loading && users.length === 0 && <div className="text-sm text-gray-500">No faculty found</div>}
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {users.map(u => (
              <li key={u.id || u.userId} className={`p-2 rounded hover:bg-gray-50 cursor-pointer ${selectedUser && (selectedUser.id === (u.id||u.userId)) ? 'bg-gray-100' : ''}`} onClick={() => setSelectedUser(u)}>
                <div className="font-medium">{u.name || u.displayName || u.facultyName}</div>
                <div className="text-sm text-gray-500">{u.employeeId || u.userId}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3">
          <div className="bg-white p-4 rounded-lg shadow">
            {!selectedUser && (
              <div className="text-center py-12 text-gray-500">Select a faculty member to edit their weekly schedule</div>
            )}
            {selectedUser && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Editing schedule for {selectedUser.name || selectedUser.displayName || selectedUser.facultyName}</h3>
                <ScheduleManager initialUser={selectedUser} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRScheduleDashboard;
