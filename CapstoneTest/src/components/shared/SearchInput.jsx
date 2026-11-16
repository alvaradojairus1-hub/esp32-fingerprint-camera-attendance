import React from 'react';
import { Search } from 'lucide-react';

const SearchInput = ({
  value = '',
  onChange = () => {},
  placeholder = 'Search...',
  className = '',
  icon = true
}) => {
  return (
    <div className={`relative ${className}`}>
      {icon && (
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 ${icon ? 'pl-10' : 'pl-4'}`}
      />
    </div>
  );
};

export default SearchInput;
