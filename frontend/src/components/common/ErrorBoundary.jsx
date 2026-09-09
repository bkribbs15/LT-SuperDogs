import { Component } from 'react';

/** Catches a render crash so users see a reload button instead of a blank page. */
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full text-center">
          <h2 className="font-display text-3xl font-bold text-text-primary mb-2">Fumble.</h2>
          <p className="text-text-body mb-6">Something went wrong drawing this page. A reload usually clears it.</p>
          <button onClick={() => window.location.reload()} className="btn-primary">Reload</button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
