import React, { lazy } from 'react';

// Lazy load components
const Login = lazy(() => import('./components/auth/Login'));
const PasswordReset = lazy(() => import('./components/auth/PasswordReset'));
const HRDashboard = lazy(() => import('./components/dashboard/HRDashboard'));
const MyAttendance = lazy(() => import('./components/dashboard/MyAttendance'));
const AttendanceOverview = lazy(() => import('./components/attendance/AttendanceOverview'));
const DTRSummary = lazy(() => import('./components/attendance/DTRSummary'));
const PersonDTR = lazy(() => import('./components/attendance/PersonDTR'));
const RealTimeSync = lazy(() => import('./components/attendance/RealTimeSync'));
const LeaveManagement = lazy(() => import('./components/leave/LeaveManagement'));
const LeaveRequestForm = lazy(() => import('./components/leave/LeaveRequestForm'));
const PayrollDashboard = lazy(() => import('./components/payroll/PayrollDashboard'));
const PayslipViewer = lazy(() => import('./components/payroll/PayslipViewer'));
const ProfileSettings = lazy(() => import('./components/shared/ProfileSettings'));
const EnrollmentModule = lazy(() => import('./components/enrollment/EnrollmentModule'));
const ScheduleManager = lazy(() => import('./components/attendance/ScheduleManager'));
const HRScheduleDashboard = lazy(() => import('./components/attendance/HRScheduleDashboard'));
const SettingsManager = lazy(() => import('./components/settings/SettingsManager'));
const SystemSettings = lazy(() => import('./components/settings/SystemSettings'));

// Route definitions with lazy loading
export const routes = [
  {
    path: '/login',
    element: <Login />,
    public: true
  },
  // Registration route removed — enrollment flow is used instead
  {
    path: '/forgot-password',
    element: <PasswordReset />,
    public: true
  },
  {
    path: '/',
    element: <HRDashboard />,
    roles: ['hr']
  },
  {
    path: '/my-attendance',
    element: <MyAttendance />,
    roles: ['*-hr'] // Allow all roles except HR
  },
  {
    path: '/attendance',
    element: <AttendanceOverview />,
    roles: ['hr']
  },
  {
    path: '/dtr',
    element: <DTRSummary />,
    roles: ['hr']
  },
  {
    path: '/dtr/user/:uid',
    element: <PersonDTR />,
    roles: ['hr']
  },
  {
    path: '/leave-management',
    element: <LeaveManagement />,
    roles: ['hr']
  },
  {
    path: '/leave-request',
    element: <LeaveRequestForm />,
    roles: ['*-hr'] // Allow all roles except HR
  },
  {
    path: '/enrollment',
    element: <EnrollmentModule />,
    roles: ['hr']
  },
  {
    path: '/realtime-sync',
    element: <RealTimeSync />,
    roles: ['hr']
  },
  {
    path: '/payroll-dashboard',
    element: <PayrollDashboard />,
    roles: ['hr']
  },
  {
    path: '/payslips',
    element: <PayslipViewer />,
    roles: ['*'] // Allow all roles including HR
  },
  // Payroll routes (computation removed) -- other payroll pages available
  {
    path: '/profile-settings',
    element: <ProfileSettings />,
    // No roles restriction - accessible to all logged in users
  },
  {
    path: '/schedule-management',
    element: <ScheduleManager />
    ,
    // No roles restriction - accessible to all logged in users
  },
  {
    path: '/hr-schedules',
    element: <HRScheduleDashboard />, 
    roles: ['hr']
  },
  {
    path: '/settings',
    element: <SettingsManager />,
    roles: ['hr']
  },
  {
    path: '/system-settings',
    element: <SystemSettings />,
    roles: ['hr']
  }
];
