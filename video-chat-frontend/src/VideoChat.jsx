import React, { useRef, useState, useEffect } from 'react';
import socket from './socket'; 

const VideoChat = () => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null); // Reference for the remote video
    const peerConnectionRef = useRef(null); // Reference for the peer connection
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [chatMessages, setChatMessages] = useState([]); // State to hold chat messages
    const [message, setMessage] = useState(''); // State to hold the current input message
    const [isScreenSharing, setIsScreenSharing] = useState(false); // State to track screen sharing

    useEffect(() => {
        const handleReceiveOffer = async (offer) => {
            const peerConnection = new RTCPeerConnection();
            peerConnectionRef.current = peerConnection;

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = stream;

            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });

            peerConnection.ontrack = (event) => {
                remoteVideoRef.current.srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidate', event.candidate);
                }
            };

            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
        };

        const handleReceiveAnswer = async (answer) => {
            const peerConnection = peerConnectionRef.current;
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        };

        const handleReceiveCandidate = async (candidate) => {
            const peerConnection = peerConnectionRef.current;
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        };

        const handleReceiveChatMessage = (message) => {
            setChatMessages(prevMessages => [...prevMessages, { text: message, fromSelf: false }]);
        };

        socket.on('offer', handleReceiveOffer);
        socket.on('answer', handleReceiveAnswer);
        socket.on('candidate', handleReceiveCandidate);
        socket.on('chatMessage', handleReceiveChatMessage);

        return () => {
            socket.off('offer', handleReceiveOffer);
            socket.off('answer', handleReceiveAnswer);
            socket.off('candidate', handleReceiveCandidate);
            socket.off('chatMessage', handleReceiveChatMessage);
        };
    }, []);

    const startCall = async () => {
        setIsCallStarted(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoRef.current.srcObject = stream;

        const peerConnection = new RTCPeerConnection();
        peerConnectionRef.current = peerConnection;

        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });

        peerConnection.ontrack = (event) => {
            remoteVideoRef.current.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate);
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
    };

    const sendMessage = () => {
        if (message.trim()) {
            // Send the message via Socket.io
            socket.emit('chatMessage', message);
            // Update local chat state
            setChatMessages(prevMessages => [...prevMessages, { text: message, fromSelf: true }]);
            setMessage(''); // Clear the input field
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

            const sender = peerConnectionRef.current.getSenders().find(sender => sender.track.kind === 'video');
            sender.replaceTrack(videoTrack);

            videoTrack.onended = () => {
                stopScreenShare();
            };

            setIsScreenSharing(true);
        } catch (error) {
            console.error('Error starting screen share:', error);
        }
    };

    const stopScreenShare = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];

        const sender = peerConnectionRef.current.getSenders().find(sender => sender.track.kind === 'video');
        sender.replaceTrack(videoTrack);

        setIsScreenSharing(false);
    };

    return (
        <div>
            <div style={{border: '1px solid #ccc'}}>
                <video ref={localVideoRef} autoPlay muted />
                <video ref={remoteVideoRef} autoPlay />
            </div>
            <button onClick={startCall} disabled={isCallStarted}>
                Start Call
            </button>
            <button onClick={toggleScreenShare}>
                {isScreenSharing ? 'Stop Sharing Screen' : 'Share Screen'}
            </button>
            <div>
                <h3>Chat</h3>
                <div style={{ border: '1px solid #ccc', height: '200px', overflowY: 'scroll' }}>
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
