import { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, CheckCircle, AlertTriangle, Clock, Server, RefreshCcw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { database, dbRef } from '../../firebase';
import { ref, onValue, get, set, push } from 'firebase/database';
import { usePendingAttendance } from '../../hooks/usePendingAttendance';
import { firebaseService } from '../../services/firebaseService';
import { SyncError, SyncErrorTypes, getSyncErrorMessage, getSyncErrorSeverity } from '../../utils/syncErrors';
import { AttendanceValidator } from '../../utils/attendanceValidator';
import useAuth from '../../contexts/authcontext';
import MergeNowButton from '../shared/MergeNowButton';

const RealTimeSync = () => {
  const { user } = useAuth();
  const [lastSynced, setLastSynced] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [syncHistory, setSyncHistory] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [errorDetails, setErrorDetails] = useState(null);

  // Load sync history when component mounts
  useEffect(() => {
    if (!user) return;

    const syncHistoryRef = ref(database, dbRef(`syncHistory/${user.uid}`));
    return onValue(syncHistoryRef, (snapshot) => {
      if (!snapshot.exists()) return;
      
      try {
        const historyData = snapshot.val();
        const historyArray = Object.entries(historyData)
          .map(([key, entry]) => ({
            ...entry,
            id: key,
            // Convert timestamp string back to Date object
            timestamp: new Date(entry.timestamp)
          }))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50); // Keep last 50 entries
        
        setSyncHistory(historyArray);
        
        // Update lastSynced from most recent successful sync
        const lastSuccessful = historyArray.find(entry => entry.status === 'success');
        if (lastSuccessful) {
          setLastSynced(new Date(lastSuccessful.timestamp));
        }
      } catch (err) {
        console.error('Error loading sync history:', err);
      }
    });
  }, [user]);

  // Save new sync entry to Firebase
  const saveSyncEntry = useCallback(async (entry) => {
    if (!user) return;
    
    try {
      const syncHistoryRef = ref(database, dbRef(`syncHistory/${user.uid}`));
      const newEntryRef = push(syncHistoryRef);
      await set(newEntryRef, {
        ...entry,
        timestamp: entry.timestamp.toISOString(),
        userId: user.uid,
        userEmail: user.email
      });
    } catch (err) {
      console.error('Error saving sync history:', err);
    }
  }, [user]);

  // ✅ Manual sync handler - uses same logic as auto-sync
  const handleSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;

    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      const startTime = Date.now();
      setErrorDetails(null);

      // Use the same processPendingAttendance logic as auto-sync
      console.log('[ManualSync] Running processPendingAttendance()...');
      const result = await firebaseService.processPendingAttendance();

      const duration = Date.now() - startTime;
      const newSyncTime = new Date();
      setLastSynced(newSyncTime);
      setSyncStatus('success');

      const syncEntry = {
        timestamp: newSyncTime,
        status: 'success',
        duration,
        message: 'Manual sync completed',
        stats: {
          processed: Array.isArray(result) ? result.length : 0
        },
        type: 'manual'
      };

      // Save to Firebase
      await saveSyncEntry(syncEntry);

      setTimeout(() => {
        setSyncStatus('idle');
        setErrorDetails(null);
      }, 3000);
    } catch (error) {
      const syncError =
        error instanceof SyncError
          ? error
          : new SyncError(SyncErrorTypes.UNKNOWN, error.message, { originalError: error });

      setSyncStatus('error');
      setErrorDetails(syncError);

      const errorEntry = {
        timestamp: new Date(),
        status: 'error',
        duration: 2000,
        error: syncError.message,
        type: 'manual'
      };

      // Save error to Firebase
      await saveSyncEntry(errorEntry);

      await firebaseService.writeAuditLog({
        action: 'manual_sync_error',
        error: syncError.message,
        type: syncError.type,
        details: syncError.details,
      });

      setTimeout(() => {
        setSyncStatus('idle');
        setErrorDetails(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline]);

  // ✅ Background polling every 2s (automatic merge)
  // Modified auto-sync hook to save history
  const onAutoSync = useCallback(async (result) => {
    const syncEntry = {
      timestamp: new Date(),
      status: 'success',
      duration: 0,
      message: 'Auto sync completed',
      stats: {
        processed: Array.isArray(result) ? result.length : 0
      },
      type: 'auto'
    };
    await saveSyncEntry(syncEntry);
  }, [saveSyncEntry]);

  // Use the pendingAttendance hook with history callback
  usePendingAttendance(onAutoSync);

  // ✅ Connection watcher
  useEffect(() => {
    const checkConnectionQuality = () => {
      if (navigator.onLine) {
        const start = Date.now();
        const connRef = ref(database, '.info/connected');
        onValue(connRef, snap => {
          const latency = Date.now() - start;
          if (snap.val() === true) {
            if (latency < 100) setConnectionQuality('excellent');
            else if (latency < 500) setConnectionQuality('good');
            else if (latency < 1000) setConnectionQuality('fair');
            else setConnectionQuality('poor');
          } else {
            setConnectionQuality('poor');
          }
        });
      }
    };

    const goOnline = () => {
      setIsOnline(true);
      setConnectionQuality('good');
    };

    const goOffline = () => {
      setIsOnline(false);
      setConnectionQuality('offline');
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    const qualityCheckInterval = setInterval(checkConnectionQuality, 30000);
    checkConnectionQuality();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(qualityCheckInterval);
    };
  }, [database]);

  const getConnectionIcon = () => {
    switch (connectionQuality) {
      case 'excellent':
        return <Wifi className="w-5 h-5 text-green-600" />;
      case 'good':
        return <Wifi className="w-5 h-5 text-green-500" />;
      case 'fair':
        return <Wifi className="w-5 h-5 text-yellow-500" />;
      case 'poor':
        return <Wifi className="w-5 h-5 text-orange-500" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />;
      default:
        return <Wifi className="w-5 h-5 text-gray-500" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'fair':
        return 'Fair';
      case 'poor':
        return 'Poor';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  const ErrorMessage = ({ error }) => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`mb-6 p-4 rounded-lg border ${
        getSyncErrorSeverity(error) === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : getSyncErrorSeverity(error) === 'warning'
          ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
          : 'bg-blue-50 border-blue-200 text-blue-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        <div>
          <p className="font-medium">{getSyncErrorMessage(error)}</p>
          {error.details && (
            <p className="text-sm mt-1 opacity-80">{JSON.stringify(error.details)}</p>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence>{errorDetails && <ErrorMessage error={errorDetails} />}</AnimatePresence>

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white mb-2">Real-Time Sync</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Monitor and manage data synchronization</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 sm:p-8 mb-8 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex justify-center">
              <div className="relative">
                <Server className={`w-8 h-8 ${syncStatus === 'syncing' ? 'text-blue-400 animate-pulse' : 'text-blue-600 dark:text-blue-400'}`} />
                {syncStatus === 'syncing' && (
                  <div className="absolute -top-1 -right-1">
                    <RefreshCcw className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-gray-800 dark:text-white">Real-Time Attendance Monitor</h2>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {syncStatus === 'syncing' ? 'Syncing...' : isOnline ? 'Auto-Sync Active' : 'Auto-Sync Inactive'}
                </p>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Last synced: <span className="font-medium text-gray-800 dark:text-gray-200">{lastSynced.toLocaleTimeString()}</span>
                </p>
              </div>

              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {isOnline
                  ? 'Automatically processing attendance records in real-time'
                  : 'Waiting for connection to resume automatic processing'}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSync}
              disabled={isSyncing || !isOnline}
              className={`approve-button flex items-center gap-2 px-4 py-3 border-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                isSyncing || !isOnline
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-blue-50 dark:hover:bg-blue-900/30'
              }`}
            >
              <RefreshCcw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </motion.button>

            {/* Connection Status Information */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className={`px-3 py-1 rounded-full inline-flex items-center gap-2 text-xs font-medium ${isOnline ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                  {isOnline ? 'Internet Connected' : 'No Internet'}
                </span>
              </div>
              
              <div className="flex items-center justify-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Server Response: <span className="text-gray-800 dark:text-gray-200">
                    {connectionQuality === 'excellent' ? '< 100ms' :
                    connectionQuality === 'good' ? '< 500ms' :
                    connectionQuality === 'fair' ? '< 1s' :
                    connectionQuality === 'poor' ? '> 1s' :
                    'Offline'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Connection Status and Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Connection Status</h3>
              {getConnectionIcon()}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                <span className={`text-sm font-semibold ${
                  isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Quality</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {getConnectionText()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Sync</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {lastSynced.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Sync Statistics</h3>
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Syncs</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {syncHistory.length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Successful</span>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {syncHistory.filter(s => s.status === 'success').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Failed</span>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {syncHistory.filter(s => s.status === 'error').length}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sync History */}
        {syncHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Sync History</h3>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Last {syncHistory.length} syncs
              </span>
            </div>

            <div className="space-y-2">
              {syncHistory.slice(0, 5).map((sync, index) => (
                <motion.div
                  key={sync.id || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {sync.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {sync.status === 'success' ? 'Sync Successful' : 'Sync Failed'}
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({sync.type})</span>
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {sync.timestamp.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {Math.round(sync.duration / 1000)}s
                    </p>
                    {sync.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
                        {sync.error}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Offline Message */}
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-8 text-center"
          >
            <WifiOff className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">No Internet Connection</h3>
            <p className="text-red-600 dark:text-red-400">
              You're currently offline. Some features may be limited until connection is restored.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default RealTimeSync;