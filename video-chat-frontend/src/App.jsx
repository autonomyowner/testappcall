import React from 'react';
import VideoChat from './VideoChat';
import ErrorBoundary from './ErrorBoundary';

function App() {
  return (
    <div className="app-container">
      <ErrorBoundary>
        <VideoChat />
      </ErrorBoundary>
    </div>
  );
}

export default App;
