import React, { useRef, useState, useEffect } from "react";
import socket from "./socket";

const VideoChat = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null); // Reference for the remote video
  const peerConnectionRef = useRef(null); // Reference for the peer connection
  const [isCallStarted, setIsCallStarted] = useState(false);

  useEffect(() => {
    const handleReceiveOffer = async (offer) => {
      // Handle incoming offer
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;
      //Requesting Access to the user's camera and microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream; //Setting the video element's source to the stream
      } catch (error) {
        console.error("Error accessing media devices", error);
      }

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("candidate", event.candidate);
        }
      };

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", answer);
    };

    const handleReceiveAnswer = async (answer) => {
      const peerConnection = peerConnectionRef.current;
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    };

    const handleReceiveCandidate = async (candidate) => {
      const peerConnection = peerConnectionRef.current;
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    socket.on("offer", handleReceiveOffer);
    socket.on("answer", handleReceiveAnswer);
    socket.on("candidate", handleReceiveCandidate);

    return () => {
      socket.off("offer", handleReceiveOffer);
      socket.off("answer", handleReceiveAnswer);
      socket.off("candidate", handleReceiveCandidate);
    };
  }, []); // Empty dependency array to run this effect only once when the component mounts

  const startCall = async () => {
    setIsCallStarted(true);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideoRef.current.srcObject = stream;

    const peerConnection = new RTCPeerConnection();
    peerConnectionRef.current = peerConnection;

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", event.candidate);
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", offer);
  };

  return (
    <div>
      <div>
        <video ref={localVideoRef} autoPlay muted />
        <video ref={remoteVideoRef} autoPlay />
      </div>
      <button onClick={startCall} disabled={isCallStarted}>
        Start Call
      </button>
    </div>
  );
};

export default VideoChat;
