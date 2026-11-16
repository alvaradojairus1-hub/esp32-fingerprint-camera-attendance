import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { database } from '../../firebase';
import { ref, onValue, get, child } from 'firebase/database';
import {
  TrendingUp,
  Users,
  Clock,
  Calendar,
  Eye,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { createAccessibleChartConfig, getAccessibleColors } from '../../utils/chartConfig';
import { getChartTitleColor, addThemeChangeListener, dispatchThemeChange, isDarkMode } from '../../utils/themeUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const AttendanceOverviewEnhanced = () => {
  const chartRef = useRef();
  const [attendanceData, setAttendanceData] = useState({
    present: [0, 0, 0, 0, 0, 0, 0],
    late: [0, 0, 0, 0, 0, 0, 0],
    'on leave': [0, 0, 0, 0, 0, 0, 0],
  });

  const [attendanceTable, setAttendanceTable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [colorBlindMode, setColorBlindMode] = useState('standard');
  const [employees, setEmployees] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [showEmployeeDirectory, setShowEmployeeDirectory] = useState(false);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  useEffect(() => {
    const attendanceRef = ref(database, 'attendance');
    const leaveRef = ref(database, 'leaveRequests');

    const unsubscribeAttendance = onValue(attendanceRef, (snapshot) => {
      try {
        const rawData = snapshot.val();

        const chartData = {
          present: [0, 0, 0, 0, 0, 0, 0],
          late: [0, 0, 0, 0, 0, 0, 0],
          'on leave': [0, 0, 0, 0, 0, 0, 0],
        };

        const tableData = [];

        if (rawData) {
          Object.values(rawData).forEach((facultyEntries) => {
            Object.values(facultyEntries).forEach((entry) => {
              if (typeof entry !== 'object' || !entry.check_in || !entry.status) return;

              const status = entry.status.replace('_', ' ').toLowerCase();
              const date = new Date(entry.check_in);
              const dayIndex = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6

              // Chart data
              if (chartData[status]) {
                chartData[status][dayIndex] += 1;
              }

              // Table data
              tableData.push({
                faculty_name: entry.faculty_name || 'Unknown',
                check_in: entry.check_in,
                check_out: entry.check_out || '',
                status,
                employeeId: entry.employeeId || '',
                department: entry.department || '',
              });
            });
          });

          // Sort table by most recent
          tableData.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
        }

        setAttendanceData(chartData);
        setAttendanceTable(tableData);
        setLoading(false);
      } catch (err) {
        console.error('Error processing attendance data:', err);
        setError('Failed to load attendance data');
        setLoading(false);
      }
    });

    const unsubscribeLeave = onValue(leaveRef, (snapshot) => {
      try {
        const leaveData = snapshot.val();
        if (!leaveData) return;

        // Count pending leaves per day of week
        const leaveCounts = [0, 0, 0, 0, 0, 0, 0];

        Object.values(leaveData).forEach((leaveRequest) => {
          if (leaveRequest.status !== 'pending') return;
          const startDate = new Date(leaveRequest.startDate);
          const endDate = leaveRequest.endDate ? new Date(leaveRequest.endDate) : startDate;

          for (
            let d = new Date(startDate);
            d <= endDate;
            d.setDate(d.getDate() + 1)
          ) {
            const dayIndex = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
            leaveCounts[dayIndex]++;
          }
        });

        // Update chartData 'on leave' counts by adding leaveCounts
        setAttendanceData((prevData) => {
          if (!prevData['on leave'] || prevData['on leave'].length !== 7) {
            return prevData;
          }
          const newOnLeave = prevData['on leave'].map(
            (count, idx) => count + (leaveCounts[idx] || 0)
          );
          return { ...prevData, 'on leave': newOnLeave };
        });
      } catch (err) {
        console.error('Error processing leave data:', err);
      }
    });

    return () => {
      unsubscribeAttendance();
      unsubscribeLeave();
    };
  }, []);

  // Calculate statistics
  const stats = React.useMemo(() => {
    const total = attendanceData.present.reduce((a, b) => a + b, 0) +
                 attendanceData.late.reduce((a, b) => a + b, 0) +
                 attendanceData['on leave'].reduce((a, b) => a + b, 0);

    const presentRate = total > 0 ? Math.round((attendanceData.present.reduce((a, b) => a + b, 0) / total) * 100) : 0;
    const lateRate = total > 0 ? Math.round((attendanceData.late.reduce((a, b) => a + b, 0) / total) * 100) : 0;
    const leaveRate = total > 0 ? Math.round((attendanceData['on leave'].reduce((a, b) => a + b, 0) / total) * 100) : 0;

    const today = new Date().getDay();
    const todayIndex = today === 0 ? 6 : today - 1; // Convert to Mon=0 format

    return {
      total,
      presentRate,
      lateRate,
      leaveRate,
      todayPresent: attendanceData.present[todayIndex] || 0,
      todayLate: attendanceData.late[todayIndex] || 0,
      todayLeave: attendanceData['on leave'][todayIndex] || 0,
    };
  }, [attendanceData]);

  // Create accessible chart configuration
  const chartConfig = React.useMemo(() => {
    const colors = getAccessibleColors(colorBlindMode, 3);

    return createAccessibleChartConfig('line', colorBlindMode, {
      data: {
        labels: days,
        datasets: [
          {
            label: 'Present',
            data: attendanceData.present,
            borderColor: colors[0],
            backgroundColor: colors[0] + '20',
            tension: 0.4,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Late',
            data: attendanceData.late,
            borderColor: colors[1],
            backgroundColor: colors[1] + '20',
            tension: 0.4,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'On Leave',
            data: attendanceData['on leave'],
            borderColor: colors[2],
            backgroundColor: colors[2] + '20',
            tension: 0.4,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: getChartTitleColor(),
              usePointStyle: true,
              padding: 20,
              font: {
                size: 12
              }
            },
          },
          title: {
            display: true,
            text: 'Weekly Attendance Overview',
            color: getChartTitleColor(),
            font: {
              size: 16,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 20
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#4B5563',
              font: {
                size: 12
              }
            },
            grid: {
              color: '#E5E7EB',
              drawBorder: false
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#4B5563',
              font: {
                size: 12
              }
            },
            grid: {
              color: '#E5E7EB',
              drawBorder: false
            },
          },
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
        accessibility: {
          ariaLabel: 'Weekly attendance trends chart showing present, late, and on leave statistics',
          description: 'Line chart displaying attendance patterns across the week'
        }
      }
    });
  }, [attendanceData, colorBlindMode]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'present':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'late':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'on leave':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-4 h-4" />;
      case 'late':
        return <Clock className="w-4 h-4" />;
      case 'on leave':
        return <Calendar className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Attendance Overview</h1>
          <p className="text-gray-600 text-lg">Weekly attendance trends and insights</p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Attendance</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                <p className="text-xs text-gray-500">This week</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Present Rate</p>
                <p className="text-2xl font-bold text-green-600">{stats.presentRate}%</p>
                <p className="text-xs text-gray-500">On time</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Late Rate</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.lateRate}%</p>
                <p className="text-xs text-gray-500">This week</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">On Leave</p>
                <p className="text-2xl font-bold text-blue-600">{stats.leaveRate}%</p>
                <p className="text-xs text-gray-500">This week</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Chart Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Weekly Trends</h2>
              <p className="text-sm text-gray-600">Attendance patterns across the week</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Color Blind Mode Selector */}
              <select
                value={colorBlindMode}
                onChange={(e) => setColorBlindMode(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                aria-label="Select color blind mode"
              >
                <option value="standard">Standard Colors</option>
                <option value="protanopia">Protanopia Friendly</option>
                <option value="tritanopia">Tritanopia Friendly</option>
                <option value="highContrast">High Contrast</option>
              </select>

              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          <div className="h-64 sm:h-80 lg:h-96">
            <Line ref={chartRef} {...chartConfig} />
          </div>
        </motion.div>

        {/* Recent Activity Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100"
        >
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-800">Recent Activity</h2>
              </div>
              <div className="text-sm text-gray-600">
                Latest {Math.min(attendanceTable.length, 50)} records
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden">
            <div className="divide-y divide-gray-200">
              {attendanceTable.slice(0, 10).map((record, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-800">{record.faculty_name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(record.status)}
                        {record.status}
                      </div>
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>ID:</strong> {record.employeeId}</p>
                    <p><strong>Check-in:</strong> {new Date(record.check_in).toLocaleString()}</p>
                    {record.check_out && (
                      <p><strong>Check-out:</strong> {new Date(record.check_out).toLocaleString()}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left" role="table" aria-label="Recent attendance activity">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Employee</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">ID</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Department</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check-in</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Check-out</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendanceTable.slice(0, 20).map((record, index) => (
                  <motion.tr
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-800">{record.faculty_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{record.employeeId}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{record.department || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(record.check_in).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {record.check_out ? new Date(record.check_out).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.status)}`}>
                        {getStatusIcon(record.status)}
                        {record.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {attendanceTable.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-lg">No attendance records found</p>
              <p className="text-sm">Records will appear here as employees check in</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default AttendanceOverviewEnhanced;
