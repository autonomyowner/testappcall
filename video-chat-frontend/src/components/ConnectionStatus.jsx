import React, { useState } from 'react';

const ConnectionStatus = ({ status, roomId, isHost }) => {
    const [copied, setCopied] = useState(false);

    const getStatusInfo = () => {
        switch (status) {
            case 'connected':
                return {
                    text: 'Connected',
                    icon: '🟢',
                    color: 'success'
                };
            case 'connecting':
                return {
                    text: 'Connecting...',
                    icon: '🟡',
                    color: 'warning'
                };
            case 'disconnected':
                return {
                    text: 'Disconnected',
                    icon: '🔴',
                    color: 'error'
                };
            default:
                return {
                    text: 'Unknown',
                    icon: '⚪',
                    color: 'neutral'
                };
        }
    };

    const handleShareRoom = async () => {
        try {
            const roomUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
            await navigator.clipboard.writeText(roomUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy room URL:', error);
            alert('Failed to copy room URL. Please copy manually: ' + roomId);
        }
    };

    const statusInfo = getStatusInfo();

    if (!roomId) return null;

    return (
        <div className={`connection-status glass ${statusInfo.color}`}>
            <div className="status-content">
                <div className="status-indicator">
                    <span className="status-icon">{statusInfo.icon}</span>
                    <span className="status-text text-premium">{statusInfo.text}</span>
                </div>
                
                <div className="room-sharing">
                    <div className="room-id-display">
                        <span className="room-label text-premium-light">Room ID:</span>
                        <span className="room-id text-premium-bold">{roomId}</span>
                    </div>
                    
                    <button 
                        className={`share-button btn-premium ${copied ? 'success' : ''}`}
                        onClick={handleShareRoom}
                        title="Copy room link to clipboard"
                    >
                        {copied ? '✅ Copied!' : '📤 Share'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConnectionStatus; 