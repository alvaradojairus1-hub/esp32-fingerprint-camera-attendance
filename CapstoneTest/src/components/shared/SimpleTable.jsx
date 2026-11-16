import React from 'react';

const SimpleTable = ({
  columns = [],
  data = [],
  loading = false,
  error = null,
  emptyMessage = 'No records found',
  searchable = false,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange = () => {},
  paginated = false,
  currentPage = 1,
  totalItems = 0,
  itemsPerPage = 10,
  onPageChange = () => {},
  showPaginationInfo = true,
  className = '',
  headerClassName = 'bg-gray-50 dark:bg-gray-700',
  rowClassName = 'border-t hover:bg-gray-100 dark:hover:bg-gray-700',
  emptyClassName = 'text-center p-6 text-gray-500 dark:text-gray-300'
}) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-center p-4 bg-red-100 dark:bg-red-900 rounded-md">
        {error}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {searchable && (
        <div className="flex justify-end">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      )}

      <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <table className="w-full text-left">
          <thead className={headerClassName}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800">
            {data.length > 0 ? (
              data.map((row, index) => (
                <tr key={row.id || index} className={rowClassName}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-sm ${column.cellClassName || ''}`}
                    >
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className={emptyClassName}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginated && totalPages > 1 && (
        <div className="flex items-center justify-between">
          {showPaginationInfo && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Showing {startItem} to {endItem} of {totalItems} entries
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 pagination-page"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 pagination-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleTable;
