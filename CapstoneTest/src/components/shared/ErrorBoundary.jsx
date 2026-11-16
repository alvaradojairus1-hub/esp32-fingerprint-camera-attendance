import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // send to remote logging if you have one
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="max-w-3xl w-full bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold mb-2 text-red-700">Something went wrong</h2>
            <p className="text-sm text-gray-600 mb-4">An unexpected error occurred while rendering the app. Details below:</p>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto" style={{ whiteSpace: 'pre-wrap' }}>
              {String(this.state.error && this.state.error.toString())}
              {this.state.info && this.state.info.componentStack ? '\n\n' + this.state.info.componentStack : ''}
            </pre>
            <div className="mt-4 text-right">
              <button
                className="px-3 py-2 bg-[#800000] text-white rounded"
                onClick={() => {
                  try { localStorage.clear(); sessionStorage.clear(); } catch {}
                  window.location.reload();
                }}
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}