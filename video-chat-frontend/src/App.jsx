import React from 'react';
import VideoChat from './VideoChat';
import './App.css';
import ErrorBoundary from './ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <>
        <header className="brand-header">
          <div className="brand-inner">
            <h1 className="brand-title">
              Travoice <span className="brand-phase">test phase 2</span>
            </h1>
          </div>
        </header>
        <VideoChat />
      </>
    </ErrorBoundary>
  );
}

export default App;
