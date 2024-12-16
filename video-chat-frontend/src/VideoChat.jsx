import React, { useRef, useState, useEffect, useCallback } from "react";
import socket from "./socket";
import RoomJoin from './components/RoomJoin';
import ConnectionStatus from './components/ConnectionStatus';
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

  const getUserMedia = async (constraints = { video: true, audio: true }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      Object.values(peerConnectionsRef.current).forEach(pc => {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      });

      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setError(`Media Error: ${error.message}`);
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

  // Handle room joining
  const joinRoom = async (roomId, username) => {
    try {
      await getUserMedia();
      socket.emit('joinRoom', { roomId, username });
    } catch (error) {
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
      setChatMessages(prev => [...prev, messageData]);
    });

    socket.on('userLeft', (user) => {
      handleUserDisconnected(user.id);
    });

    socket.on('callEnded', () => {
      alert('Call has been ended by the host');
      leaveCall();
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
      const messageToSend = message.trim();
      socket.emit('chatMessage', { 
        roomId, 
        message: messageToSend 
      });
      setMessage('');
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
    // Close all peer connections
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Reset states
    setRemoteStreams([]);
    setIsCallStarted(false);
    setIsJoined(false);
    clearChat();
    socket.emit('leaveRoom', { roomId });
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

  // Render functions
  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  if (!isJoined) {
    return <RoomJoin onJoinRoom={joinRoom} onCreateRoom={createRoom} />;
  }

  return (
    <div className="container">
      <ConnectionStatus 
        status={connectionStatus}
        roomId={roomId}
        isHost={isHost}
      />
      <div className="video-wrapper">
        <div className={getVideoContainerClass()}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-item local"
          />
          {remoteStreams.map((stream, index) => (
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
