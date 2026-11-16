import { useEffect, useState, useMemo } from 'react';
import { firebaseService } from '../../services/firebaseService';
import { Users, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import SimpleTable from '../shared/SimpleTable';
import SearchInput from '../shared/SearchInput';

const AttendanceTable = () => {
  const [att, setAtt] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const perPage = 10;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const fetchInitialData = async () => {
      try {
        const data = await firebaseService.getAttendance();
        if (mounted) {
          setAtt(data);
          setLoading(false);
        }
      } catch (e) {
        console.error("Error fetching attendance:", e);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Only subscribe to real-time updates after initial data load
    fetchInitialData();
    
    const unsubA = firebaseService.onAttendanceUpdate((data) => {
      if (mounted) {
        setAtt(data);
      }
    });

    return () => {
      mounted = false;
      unsubA();
    };
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let res = att;
    if (qq) res = res.filter(r => (r.userId || '').toLowerCase().includes(qq) || (r.date || '').toLowerCase().includes(qq));
    res.sort((a, b) => new Date(b.rawTimestamp || 0) - new Date(a.rawTimestamp || 0));
    return res;
  }, [att, q]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const columns = [
    {
      key: 'userId',
      label: 'User',
      cellClassName: 'font-medium text-gray-900 dark:text-white'
      ,
      render: (record) => (
        <Link to={`/dtr/user/${record.userId}`} className="hover:underline">
          {record.userName || record.facultyName || record.userId}
        </Link>
      )
    },
    {
      key: 'date',
      label: 'Date',
      cellClassName: 'text-gray-500 dark:text-gray-300'
    },
    {
      key: 'time',
      label: 'Time',
      cellClassName: 'text-gray-500 dark:text-gray-300'
    },
    {
      key: 'type',
      label: 'Type',
      cellClassName: 'capitalize text-gray-500 dark:text-gray-300',
      render: (record) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          record.type === 'check_in' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
          'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }`}>
          {record.type}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      cellClassName: 'capitalize text-gray-500 dark:text-gray-300',
      render: (record) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          record.status === 'present' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
          record.status === 'late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
          'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }`}>
          {record.status}
        </span>
      )
    }
  ];

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Attendance</h2>
        </div>
        <SearchInput
          value={q}
          onChange={(value) => { setQ(value); setPage(1); }}
          placeholder="Search by user or date..."
          className="w-64"
        />
      </div>

      <SimpleTable
        columns={columns}
        data={pageItems}
        loading={loading}
        emptyMessage="No attendance records found"
        searchable={false}
        paginated={true}
        currentPage={page}
        totalItems={filtered.length}
        itemsPerPage={perPage}
        onPageChange={setPage}
        showPaginationInfo={true}
        className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg"
      />
    </div>
  );
};

export default AttendanceTable;
