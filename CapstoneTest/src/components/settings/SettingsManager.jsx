import React, { useState } from 'react';
import { motion } from 'framer-motion';
import EmployeeTypeManager from './EmployeeTypeManager';
import RoleManager from './RoleManager';

export default function SettingsManager() {
  const [activeTab, setActiveTab] = useState('employeeTypes'); // or 'roles'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white mb-2">Employee Type Management</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Configure and manage different types of employees and their roles</p>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <nav className="inline-flex gap-8 pb-1 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('employeeTypes')}
              className={`px-1 py-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'employeeTypes'
                  ? 'border-blue-500 text-blue-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Employee Types
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-1 py-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'roles'
                  ? 'border-blue-500 text-blue-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Roles
            </button>
          </nav>
        </motion.div>

        {/* Tab Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700"
        >
          {activeTab === 'employeeTypes' ? (
            <EmployeeTypeManager />
          ) : activeTab === 'roles' ? (
            <RoleManager />
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}