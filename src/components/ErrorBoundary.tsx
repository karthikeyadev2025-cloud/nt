import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Something went wrong' };
  }

  componentDidCatch(error: Error) {
    console.error('Nikki Technologies UI error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-sm text-center bg-white border border-slate-200/90 rounded-2xl p-7 shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-700 text-white font-extrabold text-xl flex items-center justify-center mx-auto mb-4 shadow-md shadow-blue-700/20">N</div>
            <p className="text-slate-900 text-lg font-bold mb-2">Something went wrong</p>
            <p className="text-slate-600 text-sm mb-6">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-700/20 transition-all"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
