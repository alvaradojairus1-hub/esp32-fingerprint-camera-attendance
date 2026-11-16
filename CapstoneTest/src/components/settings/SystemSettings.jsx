import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RotateCcw, Upload, X, Info } from 'lucide-react';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';

const SystemSettings = () => {
  const { dtrWidgets, setDtrWidgets, themeColors, setThemeColors, companyBranding, setCompanyBranding, resetToDefaults, DEFAULT_COLORS, DEFAULT_DTR_WIDGETS, DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_TAGLINE } = useSystemSettings();
  const [localWidgets, setLocalWidgets] = useState(dtrWidgets);
  const [localColors, setLocalColors] = useState(themeColors);
  const [localBranding, setLocalBranding] = useState(companyBranding);
  const [hasChanges, setHasChanges] = useState(false);

  // Widget metadata without icons
  const widgetLabels = {
    presentVsOnLeave: { label: 'Present vs. On Leave' },
    monthlyAttendance: { label: 'Monthly Attendance' },
    mostEarlyEmployee: { label: 'Most Early Employee' },
    mostLateEmployee: { label: 'Most Late Employee' },
    attendanceChart: { label: 'Attendance Records' },
    departmentSummary: { label: 'Tardiness Percentage' }
  };

  const handleToggleWidget = (widgetKey) => {
    const updated = {
      ...localWidgets,
      [widgetKey]: {
        ...localWidgets[widgetKey],
        enabled: !localWidgets[widgetKey].enabled
      }
    };
    setLocalWidgets(updated);
    setHasChanges(true);
  };

  const handleColorChange = (colorKey, value) => {
    const updated = { ...localColors, [colorKey]: value };
    setLocalColors(updated);
    setHasChanges(true);
  };

  const handleBrandingChange = (field, value) => {
    const updated = { ...localBranding, [field]: value };
    setLocalBranding(updated);
    setHasChanges(true);
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updated = { ...localBranding, logo: reader.result };
        setLocalBranding(updated);
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    const updated = { ...localBranding, logo: null };
    setLocalBranding(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    setDtrWidgets(localWidgets);
    setThemeColors(localColors);
    setCompanyBranding(localBranding);
    setHasChanges(false);
  };

  const handleDiscard = () => {
    setLocalWidgets(dtrWidgets);
    setLocalColors(themeColors);
    setLocalBranding(companyBranding);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      resetToDefaults();
      setLocalWidgets(DEFAULT_DTR_WIDGETS);
      setLocalColors(DEFAULT_COLORS);
      setLocalBranding({ name: DEFAULT_COMPANY_NAME, tagline: DEFAULT_COMPANY_TAGLINE });
      setHasChanges(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <h1 className="text-3xl sm:text-4xl font-bold mb-1 text-gray-900 dark:text-white">System Settings</h1>
          <p className="text-base text-gray-600 dark:text-gray-400">Manage dashboard widgets and customize sidebar colors</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Main Content - 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            {/* Widget Manager Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700"
            >
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">DTR Summary Widgets</h2>
              <div className="space-y-2">
                {Object.entries(localWidgets).map(([key, value]) => (
                  <motion.div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 transition-all cursor-pointer group bg-white dark:bg-gray-800"
                    onClick={() => handleToggleWidget(key)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 dark:text-white group-hover:opacity-80 transition-opacity">
                        {widgetLabels[key].label}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleWidget(key);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
                      style={{ backgroundColor: value.enabled ? localColors.sidebar : '#d1d5db' }}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform`}
                        style={{ transform: value.enabled ? 'translateX(22px)' : 'translateX(4px)' }}
                      />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Color Customization Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700"
            >
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Sidebar Branding</h2>
              
              <div className="space-y-3">
                {/* Company Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={localBranding.name}
                    onChange={(e) => handleBrandingChange('name', e.target.value)}
                    placeholder="e.g., FASTap, Alphamart, etc."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-300 opacity-50 mt-1">The main heading displayed in the sidebar</p>
                </div>

                {/* Tagline */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Tagline/Subtitle
                  </label>
                  <input
                    type="text"
                    value={localBranding.tagline}
                    onChange={(e) => handleBrandingChange('tagline', e.target.value)}
                    placeholder="e.g., Fingerprint Attendance, Employee Management, etc."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-300 opacity-50 mt-1">The subtitle displayed below the company name</p>
                </div>

                {/* Company Name Font Size */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Company Name Size: {localBranding.nameSize}px
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="24"
                    value={localBranding.nameSize || 14}
                    onChange={(e) => handleBrandingChange('nameSize', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-300 opacity-50 mt-1">Adjust the size of the company name in the sidebar</p>
                </div>

                {/* Tagline Font Size */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Tagline Size: {localBranding.taglineSize}px
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="18"
                    value={localBranding.taglineSize || 12}
                    onChange={(e) => handleBrandingChange('taglineSize', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-300 opacity-50 mt-1">Adjust the size of the tagline in the sidebar</p>
                </div>

                {/* Logo Uploader */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Company Logo
                  </label>
                  <div className="flex gap-3 items-start mb-3">
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                      />
                    </div>
                    {localBranding.logo && (
                      <div className="relative w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center border border-gray-300 dark:border-gray-600 flex-shrink-0">
                        <img src={localBranding.logo} alt="Logo preview" className="max-w-full max-h-full object-contain p-1" />
                        <button
                          onClick={handleRemoveLogo}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition"
                          aria-label="Remove logo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Logo Recommendation Note */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="role-assignment-card bg-white dark:bg-gray-800 rounded-lg p-3 border"
                  >
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded-full flex-shrink-0" style={{ backgroundColor: 'transparent' }}>
                        <Info className="w-4 h-4" style={{ color: 'var(--color-role-assignment-text)' }} />
                      </div>
                      <div>
                        <h4 className="role-assignment-title text-xs font-semibold mb-0.5">Logo Recommendation</h4>
                        <p className="role-assignment-text text-xs">
                          Use a logo with a transparent background (.PNG) so it adapts beautifully to both light and dark modes and any sidebar color.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>

            {/* Color Customization Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700"
            >
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Sidebar Color Customization</h2>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Sidebar Color */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.sidebar}
                    onChange={(e) => handleColorChange('sidebar', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Sidebar Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Sidebar</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">{localColors.sidebar}</p>
                </div>

                {/* Sidebar Text Color */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.sidebarText}
                    onChange={(e) => handleColorChange('sidebarText', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Sidebar Text Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Text</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">{localColors.sidebarText}</p>
                </div>

                {/* Pagination Colors */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.pagination || '#6b46c1'}
                    onChange={(e) => handleColorChange('pagination', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Pagination Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Pagination</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.pagination || '#6b46c1'}</p>
                </div>

                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.paginationText || '#ffffff'}
                    onChange={(e) => handleColorChange('paginationText', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Pagination Text Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Pag. Text</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.paginationText || '#ffffff'}</p>
                </div>
              </div>
            </motion.div>

            {/* Payslip Color Customization */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700"
            >
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Payslip Color Customization</h2>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Payslip Header Color */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.payslipHeaderBg || '#ef4444'}
                    onChange={(e) => handleColorChange('payslipHeaderBg', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Payslip Header Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Header</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">{localColors.payslipHeaderBg || '#ef4444'}</p>
                </div>

                {/* Payslip Header Text Color */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.payslipHeaderText || '#ffffff'}
                    onChange={(e) => handleColorChange('payslipHeaderText', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Payslip Header Text Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Text</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">{localColors.payslipHeaderText || '#ffffff'}</p>
                </div>

                {/* Payslip Compensation BG */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.payslipCompensationBg || '#fff9c4'}
                    onChange={(e) => handleColorChange('payslipCompensationBg', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Compensation Box Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Comp. Box</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.payslipCompensationBg || '#fff9c4'}</p>
                </div>

                {/* Payslip Compensation Text */}
                <div className="flex flex-col items-center text-center">
                  <input
                    type="color"
                    value={localColors.payslipCompensationText || '#111827'}
                    onChange={(e) => handleColorChange('payslipCompensationText', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Compensation Text Color"
                  />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Comp. Text</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.payslipCompensationText || '#111827'}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar - Summary & Actions - 1 column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1 space-y-4"
          >
            {/* Summary Card */}
            <div style={{ backgroundColor: localColors.sidebar, color: localColors.sidebarText }} className="rounded-xl shadow-sm p-4 border">
              <h3 className="text-xs font-semibold mb-3">Settings Summary</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="opacity-75">Company</span>
                  <span className="font-semibold truncate ml-2">{localBranding.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-75">Tagline</span>
                  <span className="font-semibold truncate ml-2">{localBranding.tagline.substring(0, 12)}...</span>
                </div>
                <div className="border-t border-current opacity-25 my-1.5"></div>
                <div className="flex justify-between">
                  <span className="opacity-75">Total Widgets</span>
                  <span className="font-semibold">{Object.keys(localWidgets).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-75">Enabled</span>
                  <span className="font-semibold">
                    {Object.values(localWidgets).filter(w => w.enabled).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-75">Disabled</span>
                  <span className="font-semibold">
                    {Object.values(localWidgets).filter(w => !w.enabled).length}
                  </span>
                </div>
              </div>
            </div>

            {/* Branding Preview */}
            <div style={{ backgroundColor: localColors.sidebar, color: localColors.sidebarText }} className="rounded-xl shadow-sm p-4 border">
              <h3 className="text-xs font-semibold mb-3">Sidebar Preview</h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {localBranding.logo && (
                    <img src={localBranding.logo} alt="Logo" className="h-12 w-12 object-contain flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <h1 className="font-bold leading-tight" style={{ fontSize: `${localBranding.nameSize || 14}px` }}>{localBranding.name}</h1>
                    <div className="mt-1 opacity-90" style={{ fontSize: `${localBranding.taglineSize || 12}px`, lineHeight: '1.2' }}>{localBranding.tagline}</div>
                  </div>
                </div>
                <div className="pt-2 border-t opacity-25"></div>
                <div style={{ fontSize: `${Math.max(10, (localBranding.taglineSize || 12) - 2)}px` }} className="opacity-75 space-y-2">
                  <div>Dashboard</div>
                  <div>Settings</div>
                </div>
              </div>
            </div>

            {/* Color Palette Grid */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-3">Color Palette</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: localColors.sidebar, borderColor: localColors.sidebar }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Sidebar</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: localColors.pagination, borderColor: localColors.pagination }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Paging</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: localColors.approveButton, borderColor: localColors.approveButton }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Approve</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: localColors.rejectButton, borderColor: localColors.rejectButton }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Reject</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: localColors.roleAssignmentBg, borderColor: localColors.roleAssignmentBorder }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Role</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg border-2 mb-1.5" style={{ backgroundColor: 'rgba(0,0,0,0)', borderColor: localColors.sidebarText }}></div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">Text</p>
                </div>
              </div>
            </div>

            {/* Approve/Reject Button Colors */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-3">Approve & Reject Color Customization</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center">
                  <input
                    type="color"
                    value={localColors.approveButton || '#16a34a'}
                    onChange={(e) => handleColorChange('approveButton', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Approve Button Color"
                  />
                  <p className="text-xs font-semibold text-white">Approve</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.approveButton || '#16a34a'}</p>
                </div>

                <div className="flex flex-col items-center">
                  <input
                    type="color"
                    value={localColors.rejectButton || '#dc2626'}
                    onChange={(e) => handleColorChange('rejectButton', e.target.value)}
                    className="w-14 h-14 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Reject Button Color"
                  />
                  <p className="text-xs font-semibold text-white">Reject</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.rejectButton || '#dc2626'}</p>
                </div>
              </div>
            </div>

            {/* Role Assignment Colors */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-3">Role Assignment & HR Privileges Color Customization</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center">
                  <input
                    type="color"
                    value={localColors.roleAssignmentBg || '#fef3c7'}
                    onChange={(e) => handleColorChange('roleAssignmentBg', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Role Assignment Background"
                  />
                  <p className="text-xs font-semibold text-center text-white">Background</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all text-center">{localColors.roleAssignmentBg || '#fef3c7'}</p>
                </div>

                <div className="flex flex-col items-center">
                  <input
                    type="color"
                    value={localColors.roleAssignmentBorder || '#f59e0b'}
                    onChange={(e) => handleColorChange('roleAssignmentBorder', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Role Assignment Border"
                  />
                  <p className="text-xs font-semibold text-white">Border</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.roleAssignmentBorder || '#f59e0b'}</p>
                </div>

                <div className="flex flex-col items-center">
                  <input
                    type="color"
                    value={localColors.roleAssignmentText || '#92400e'}
                    onChange={(e) => handleColorChange('roleAssignmentText', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-gray-300 dark:border-gray-600 mb-2"
                    title="Role Assignment Symbol"
                  />
                  <p className="text-xs font-semibold text-white">Symbol</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">{localColors.roleAssignmentText || '#92400e'}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className="flex flex-col items-center gap-2 px-3 py-3 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2"
                  style={{ 
                    borderColor: hasChanges ? localColors.approveButton : '#d1d5db',
                    color: hasChanges ? localColors.approveButton : '#d1d5db'
                  }}
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>

                <button
                  onClick={handleReset}
                  className="flex flex-col items-center gap-2 px-3 py-3 text-xs font-semibold rounded-lg transition-colors border-2"
                  style={{ 
                    borderColor: localColors.rejectButton,
                    color: localColors.rejectButton
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset All
                </button>
              </div>

              {hasChanges && (
                <button
                  onClick={handleDiscard}
                  className="w-full mt-3 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg transition-colors border border-gray-300 dark:border-gray-600"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Discard
                </button>
              )}
            </div>

            {/* Change Status */}
            {hasChanges && (
              <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-400 font-medium">
                  ⚠️ Unsaved changes detected.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SystemSettings);
