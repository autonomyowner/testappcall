import React, { useRef, useState, useEffect, useCallback } from "react";
import socket from "./socket";
import RoomJoin from './components/RoomJoin';
import ConnectionStatus from './components/ConnectionStatus';
import ParticipantList from './components/ParticipantList';
import { debugAudio } from './audioDebug';
import './styles/VideoChat.css';

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
        console.log('Received track:', {
          kind: event.track.kind,
          enabled: event.track.enabled,
          muted: event.track.muted,
          readyState: event.track.readyState,
          from: userId
        });
        
        if (!event.streams || !event.streams[0]) {
          console.warn('Received track without stream');
          return;
        }

        const newStream = event.streams[0];
        console.log('Received stream with tracks:', newStream.getTracks().map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        })));
        
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

        // Special handling for audio tracks
        if (event.track.kind === 'audio') {
          console.log('Audio track received from:', userId, {
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState
          });
          
          // Ensure the audio track is enabled
          if (!event.track.enabled) {
            console.log('Enabling received audio track');
            event.track.enabled = true;
          }
        }
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
          console.log('Adding track:', {
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings()
          });
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

  // Function to test and enable audio for all remote videos
  const enableRemoteAudio = () => {
    console.log('Manually enabling remote audio...');
    
    // Use the debugging utility to get detailed info
    const audioCheck = debugAudio.fullAudioCheck();
    console.log('Full audio check:', audioCheck);
    
    // Force enable audio for all remote videos
    const results = debugAudio.forceEnableAudio();
    console.log('Audio enable results:', results);
    
    // Also try to resume any suspended audio context
    if (window.AudioContext || window.webkitAudioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext.state === 'suspended') {
        AudioContext.resume().then(() => {
          console.log('Audio context resumed');
        }).catch(err => {
          console.warn('Failed to resume audio context:', err);
        });
      }
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
            <div className="video-error">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera turned off</p>
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
                  console.log('Setting remote video srcObject for user:', streamInfo.userId);
                  console.log('Remote stream tracks:', streamInfo.stream.getTracks().map(track => ({
                    kind: track.kind,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                  })));
                  
                  // Only attempt to play if the video is not already playing
                  if (el.paused) {
                    el.play().catch(err => {
                      console.warn('Initial play failed, will retry on user interaction:', err);
                    });
                  }
                }
              }}
              className="video-item"
              style={{ transform: 'scaleX(-1)' }}
              onLoadedMetadata={(e) => {
                const video = e.target;
                console.log('Remote video metadata loaded for user:', streamInfo.userId);
                console.log('Video element properties:', {
                  paused: video.paused,
                  muted: video.muted,
                  volume: video.volume,
                  readyState: video.readyState
                });
                
                if (video.paused) {
                  video.play().catch(err => {
                    console.warn('Play on loadedmetadata failed:', err);
                  });
                }
              }}
              onCanPlay={(e) => {
                console.log('Remote video can play for user:', streamInfo.userId);
                const video = e.target;
                
                // Ensure audio is enabled
                video.muted = false;
                video.volume = 1.0;
                
                if (video.paused) {
                  video.play().catch(err => {
                    console.warn('Play on canplay failed:', err);
                  });
                }
                
                console.log('Remote video audio settings:', {
                  muted: video.muted,
                  volume: video.volume,
                  paused: video.paused
                });
              }}
              onError={(e) => {
                console.error('Remote video error for user:', streamInfo.userId, e);
              }}
            />
          )}
          <div className="participant-name">{username}</div>
        </div>
      );
    }).filter(Boolean);
  };

  // Add socket connection status check
  useEffect(() => {
    const checkSocketConnection = () => {
      if (!socket || !socket.connected) {
        console.error('Socket disconnected');
        setError('Connection lost. Please refresh the page.');
        setConnectionStatus('disconnected');
      }
    };

    const interval = setInterval(checkSocketConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  // Add cleanup for streams when component unmounts
  useEffect(() => {
    return () => {
      // Stop all tracks in local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Stop all remote streams
      remoteStreams.forEach(streamInfo => {
        if (streamInfo.stream) {
          streamInfo.stream.getTracks().forEach(track => track.stop());
        }
      });
    };
  }, []);

  // Add a useEffect to handle automatic video playing and audio issues
  useEffect(() => {
    const handleUserInteraction = () => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.paused) {
          video.play().catch(err => {
            console.warn('Play after user interaction failed:', err);
          });
        }
        
        // Ensure remote videos are unmuted and have volume
        if (!video.classList.contains('local')) {
          video.muted = false;
          video.volume = 1.0;
          console.log('Ensuring remote video is unmuted:', {
            muted: video.muted,
            volume: video.volume,
            paused: video.paused
          });
        }
      });
    };

    // Add event listeners for user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Add useEffect to automatically enable audio when remote streams change
  useEffect(() => {
    if (remoteStreams.length > 0) {
      console.log('Remote streams changed, checking audio...');
      setTimeout(() => {
        enableRemoteAudio();
      }, 1000); // Small delay to ensure video elements are rendered
    }
  }, [remoteStreams]);

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
      {showParticipants && renderParticipantList()}
      <ConnectionStatus 
        status={connectionStatus}
        roomId={roomId}
        isHost={isHost}
      />
      <div className="video-wrapper">
        <div className={getVideoContainerClass()}>
          {/* Local Video */}
          {videoError ? (
            <div className="video-error">
              <span className="material-symbols-outlined">error</span>
              <p>Camera not available</p>
            </div>
          ) : isVideoOff ? (
            <div className="video-error local">
              <span className="material-symbols-outlined">videocam_off</span>
              <p>Camera turned off</p>
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

          {/* Remote Videos */}
          {renderRemoteVideos()}
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
          <button onClick={enableRemoteAudio} title="Enable Remote Audio">
            <span className="material-symbols-outlined">volume_up</span>
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
