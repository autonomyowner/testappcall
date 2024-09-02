import React, { useRef, useState, useEffect } from 'react';
import socket from './socket';

const VideoChat = () => {
    const localVideoRef = useRef(null);
    const peerConnectionsRef = useRef({});
    const [remoteStreams, setRemoteStreams] = useState([]);
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    useEffect(() => {
        const handleReceiveOffer = async ({ from, offer }) => {
            const peerConnection = createPeerConnection(from);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const stream = await getUserMedia();
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { to: from, answer });
        };

        const handleReceiveAnswer = async ({ from, answer }) => {
            const peerConnection = peerConnectionsRef.current[from];
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        };

        const handleReceiveCandidate = async ({ from, candidate }) => {
            const peerConnection = peerConnectionsRef.current[from];
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        };

        const handleReceiveChatMessage = (message) => {
            setChatMessages(prevMessages => [...prevMessages, { text: message, fromSelf: false }]);
        };

        socket.on('offer', handleReceiveOffer);
        socket.on('answer', handleReceiveAnswer);
        socket.on('candidate', handleReceiveCandidate);
        socket.on('chatMessage', handleReceiveChatMessage);

        socket.emit('joinRoom');
        socket.on('allUsers', handleAllUsers);

        return () => {
            socket.off('offer', handleReceiveOffer);
            socket.off('answer', handleReceiveAnswer);
            socket.off('candidate', handleReceiveCandidate);
            socket.off('chatMessage', handleReceiveChatMessage);
            socket.off('allUsers', handleAllUsers);
        };
    }, []);

    const getUserMedia = async () => {
        try {
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (error) {
            console.error('Error accessing media devices.', error);
            alert('Could not access your camera or microphone. Please check your devices.');
            throw error;
        }
    };

    const createPeerConnection = (userId) => {
        const peerConnection = new RTCPeerConnection();

        peerConnection.ontrack = (event) => {
            setRemoteStreams(prevStreams => {
                const existingStream = prevStreams.find(stream => stream.id === event.streams[0].id);
                if (existingStream) return prevStreams;
                return [...prevStreams, event.streams[0]];
            });
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', { to: userId, candidate: event.candidate });
            }
        };

        peerConnectionsRef.current[userId] = peerConnection;
        return peerConnection;
    };

    const handleAllUsers = async (users) => {
        const stream = await getUserMedia();
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

        users.forEach(async (userId) => {
            const peerConnection = createPeerConnection(userId);

            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { to: userId, offer });
        });
    };

    const sendMessage = () => {
        if (message.trim()) {
            socket.emit('chatMessage', message);
            setChatMessages(prevMessages => [...prevMessages, { text: message, fromSelf: true }]);
            setMessage('');
        }
    };

    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    };

    const startScreenShare = async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];

            Object.values(peerConnectionsRef.current).forEach(peerConnection => {
                const sender = peerConnection.getSenders().find(sender => sender.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            });

            videoTrack.onended = () => {
                stopScreenShare();
            };

            setIsScreenSharing(true);
        } catch (error) {
            console.error('Error starting screen share:', error);
        }
    };

    const stopScreenShare = async () => {
        const stream = await getUserMedia();
        const videoTrack = stream.getVideoTracks()[0];

        Object.values(peerConnectionsRef.current).forEach(peerConnection => {
            const sender = peerConnection.getSenders().find(sender => sender.track.kind === 'video');
            sender.replaceTrack(videoTrack);
        });

        setIsScreenSharing(false);
    };

    useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localVideoRef.current.srcObject; // Set srcObject using ref
        }
    }, [localVideoRef]);

    useEffect(() => {
        remoteStreams.forEach((stream, index) => {
            const videoElement = document.getElementById(`remoteVideo${index}`);
            if (videoElement) {
                videoElement.srcObject = stream;
            }
        });
    }, [remoteStreams]);

    return (
        <div>
            <div>
                <video ref={localVideoRef} autoPlay muted />
                {remoteStreams.map((stream, index) => (
                    <video key={index} id={`remoteVideo${index}`} autoPlay />
                ))}
            </div>
            <button onClick={() => setIsCallStarted(true)} disabled={isCallStarted}>
                Start Call
            </button>
            <button onClick={toggleScreenShare}>
                {isScreenSharing ? 'Stop Sharing Screen' : 'Share Screen'}
            </button>
            <div>
                <h3>Chat</h3>
                <div style={{ border: '1px solid #ccc', height: '100px', overflowY: 'scroll' }}>
                    {chatMessages.map((msg, index) => (
                        <div key={index} style={{ textAlign: msg.fromSelf ? 'right' : 'left' }}>
                            <p style={{ margin: '5px' }}>{msg.text}</p>
                        </div>
                    ))}
                </div>
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    style={{ width: '80%' }}
                />
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default VideoChat;
