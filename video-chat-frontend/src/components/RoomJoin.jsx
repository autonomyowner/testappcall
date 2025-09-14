import React, { useState } from 'react';

const RoomJoin = ({ onJoinRoom, onCreateRoom }) => {
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        const finalUsername = username.trim() || `User_${Math.floor(Math.random() * 1000)}`;
        
        if (isCreating) {
            console.log('Creating room with username:', finalUsername);
            onCreateRoom(finalUsername);
        } else {
            const finalRoomId = roomId.trim();
            if (!finalRoomId) {
                alert('Please enter a Room ID to join');
                return;
            }
            console.log('Joining room:', { roomId: finalRoomId, username: finalUsername });
            onJoinRoom(finalRoomId, finalUsername);
        }
    };

    return (
        <div className="room-join-container">
            <div className="room-join-card glass slide-up">
                <div className="join-header">
                    <h1 className="join-title text-premium-bold">
                        {isCreating ? 'Create New Room' : 'Join Video Chat'}
                    </h1>
                    <p className="join-subtitle text-premium-light">
                        {isCreating 
                            ? 'Start a new video chat room and invite others' 
                            : 'Enter a room ID to join an existing video chat'
                        }
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="join-form">
                    {!isCreating && (
                        <div className="form-group">
                            <label htmlFor="room-id" className="form-label text-premium">Room ID</label>
                            <input
                                id="room-id"
                                type="text"
                                className="input-premium"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter Room ID"
                                required={!isCreating}
                            />
                        </div>
                    )}
                    
                    <div className="form-group">
                        <label htmlFor="username" className="form-label text-premium">
                            Display Name <span className="optional">(optional)</span>
                        </label>
                        <input
                            id="username"
                            type="text"
                            className="input-premium"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your name"
                        />
                    </div>

                    <button type="submit" className="btn-premium success join-button">
                        {isCreating ? '✨ Create Room' : '🚀 Join Room'}
                    </button>
                </form>

                <div className="join-divider">
                    <span className="divider-text text-premium-light">or</span>
                </div>

                <button 
                    className="btn-premium toggle-button" 
                    onClick={() => setIsCreating(!isCreating)}
                >
                    {isCreating ? '📥 Join Existing Room' : '✨ Create New Room'}
                </button>

                <div className="join-features">
                    <div className="feature-item">
                        <span className="feature-icon">🔒</span>
                        <span className="feature-text text-premium-light">Secure & Private</span>
                    </div>
                    <div className="feature-item">
                        <span className="feature-icon">⚡</span>
                        <span className="feature-text text-premium-light">Real-time Video</span>
                    </div>
                    <div className="feature-item">
                        <span className="feature-icon">💬</span>
                        <span className="feature-text text-premium-light">Live Chat</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoomJoin; 