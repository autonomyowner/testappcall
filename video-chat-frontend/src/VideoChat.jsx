import React, { useRef, useState, useEffect, useCallback } from "react";
import socket from "./socket";
import RoomJoin from './components/RoomJoin';
import ConnectionStatus from './components/ConnectionStatus';
import ParticipantList from './components/ParticipantList';
import './styles/VideoChat.css';

const VideoChat = () => {
  // Refs
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);

  // Video/Call State
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Room States
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

  const getUserMedia = async (constraints = { 
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    }, 
    audio: true 
  }) => {
    try {
      // First try to release any existing tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Try to get media with video first
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        return stream;
      } catch (videoError) {
        console.error("Error with video:", videoError);
        
        // If video fails, try audio only
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ 
          video: false, 
          audio: true 
        });
        
        localStreamRef.current = audioOnlyStream;
        setVideoError(true);
        setError("Camera not available. Continuing with audio only.");
        return audioOnlyStream;
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
      
      // Provide more specific error messages
      let errorMessage = "Could not access media devices. ";
      if (error.name === "NotReadableError") {
        errorMessage += "Please ensure your camera is not being used by another application and try again.";
      } else if (error.name === "NotAllowedError") {
        errorMessage += "Please allow access to your camera and microphone.";
      } else if (error.name === "NotFoundError") {
        errorMessage += "No camera or microphone found.";
      }
      
      setError(errorMessage);
      throw error;
    }
  };

  const createPeerConnection = useCallback((userId) => {
    try {
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      const peerConnection = new RTCPeerConnection(configuration);

      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.streams[0]);
        setRemoteStreams((prevStreams) => {
          const existingStream = prevStreams.find(
            (stream) => stream.id === event.streams[0].id
          );
          if (existingStream) return prevStreams;
          return [...prevStreams, event.streams[0]];
        });
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("candidate", { 
            to: userId, 
            candidate: event.candidate,
            roomId 
          });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        setConnectionStatus(peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
          handleConnectionFailure(userId);
        }
      };

      peerConnectionsRef.current[userId] = peerConnection;
      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      setError(`Connection Error: ${error.message}`);
      throw error;
    }
  }, [roomId]);

  // Handle room creation
  const createRoom = async (username) => {
    try {
      await getUserMedia();
      socket.emit('createRoom', { username });
    } catch (error) {
      setError(`Failed to create room: ${error.message}`);
    }
  };

  // Add this function to check permissions
  const checkMediaPermissions = async () => {
    try {
      const permissions = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissions.getTracks().forEach(track => track.stop()); // Clean up test stream
      return true;
    } catch (error) {
      console.error('Media permission error:', error);
      setError('Please allow camera and microphone access');
      return false;
    }
  };

  // Handle room joining
  const joinRoom = async (roomId, username) => {
    try {
      console.log('Attempting to join room:', { roomId, username }); // Debug log
      
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
      const peerConnection = createPeerConnection(userId);
      const stream = localStreamRef.current;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { to: userId, offer });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      setError('Failed to connect with peer');
    }
  };

  // Socket event handlers
  useEffect(() => {
    socket.on('roomCreated', ({ roomId }) => {
      setRoomId(roomId);
      setIsHost(true);
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();
      navigator.clipboard.writeText(roomId);
      alert(`Room created! Room ID: ${roomId} (copied to clipboard)`);
    });

    socket.on('roomJoined', ({ roomId, users, isHost }) => {
      setRoomId(roomId);
      setIsHost(isHost);
      setParticipants(users);
      setConnectionStatus('connected');
      setIsJoined(true);
      clearChat();

      users.forEach(user => {
        if (!peerConnectionsRef.current[user.id]) {
          initiateCall(user.id);
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
      console.log('Received message:', messageData);
      if (!messageData.text || !messageData.userId) {
        console.error('Invalid message data:', messageData);
        return;
      }
      setChatMessages(prev => [...prev, messageData]);
    });

    socket.on('userLeft', (user) => {
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
    };
  }, [createPeerConnection]);

  // Handle user disconnection
  const handleUserDisconnected = (userId) => {
    if (peerConnectionsRef.current[userId]) {
      peerConnectionsRef.current[userId].close();
      delete peerConnectionsRef.current[userId];
      setRemoteStreams(prev => prev.filter(stream => stream.id !== userId));
      setParticipants(prev => prev.filter(p => p.id !== userId));
    }
  };

  // Media control functions
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
    }
  };

  // Screen sharing functions
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

  // Add connection state logging
  useEffect(() => {
    const logConnectionState = () => {
      Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
        console.log(`Connection state with ${userId}:`, {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState
        });
      });
    };

    const interval = setInterval(logConnectionState, 5000);
    return () => clearInterval(interval);
  }, []);

  // Add this useEffect to monitor video element and stream
  useEffect(() => {
    if (localVideoRef.current) {
      console.log('Local video element:', {
        srcObject: localVideoRef.current.srcObject,
        readyState: localVideoRef.current.readyState,
        videoWidth: localVideoRef.current.videoWidth,
        videoHeight: localVideoRef.current.videoHeight,
        paused: localVideoRef.current.paused
      });
    }
    
    if (localStreamRef.current) {
      console.log('Local stream:', {
        active: localStreamRef.current.active,
        tracks: localStreamRef.current.getTracks().map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted
        }))
      });
    }
  }, [localVideoRef.current?.srcObject]);

  // Add this useEffect to monitor video track status
  useEffect(() => {
    const checkVideoTrack = () => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Video track status:', {
            enabled: videoTrack.enabled,
            muted: videoTrack.muted,
            readyState: videoTrack.readyState,
            constraints: videoTrack.getConstraints(),
            settings: videoTrack.getSettings()
          });
        } else {
          console.error('No video track found');
        }
      }
    };

    checkVideoTrack();
    const interval = setInterval(checkVideoTrack, 2000);
    return () => clearInterval(interval);
  }, []);

  // Add a retry button to the error container
  const ErrorContainer = ({ error, onRetry, onDismiss }) => (
    <div className="error-container">
      <h2>Error</h2>
      <p>{error}</p>
      <div className="error-buttons">
        <button onClick={onRetry}>Try Again</button>
        <button onClick={onDismiss}>Continue Without Camera</button>
      </div>
    </div>
  );

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

  // Add this useEffect for audio analysis
  useEffect(() => {
    if (localStreamRef.current) {
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaStreamSource(localStreamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -70;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;
      
      audioSource.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingTimeout;
      
      const checkAudioLevel = () => {
        if (audioContext.state === 'closed') return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        if (average > 20) { // Adjust threshold as needed
          handleSpeakingStateChange(socket.id, true);
        }
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
      
      return () => {
        audioContext.close();
        clearTimeout(speakingTimeout);
      };
    }
  }, [localStreamRef.current]);

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
    <div className="container">
      {showParticipants && (
        <ParticipantList
          participants={participants}
          activeParticipant={activeSpeaker}
          localUser={{ id: socket.id, isHost }}
          showParticipants={showParticipants}
        />
      )}
      <ConnectionStatus 
        status={connectionStatus}
        roomId={roomId}
        isHost={isHost}
      />
      <div className="video-wrapper">
        <div className={getVideoContainerClass()}>
          {videoError || isVideoOff ? (
            <div className="video-error">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera not available</p>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video-item local"
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
          {remoteStreams.map((stream, index) => (
            isVideoOff ? (
              <div key={stream.id} className="video-error">
                <span className="material-symbols-outlined">videocam_off</span>
                <p>Camera not available</p>
              </div>
            ) : (
              <video
                key={stream.id}
                autoPlay
                playsInline
                className="video-item"
                ref={el => {
                  if (el) {
                    el.srcObject = stream;
                  }
                }}
              />
            )
          ))}
        </div>
        <div className="controls">
          <button onClick={toggleAudio}>
            {isAudioMuted ? (
              <span className="material-symbols-outlined">mic_off</span>
            ) : (
              <span className="material-symbols-outlined">mic</span>
            )}
          </button>
          <button onClick={toggleVideo}>
            {isVideoOff ? (
              <span className="material-symbols-outlined">videocam_off</span>
            ) : (
              <span className="material-symbols-outlined">videocam</span>
            )}
          </button>
          <button onClick={toggleScreenShare}>
            {isScreenSharing ? (
              <span className="material-symbols-outlined">stop_screen_share</span>
            ) : (
              <span className="material-symbols-outlined">screen_share</span>
            )}
          </button>
          <div className="control-separator"></div>
          {isHost ? (
            <button onClick={endCall} className="end-call">
              <span className="material-symbols-outlined">call_end</span>
            </button>
          ) : (
            <button onClick={leaveCall} className="leave-call">
              <span className="material-symbols-outlined">logout</span>
            </button>
          )}
          <button 
            onClick={() => setShowParticipants(!showParticipants)}
            className="participant-toggle"
          >
            <span className="material-symbols-outlined">
              {showParticipants ? 'person_off' : 'people'}
            </span>
          </button>
        </div>
      </div>
      <div className="message-wrapper">
        <h3>Chat</h3>
        <div className="message-box">
          {chatMessages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.userId === socket.id ? 'self' : 'other'}`}
            >
              <span className="username">
                {msg.userId === socket.id ? 'You' : msg.username}
                {msg.isHost && ' (Host)'}
              </span>
              <p>{msg.text}</p>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
        <div className="message-input">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type your message..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
