import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary caught error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-2xl font-bold border border-rose-500/40">
            ⚠️
          </div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-xs text-slate-400 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred while rendering the application.'}
          </p>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg transition-all"
          >
            Clear Cache & Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
