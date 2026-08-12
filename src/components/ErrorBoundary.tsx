import React from 'react';

interface State {
  hasError: boolean;
  error?: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // log to console so it's captured by browsers/Playwright
    // and any monitoring services can pick it up
    // eslint-disable-next-line no-console
    console.error('Unhandled render error caught by ErrorBoundary', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white">
          <div className="max-w-lg w-full text-right">
            <h2 className="text-xl font-bold text-red-700 mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-gray-700 mb-4">واجه التطبيق خطأً أثناء التحميل. الرجاء إعادة التحميل أو التواصل مع الدعم.</p>
            <details className="text-xs text-gray-500 whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {this.state.error?.stack || String(this.state.error)}
            </details>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
