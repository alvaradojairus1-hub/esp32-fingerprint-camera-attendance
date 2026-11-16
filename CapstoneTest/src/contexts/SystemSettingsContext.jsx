import React, { createContext, useContext, useState, useEffect } from 'react';
import useAuth from './authcontext';
import {
  fetchSystemSettings,
  subscribeToSystemSettings,
  saveCompanyBranding as saveBrandingToDB,
  updateSystemSettings,
} from '../services/settingsService';

const SystemSettingsContext = createContext();

// Default color scheme - sidebar colors + payslip colors
const DEFAULT_COLORS = {
  sidebar: '#8b3a3a',
  sidebarText: '#ffffff',
  pagination: '#6b46c1',
  paginationText: '#ffffff',
  approveButton: '#16a34a',
  rejectButton: '#dc2626',
  approveRejectText: '#ffffff',
  roleAssignmentBg: '#fef3c7',
  roleAssignmentBorder: '#f59e0b',
  roleAssignmentText: '#92400e',
  // Payslip colors (will fallback to sidebar if not set)
  payslipHeaderBg: '#ef4444',
  payslipHeaderText: '#ffffff',
  payslipCompensationBg: '#fff9c4',
  payslipCompensationText: '#111827',
};

// Default company branding
const DEFAULT_COMPANY_NAME = 'FASTap';
const DEFAULT_COMPANY_TAGLINE = 'Fingerprint Attendance';
const DEFAULT_LOGO = null; // No logo by default
const DEFAULT_BRANDING_SIZES = {
  nameSize: 14, // in pixels
  taglineSize: 12, // in pixels
};

// Default widget visibility
const DEFAULT_DTR_WIDGETS = {
  presentVsOnLeave: { enabled: true },
  monthlyAttendance: { enabled: true },
  mostEarlyEmployee: { enabled: true },
  mostLateEmployee: { enabled: true },
  attendanceChart: { enabled: true },
  departmentSummary: { enabled: true },
};

