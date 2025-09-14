import React from 'react';

const ConnectionStatus = ({ status, roomId, isHost }) => {
    const getStatusColor = () => {
        switch (status) {
            case 'connected': return '#4CAF50';
            case 'connecting': return '#FFC107';
            case 'disconnected': return '#F44336';
            default: return '#9E9E9E';
        }
    };

    return (
        <div className="connection-status" style={{ backgroundColor: getStatusColor() }}>
            <div className="status-content">
                <span className="status-text">{status}</span>
                {roomId && (
                    <div className="room-info">
                        <span>Room: {roomId}</span>
                        <button 
                            className="share-button"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                alert('Room link copied to clipboard!');
                            }}
                        >
                            Share Room
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectionStatus; 