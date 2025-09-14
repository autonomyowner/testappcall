import React, { useRef, useState, useEffect, useCallback } from "react";
import socket from "./socket";
import RoomJoin from './components/RoomJoin';
import ConnectionStatus from './components/ConnectionStatus';
import ParticipantList from './components/ParticipantList';

const VideoChat = () => {
  // My refs for video elements and connections
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);

  // States to manage my video chat
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Need these for room management
  const [roomId, setRoomId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);

  // Chat States
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState("");

  // Add this state
  const [videoError, setVideoError] = useState(false);

  // Add these new states with your existing states
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [showParticipants, setShowParticipants] = useState(true);

  // First, add a new state to track remote video states
  const [remoteVideoStates, setRemoteVideoStates] = useState({});

  // Function to get my camera and mic
  const getUserMedia = async (constraints = { 
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    }, 
    audio: true 
  }) => {
    try {
      // Stop any existing streams first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Try to get both video and audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!stream) throw new Error('No stream received');
        
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          setVideoError(false);
        }
        return stream;
      } catch (videoError) {
        // If video fails, try audio only
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ 
          video: false, 
          audio: true 
        });
        
        if (!audioOnlyStream) throw new Error('No audio stream received');
        
        localStreamRef.current = audioOnlyStream;
        setVideoError(true);
        setError("My camera isn't working, using audio only");
        return audioOnlyStream;
      }
    } catch (error) {
      console.error("Media access error:", error);
      let errorMessage = "Can't access my camera/mic: ";
      
      switch (error.name) {
        case "NotReadableError":
          errorMessage += "Another app is using my camera/mic";
          break;
        case "NotAllowedError":
          errorMessage += "Need permission to use camera/mic";
          break;
        case "NotFoundError":
          errorMessage += "Can't find my camera/mic";
          break;
        default:
          errorMessage += error.message || "Something went wrong";
      }
      
      setError(errorMessage);
      throw error;
    }
  };

  // Setup connection with another user
  const createPeerConnection = useCallback((userId) => {
    try {
      console.log('Creating peer connection for:', userId);
      
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      const peerConnection = new RTCPeerConnection(configuration);

      // Improved track handling
      peerConnection.ontrack = (event) => {
        console.log('Received track:', event.track.kind, 'from:', userId);
        
        if (!event.streams || !event.streams[0]) {
          console.warn('Received track without stream');
          return;
        }

        const newStream = event.streams[0];
        
        // Ensure we're not duplicating streams
        setRemoteStreams(prevStreams => {
          const existingStreamIndex = prevStreams.findIndex(s => s.userId === userId);
          
          if (existingStreamIndex >= 0) {
            // Update existing stream
            const updatedStreams = [...prevStreams];
            updatedStreams[existingStreamIndex] = {
              ...updatedStreams[existingStreamIndex],
              stream: newStream
            };
            return updatedStreams;
          }
          
          // Add new stream
          return [...prevStreams, {
            stream: newStream,
            userId,
            id: newStream.id
          }];
        });

        // Monitor track status
        event.track.onended = () => {
          console.log('Track ended:', userId, event.track.kind);
          handleTrackEnded(userId, event.track);
        };
      };

      // Enhanced ICE handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to:', userId);
          socket.emit("candidate", {
            to: userId,
            candidate: event.candidate,
            roomId
          });
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state (${userId}):`, peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed') {
          console.log('ICE connection failed, attempting restart...');
          peerConnection.restartIce();
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state (${userId}):`, peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          handleConnectionFailure(userId);
        }
      };

      // Store the connection
      peerConnectionsRef.current[userId] = peerConnection;
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }, [roomId]);

  // Add connection failure handler
  const handleConnectionFailure = useCallback((userId) => {
    console.log('Handling connection failure for:', userId);
    
    // Clean up failed connection
    if (peerConnectionsRef.current[userId]) {
      peerConnectionsRef.current[userId].close();
      delete peerConnectionsRef.current[userId];
    }

    // Remove failed streams
    setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
    
    // Attempt reconnection
    setTimeout(() => {
      if (isHost) {
        console.log('Attempting reconnection...');
        initiateCall(userId);
      }
    }, 2000);
  }, [isHost]);

  // Add track ended handler
  const handleTrackEnded = useCallback((userId, track) => {
    console.log(`Track ${track.kind} ended for user ${userId}`);
    if (track.kind === 'video') {
      setRemoteVideoStates(prev => ({...prev, [userId]: true}));
    }
  }, []);

  // Handle room creation
  const createRoom = async (username) => {
    try {
      await getUserMedia();
      socket.emit('createRoom', { username });
    } catch (error) {
      setError(`Failed to create room: ${error.message}`);
    }
  };

  // Handle room joining
  const joinRoom = async (roomId, username) => {
    try {
      console.log('Attempting to join room:', { roomId, username });
      
      // Get media permissions first
      const stream = await getUserMedia();
      if (!stream) {
        console.error('Failed to get media stream');
        return;
      }

      // Emit join room event
      socket.emit('joinRoom', { roomId, username });
      
      // Set connection status to connecting
      setConnectionStatus('connecting');
      
    } catch (error) {
      console.error('Join room error:', error);
      setError(`Failed to join room: ${error.message}`);
    }
  };

  // Initialize WebRTC call
  const initiateCall = async (userId) => {
    try {
      console.log('Initiating call with:', userId);
      
      if (!localStreamRef.current) {
        console.log('Getting local stream before initiating call');
        localStreamRef.current = await getUserMedia();
      }

      const peerConnection = createPeerConnection(userId);
      
      // Add all tracks from local stream
      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log(`Adding ${tracks.length} tracks to peer connection`);
        
        tracks.forEach(track => {
          console.log('Adding track:', track.kind);
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      // Create and send offer
      console.log('Creating offer for:', userId);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      console.log('Setting local description');
      await peerConnection.setLocalDescription(offer);
      
      console.log('Sending offer to:', userId);
      socket.emit('offer', { 
        to: userId, 
        offer,
        roomId 
      });

    } catch (error) {
      console.error('Failed to initiate call:', error);
      handleConnectionFailure(userId);
    }
  };

  // Socket event handlers
  useEffect(() => {
    socket.on('roomCreated', ({ roomId }) => {
      if (!roomId) {
        console.error('No roomId received');
        return;
      }
      setRoomId(roomId);
      setIsHost(true);
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();
      navigator.clipboard.writeText(roomId);
      alert(`Room created! Room ID: ${roomId} (copied to clipboard)`);
    });

    socket.on('roomJoined', ({ roomId, users, isHost }) => {
      console.log('Room joined event received:', { roomId, users, isHost });
      
      if (!roomId || !Array.isArray(users)) {
        console.error('Invalid room data received:', { roomId, users });
        return;
      }

      setRoomId(roomId);
      setIsHost(isHost);
      setParticipants(users.filter(user => user && user.id));
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      // Initialize connections with existing users
      users.forEach(user => {
        if (user && user.id && user.id !== socket.id) {
          console.log('Initializing connection with existing user:', user.id);
          if (!peerConnectionsRef.current[user.id]) {
            initiateCall(user.id);
          }
        }
      });
    });

    socket.on('offer', async ({ from, offer }) => {
      try {
        const peerConnection = createPeerConnection(from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStreamRef.current);
          });
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('answer', async ({ from, answer }) => {
      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('candidate', async ({ from, candidate }) => {
      const peerConnection = peerConnectionsRef.current[from];
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('chatMessage', (messageData) => {
      if (!messageData || !messageData.userId) {
        console.error('Invalid message data:', messageData);
        return;
      }
      setChatMessages(prev => [...prev, messageData]);
    });

    socket.on('userLeft', (user) => {
      if (!user || !user.id) {
        console.error('Invalid user data for disconnect:', user);
        return;
      }
      handleUserDisconnected(user.id);
    });

    socket.on('callEnded', () => {
      alert('Call has been ended by the host');
      leaveCall();
    });

    socket.on('error', ({ message }) => {
      console.error('Socket error:', message);
      setError(message);
      setConnectionStatus('disconnected');
    });

    socket.on('userSpeaking', ({ userId, speaking }) => {
      handleSpeakingStateChange(userId, speaking);
    });

    socket.on('videoStateChanged', ({ userId, isVideoOff }) => {
      console.log('Remote video state changed:', userId, isVideoOff);
      setRemoteVideoStates(prev => ({
        ...prev,
        [userId]: isVideoOff
      }));
    });

    socket.on('userJoined', ({ user }) => {
      console.log('New user joined:', user);
      
      if (!user || !user.id) {
        console.error('Invalid user data received:', user);
        return;
      }

      // Update participants list first
      setParticipants(prev => {
        const exists = prev.some(p => p.id === user.id);
        if (exists) return prev;
        return [...prev, user];
      });

      // Initialize video state for new user
      setRemoteVideoStates(prev => ({
        ...prev,
        [user.id]: false
      }));

      // If we're the host, initiate the call with the new user
      if (isHost) {
        console.log('Host initiating call with new user:', user.id);
        setTimeout(() => {
          initiateCall(user.id);
        }, 1000); // Small delay to ensure everything is set up
      }
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('offer');
      socket.off('answer');
      socket.off('candidate');
      socket.off('chatMessage');
      socket.off('userLeft');
      socket.off('callEnded');
      socket.off('error');
      socket.off('userSpeaking');
      socket.off('videoStateChanged');
      socket.off('userJoined');
    };
  }, [isHost, initiateCall]);

  // Clean up when I leave or someone else leaves
  const handleUserDisconnected = (userId) => {
    if (!userId) {
      console.error('Invalid userId for disconnection');
      return;
    }

    cleanupPeerConnection(userId);
    
    setRemoteStreams(prev => prev.filter(streamInfo => 
      streamInfo && streamInfo.userId && streamInfo.userId !== userId
    ));
    
    setParticipants(prev => prev.filter(p => 
      p && p.id && p.id !== userId
    ));
    
    setRemoteVideoStates(prev => {
      if (!prev) return {};
      const newStates = { ...prev };
      delete newStates[userId];
      return newStates;
    });
  };

  // My controls for video/audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
      
      // Let others know I turned my camera off/on
      socket.emit('videoStateChange', { 
        roomId, 
        isVideoOff: !isVideoOff 
      });
    }
  };

  // Let me share my screen
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];

      Object.values(peerConnectionsRef.current).forEach(peerConnection => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      videoTrack.onended = stopScreenShare;
      setIsScreenSharing(true);
    } catch (error) {
      console.error("Error starting screen share:", error);
      setError("Failed to start screen sharing");
    }
  };

  const stopScreenShare = async () => {
    try {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      Object.values(peerConnectionsRef.current).forEach(peerConnection => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      setIsScreenSharing(false);
    } catch (error) {
      console.error("Error stopping screen share:", error);
    }
  };

  // Chat function
  const sendMessage = () => {
    if (message.trim() && roomId) {
      try {
        const messageToSend = message.trim();
        console.log('Sending message:', { roomId, message: messageToSend });
        socket.emit('chatMessage', { 
          roomId, 
          message: messageToSend 
        });
        setMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
        setError('Failed to send message');
      }
    }
  };

  // Add this function inside your VideoChat component
  const getVideoContainerClass = () => {
    const totalParticipants = remoteStreams.length + 1; // +1 for local stream
    if (totalParticipants === 1) return 'videos single';
    if (totalParticipants === 2) return 'videos pair';
    return 'videos multiple';
  };

  // Add these functions to your VideoChat component
  const leaveCall = () => {
    console.log('Leaving call...');
    try {
      // Close and cleanup peer connections
      Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
        console.log(`Closing connection with ${userId}`);
        pc.close();
      });
      peerConnectionsRef.current = {};
      
      // Stop all local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped track: ${track.kind}`);
        });
      }
      
      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      // Reset states
      setRemoteStreams([]);
      setIsCallStarted(false);
      setIsJoined(false);
      clearChat();
      
      // Notify server
      socket.emit('leaveRoom', { roomId });
      console.log('Left room:', roomId);
    } catch (error) {
      console.error('Error during call cleanup:', error);
      setError('Failed to properly clean up call');
    }
  };

  const endCall = () => {
    if (isHost) {
      socket.emit('endCall', { roomId });
      leaveCall();
      clearChat();
    }
  };

  // Add clearChat function
  const clearChat = () => {
    setChatMessages([]);
  };

  // Add this function to detect active speaker
  const handleSpeakingStateChange = useCallback((userId, speaking) => {
    if (speaking) {
      setActiveSpeaker(userId);
      // Reset active speaker after 2 seconds of silence
      setTimeout(() => {
        setActiveSpeaker(prev => prev === userId ? null : prev);
      }, 2000);
    }
  }, []);

  // Update ParticipantList rendering with null checks
  const renderParticipantList = () => {
    if (!Array.isArray(participants)) return null;

    return (
      <ParticipantList
        participants={participants.filter(p => p && p.id)} // Filter out invalid participants
        activeParticipant={activeSpeaker}
        localUser={socket?.id ? { id: socket.id, isHost } : null}
        showParticipants={showParticipants}
      />
    );
  };

  // Update video rendering with null checks
  const renderRemoteVideos = () => {
    console.log('Rendering remote streams:', remoteStreams);

    return remoteStreams.map((streamInfo) => {
      if (!streamInfo || !streamInfo.userId || !streamInfo.stream) {
        console.log('Invalid stream info:', streamInfo);
        return null;
      }

      const participant = participants.find(p => p && p.id === streamInfo.userId);
      const username = participant?.username || 'Participant';

      return (
        <div key={streamInfo.userId} className="video-container">
          {remoteVideoStates[streamInfo.userId] ? (
            <div className="video-placeholder">
              <div className="placeholder-icon">📹</div>
              <p className="participant-name">Camera Off</p>
            </div>
          ) : (
            <video
              key={`video-${streamInfo.userId}`}
              autoPlay
              playsInline
              muted={false}
              ref={el => {
                if (el && streamInfo.stream && el.srcObject !== streamInfo.stream) {
                  el.srcObject = streamInfo.stream;
                  // Only attempt to play if the video is not already playing
                  if (el.paused) {
                    el.play().catch(err => {
                      console.warn('Initial play failed, will retry on user interaction:', err);
                    });
                  }
                }
              }}
              className="video-element"
              style={{ transform: 'scaleX(-1)' }}
              onLoadedMetadata={(e) => {
                const video = e.target;
                if (video.paused) {
                  video.play().catch(err => {
                    console.warn('Play on loadedmetadata failed:', err);
                  });
                }
              }}
            />
          )}
          <div className="participant-name">{username}</div>
        </div>
      );
    }).filter(Boolean);
  };

  // Update cleanup function
  const cleanupPeerConnection = (userId) => {
    console.log('Cleaning up peer connection for:', userId);
    
    const peerConnection = peerConnectionsRef.current[userId];
    if (peerConnection) {
      // Remove all tracks
      peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      
      // Close the connection
      peerConnection.close();
      delete peerConnectionsRef.current[userId];
      
      // Remove from remote streams
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
      
      // Reset video state
      setRemoteVideoStates(prev => {
        const newStates = { ...prev };
        delete newStates[userId];
        return newStates;
      });
    }
  };

  // Add a retry button to the error container
  const ErrorContainer = ({ error, onRetry, onDismiss }) => (
    <div className="error-container glass fade-in">
      <div className="error-content">
        <h2 className="text-premium-bold">Connection Error</h2>
        <p className="text-premium-light">{error}</p>
        <div className="error-actions">
          <button className="btn-premium" onClick={onRetry}>Try Again</button>
          <button className="btn-premium" onClick={onDismiss}>Continue Without Camera</button>
        </div>
      </div>
    </div>
  );

  // Render functions
  if (error) {
    return (
      <ErrorContainer 
        error={error}
        onRetry={async () => {
          setError(null);
          setVideoError(false);
          try {
            await getUserMedia();
          } catch (e) {
            // Error will be handled by getUserMedia
          }
        }}
        onDismiss={() => {
          setError(null);
          setVideoError(true);
        }}
      />
    );
  }

  if (!isJoined) {
    return <RoomJoin onJoinRoom={joinRoom} onCreateRoom={createRoom} />;
  }

  return (
    <div className="video-chat-container fade-in">
      {/* Premium Header */}
      <div className="chat-header">
        <h1 className="chat-title text-premium-bold">Video Chat</h1>
        <div className="room-info">
          <div className="room-id">
            Room: {roomId}
          </div>
          {isHost && <span className="host-badge">Host</span>}
        </div>
      </div>

      {/* Main Content */}
      <div className="chat-main">
        {/* Video Section */}
        <div className="video-section">
          <div className="video-grid">
            {/* Local Video */}
            <div className="video-container">
              {videoError ? (
                <div className="video-placeholder">
                  <div className="placeholder-icon">📹</div>
                  <p className="participant-name">Camera Not Available</p>
                </div>
              ) : isVideoOff ? (
                <div className="video-placeholder">
                  <div className="placeholder-icon">📹</div>
                  <p className="participant-name">Camera Off</p>
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="video-element"
                  style={{ transform: 'scaleX(-1)', objectFit: 'cover' }}
                  onLoadedMetadata={(e) => {
                    console.log('Video metadata loaded');
                    e.target.play().catch(err => {
                      console.error('Play failed:', err);
                      setVideoError(true);
                    });
                  }}
                  onError={(e) => {
                    console.error('Video error:', e);
                    setVideoError(true);
                  }}
                />
              )}
              <div className="participant-name">You</div>
            </div>

            {/* Remote Videos */}
            {renderRemoteVideos()}
          </div>

          {/* Premium Controls */}
          <div className="controls">
            <button 
              className={`control-button ${isAudioMuted ? 'danger' : 'active'}`}
              onClick={toggleAudio}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? '🔇' : '🎤'}
            </button>
            <button 
              className={`control-button ${isVideoOff ? 'danger' : 'active'}`}
              onClick={toggleVideo}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? '📹' : '📷'}
            </button>
            <button 
              className={`control-button ${isScreenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? '⏹️' : '📺'}
            </button>
            {isHost ? (
              <button 
                className="control-button danger"
                onClick={endCall}
                title="End call for everyone"
              >
                📞
              </button>
            ) : (
              <button 
                className="control-button danger"
                onClick={leaveCall}
                title="Leave call"
              >
                🚪
              </button>
            )}
          </div>
        </div>

        {/* Premium Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h3 className="sidebar-title text-premium-bold">Participants</h3>
          </div>
          <div className="sidebar-content">
            {renderParticipantList()}
            
            {/* Premium Chat */}
            <div className="chat-section">
              <h4 className="text-premium-bold">Chat</h4>
              <div className="chat-messages">
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`chat-message ${msg.userId === socket.id ? 'own' : 'other'}`}
                  >
                    <div className="message-header">
                      <span className="username text-premium-bold">
                        {msg.userId === socket.id ? 'You' : msg.username}
                        {msg.isHost && ' (Host)'}
                      </span>
                      <span className="timestamp text-premium-light">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="message-text text-premium">{msg.text}</p>
                  </div>
                ))}
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  className="input-premium"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type your message..."
                />
                <button 
                  className="btn-premium"
                  onClick={sendMessage}
                  disabled={!message.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;