export const SystemSettingsProvider = ({ children }) => {
  const [dtrWidgets, setDtrWidgetsState] = useState(DEFAULT_DTR_WIDGETS);
  const [themeColors, setThemeColorsState] = useState(DEFAULT_COLORS);
  const [companyBranding, setCompanyBrandingState] = useState({
    name: DEFAULT_COMPANY_NAME,
    tagline: DEFAULT_COMPANY_TAGLINE,
    logo: DEFAULT_LOGO,
    nameSize: DEFAULT_BRANDING_SIZES.nameSize,
    taglineSize: DEFAULT_BRANDING_SIZES.taglineSize,
  });
  const { user } = useAuth();

  // Load settings from Firebase RTDB and subscribe to live changes
  useEffect(() => {
    let unsub = null;
    (async () => {
      try {
        const remote = await fetchSystemSettings();
        if (remote) {
          if (remote.dtrSummary && remote.dtrSummary.widgets) setDtrWidgetsState(remote.dtrSummary.widgets);
          if (remote.theme) {
            // CRITICAL: Merge Firebase theme with DEFAULT_COLORS to ensure all payslip color fields are present
            const mergedColors = { ...DEFAULT_COLORS, ...remote.theme };
            console.log('🎨 SystemSettingsContext loaded from Firebase - mergedColors:', JSON.stringify(mergedColors, null, 2));
            setThemeColorsState(mergedColors);
            applyColorsToSystem(mergedColors);
          } else {
            console.log('🎨 SystemSettingsContext - No theme in Firebase, using DEFAULT_COLORS');
            setThemeColorsState(DEFAULT_COLORS);
            applyColorsToSystem(DEFAULT_COLORS);
          }
          if (remote.branding) setCompanyBrandingState({ ...remote.branding, logo: remote.branding?.logo || null });
        } else {
          console.log('🎨 SystemSettingsContext - No remote settings, using defaults');
          setThemeColorsState(DEFAULT_COLORS);
          applyColorsToSystem(DEFAULT_COLORS);
        }
      } catch (error) {
        console.error('Error fetching settings from Firebase:', error);
        setThemeColorsState(DEFAULT_COLORS);
        applyColorsToSystem(DEFAULT_COLORS);
      }
    })();

    unsub = subscribeToSystemSettings((remote) => {
      if (!remote) return;
      if (remote.dtrSummary && remote.dtrSummary.widgets) setDtrWidgetsState(remote.dtrSummary.widgets);
      if (remote.theme) {
        // CRITICAL: Merge Firebase theme with DEFAULT_COLORS to ensure all payslip color fields are present
        const mergedColors = { ...DEFAULT_COLORS, ...remote.theme };
        console.log('🎨 SystemSettingsContext subscription - mergedColors:', JSON.stringify(mergedColors, null, 2));
        setThemeColorsState(mergedColors);
        applyColorsToSystem(mergedColors);
      }
      if (remote.branding) setCompanyBrandingState(remote.branding);
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Save widgets to Firebase (HR/Admin only)
  const setDtrWidgets = async (newWidgets) => {
    setDtrWidgetsState(newWidgets);
    try {
      const role = (user?.role || '').toLowerCase();
      if (!['hr', 'admin'].includes(role)) {
        console.warn('Insufficient permissions to update widgets');
        return;
      }
      await updateSystemSettings({ dtrSummary: { widgets: newWidgets } });
    } catch (error) {
      console.error('Error saving widgets to Firebase:', error);
    }
  };

  // Save colors to Firebase (HR/Admin only) and apply to UI
  const setThemeColors = async (newColors) => {
    console.log('🎨 setThemeColors called with:', JSON.stringify(newColors, null, 2));
    setThemeColorsState(newColors);
    try {
      applyColorsToSystem(newColors);
      const role = (user?.role || '').toLowerCase();
      if (!['hr', 'admin'].includes(role)) {
        console.warn('Insufficient permissions to update theme');
        return;
      }
      console.log('🎨 Saving to Firebase:', JSON.stringify(newColors, null, 2));
      await updateSystemSettings({ theme: newColors });
      console.log('🎨 Successfully saved to Firebase');
    } catch (error) {
      console.error('Error saving colors to Firebase:', error);
    }
  };

  // Save company branding to Firebase (HR/Admin only)
  const setCompanyBranding = async (newBranding) => {
    setCompanyBrandingState(newBranding);
    try {
      const role = (user?.role || '').toLowerCase();
      if (!['hr', 'admin'].includes(role)) {
        console.warn('Insufficient permissions to update branding');
        return;
      }
      await saveBrandingToDB(newBranding);
    } catch (error) {
      console.error('Error saving company branding to Firebase:', error);
    }
  };

  // Apply colors to the entire system via CSS variables and inline styles
  const applyColorsToSystem = (colors) => {
    const root = document.documentElement;
    root.style.setProperty('--color-sidebar', colors.sidebar);
    root.style.setProperty('--color-sidebar-text', colors.sidebarText);
    // Pagination colors
    root.style.setProperty('--color-pagination', colors.pagination || colors.sidebar);
    root.style.setProperty('--color-pagination-text', colors.paginationText || colors.sidebarText);
    // Approve/Reject button colors
    root.style.setProperty('--color-approve', colors.approveButton || '#16a34a');
    root.style.setProperty('--color-reject', colors.rejectButton || '#dc2626');
    // Role Assignment card colors (used for both Role Assignment and HR Privileges)
    root.style.setProperty('--color-role-assignment-bg', colors.roleAssignmentBg || '#fef3c7');
    root.style.setProperty('--color-role-assignment-border', colors.roleAssignmentBorder || '#f59e0b');
    root.style.setProperty('--color-role-assignment-text', colors.roleAssignmentText || '#92400e');
  };

  // Reset to defaults
  const resetToDefaults = async () => {
    setDtrWidgetsState(DEFAULT_DTR_WIDGETS);
    setThemeColorsState(DEFAULT_COLORS);
    setCompanyBrandingState({ 
      name: DEFAULT_COMPANY_NAME, 
      tagline: DEFAULT_COMPANY_TAGLINE, 
      logo: DEFAULT_LOGO,
      nameSize: DEFAULT_BRANDING_SIZES.nameSize,
      taglineSize: DEFAULT_BRANDING_SIZES.taglineSize,
    });
    applyColorsToSystem(DEFAULT_COLORS);
    try {
      // also update remote settings if allowed
      const role = (user?.role || '').toLowerCase();
      if (['hr', 'admin'].includes(role)) {
        await updateSystemSettings({
          dtrSummary: { widgets: DEFAULT_DTR_WIDGETS },
          theme: DEFAULT_COLORS,
          branding: { 
            name: DEFAULT_COMPANY_NAME, 
            tagline: DEFAULT_COMPANY_TAGLINE,
            nameSize: DEFAULT_BRANDING_SIZES.nameSize,
            taglineSize: DEFAULT_BRANDING_SIZES.taglineSize,
          },
        });
      }
    } catch (e) {
      // non-fatal
    }
  };

  const value = {
    dtrWidgets,
    setDtrWidgets,
    themeColors,
    setThemeColors,
    companyBranding,
    setCompanyBranding,
    resetToDefaults,
    DEFAULT_COLORS,
    DEFAULT_DTR_WIDGETS,
    DEFAULT_COMPANY_NAME,
    DEFAULT_COMPANY_TAGLINE,
    DEFAULT_LOGO,
    DEFAULT_BRANDING_SIZES,
  };

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

export const useSystemSettings = () => {
  const context = useContext(SystemSettingsContext);
  if (!context) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return context;
};
