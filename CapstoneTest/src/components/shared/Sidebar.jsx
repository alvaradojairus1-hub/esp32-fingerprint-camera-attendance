import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  UserPlus,
  RefreshCcw,
  BarChart2,
  CalendarCheck,
  Settings,
  LogOut,
  X,
  Calculator,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import useAuth from '../../contexts/authcontext';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';

const Sidebar = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { themeColors, companyBranding } = useSystemSettings();
  const location = useLocation();
  const role = user?.role || 'employee';

  const isHR = role === 'hr';

  const [collapsedGroups, setCollapsedGroups] = useState({});

  const navGroups = [
    {
      name: 'Dashboard',
      icon: Home,
      items: [
        { name: 'Attendance Overview', icon: CalendarCheck, path: '/', onlyHR: true },
        { name: 'Real-Time Sync', icon: RefreshCcw, path: '/realtime-sync', onlyHR: true },
        { name: 'DTR Summary', icon: BarChart2, path: '/dtr', onlyHR: true },
      ]
    },
        {
        name: 'Employee Management',
        icon: UserPlus,
        items: [
        { name: 'Enrollment', icon: UserPlus, path: '/enrollment', onlyHR: true },
        { name: 'Leave Management', icon: CalendarCheck, path: '/leave-management', onlyHR: true },
        // updated: Employee Type Management now lives under /settings (tabbed settings)
        { name: 'Employee Type Management', icon: Settings, path: '/settings', onlyHR: true },
      ]
    },
    {
      name: 'Payroll',
      // Use a native peso symbol SVG to represent Philippine peso (₱)
      // The SVG uses em-relative sizing so Tailwind's w-*/h-* classes scale it
      icon: function PesoIcon(props) {
        return (
          <svg
            {...props}
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ verticalAlign: 'middle' }}
          >
            {/* Larger centered text to match lucide icon visual size */}
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              fontSize="22"
              fontFamily="inherit"
              fontWeight={800}
              fill="currentColor"
              style={{ lineHeight: 1 }}
            >
              ₱
            </text>
          </svg>
        );
      },
      items: [
        { name: 'Dashboard', icon: BarChart2, path: '/payroll-dashboard', onlyHR: true }
        // Management and Reports removed as they are no longer needed
      ]
    },
    {
      name: 'Settings',
      icon: Settings,
      items: [
        { name: 'Profile Settings', icon: Settings, path: '/profile-settings' },
        { name: 'System Settings', icon: Settings, path: '/system-settings', onlyHR: true },
      ]
    },
  ];

  if (!isHR) {
    navGroups.splice(1, 0, {
      name: 'My Items',
      icon: Home,
      items: [
        { name: 'My Attendance', icon: CalendarCheck, path: '/my-attendance', onlyEmployee: true },
        { name: 'Leave Request', icon: CalendarCheck, path: '/leave-request', onlyEmployee: true },
        { name: 'My Payslips', icon: FileText, path: '/payslips', onlyEmployee: true },
      ]
    });
  }

  const handleLinkClick = () => {
    if (window.innerWidth < 1024 && onClose) {
      onClose();
    }
  };

  const toggleGroup = (groupName) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      window.location.href = '/login';
    } catch (error) {
      alert('Logout failed. Please try again.');
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        className={`fixed top-0 left-0 h-screen w-80 text-white z-40 transform transition-transform duration-200 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: themeColors.sidebar }}
        initial={false}
        animate={isOpen ? { x: 0 } : { x: -320 }}
        transition={{ type: 'tween', duration: 0.2 }}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 p-4 border-b" style={{ backgroundColor: themeColors.sidebar, borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {companyBranding.logo && (
                <img src={companyBranding.logo} alt="Logo" className="h-12 w-12 object-contain flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-bold leading-tight break-words" style={{ fontSize: `${companyBranding.nameSize || 14}px`, color: themeColors.sidebarText }}>{companyBranding.name}</h1>
                <div className="mt-1 break-words" style={{ fontSize: `${companyBranding.taglineSize || 12}px`, lineHeight: '1.3', color: themeColors.sidebarText, opacity: 0.9, wordWrap: 'break-word', overflowWrap: 'break-word' }}>{companyBranding.tagline}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md transition lg:hidden flex-shrink-0 ml-2"
              style={{ color: themeColors.sidebarText }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <p className="text-xs" style={{ color: themeColors.sidebarText, opacity: 0.7 }}>Welcome,</p>
            <p className="font-semibold text-sm" style={{ color: themeColors.sidebarText }}>{user?.name || 'User'}</p>
            <p className="text-xs" style={{ color: themeColors.sidebarText, opacity: 0.7 }}>
              {(() => {
                const roleMap = {
                  'hr': 'HR',
                  'faculty': 'Faculty',
                  'staff': 'Staff',
                  'admin': 'Admin',
                  'employee': 'Employee'
                };
                return roleMap[role] || role.charAt(0).toUpperCase() + role.slice(1);
              })()}
            </p>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-4">
            {navGroups.map((group, groupIndex) => {
              const hasVisibleItems = group.items.some(item =>
                !((item.onlyHR && !isHR) || (item.onlyEmployee && isHR))
              );

              if (!hasVisibleItems) return null;

              const isGroupCollapsed = collapsedGroups[group.name];

              return (
                <motion.div
                  key={group.name}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIndex * 0.1 }}
                  className="mb-4"
                >
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="flex items-center w-full text-left px-3 py-2 rounded-lg transition-all duration-200"
                    style={{ 
                      color: themeColors.sidebarText,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <group.icon className="w-5 h-5 mr-3" />
                    <span className="font-medium flex-1">{group.name}</span>
                    {group.items?.length > 0 && (
                      isGroupCollapsed ? (
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      ) : (
                        <ChevronDown className="w-4 h-4 ml-auto" />
                      )
                    )}
                  </button>

                  {/* Group Items */}
                  <AnimatePresence>
                    {!isGroupCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-6 mt-2 space-y-1 overflow-hidden"
                      >
                        {group.items.map((item, itemIndex) => {
                          if ((item.onlyHR && !isHR) || (item.onlyEmployee && isHR))
                            return null;

                          const isActive = location.pathname === item.path;

                          return (
                            <motion.div
                              key={item.name}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: itemIndex * 0.05 }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Link
                                to={item.path}
                                onClick={handleLinkClick}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 relative`}
                                style={{
                                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                                  color: themeColors.sidebarText,
                                  fontWeight: isActive ? '600' : '400'
                                }}
                                onMouseEnter={(e) => !isActive && (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                                onMouseLeave={(e) => !isActive && (e.currentTarget.style.backgroundColor = 'transparent')}
                                aria-current={isActive ? 'page' : undefined}
                              >
                                {isActive && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ backgroundColor: themeColors.sidebarText }}></div>
                                )}
                                <item.icon className="w-4 h-4" />
                                <span className="truncate text-sm">{item.name}</span>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </nav>

        {/* Logout Button - Fixed at bottom */}
        <div className="sticky bottom-0 border-t p-3 mt-4" style={{ backgroundColor: themeColors.sidebar, borderColor: 'rgba(255,255,255,0.1)' }}>
          <motion.button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg transition-all duration-200"
            style={{ color: themeColors.sidebarText }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Logout</span>
          </motion.button>
        </div>
      </motion.div>
    </>
  );
};

export default Sidebar;
