import React, { useRef, useState, useEffect } from "react";
import socket from "./socket";

const VideoChat = () => {
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    const handleReceiveOffer = async ({ from, offer }) => {
      const peerConnection = createPeerConnection(from);
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const stream = await getUserMedia();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    };

    const handleReceiveAnswer = async ({ from, answer }) => {
      const peerConnection = peerConnectionsRef.current[from];
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    };

    const handleReceiveCandidate = async ({ from, candidate }) => {
      const peerConnection = peerConnectionsRef.current[from];
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const handleReceiveChatMessage = (message) => {
      setChatMessages((prevMessages) => [
        ...prevMessages,
        { text: message, fromSelf: false },
      ]);
    };

    const handleUserDisconnected = (userId) => {
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
        setRemoteStreams((prevStreams) =>
          prevStreams.filter((stream) => stream.id !== userId)
        );
      }
    };

    socket.on("offer", handleReceiveOffer);
    socket.on("answer", handleReceiveAnswer);
    socket.on("candidate", handleReceiveCandidate);
    socket.on("chatMessage", handleReceiveChatMessage);
    socket.on("userDisconnected", handleUserDisconnected);

    socket.emit("joinRoom");
    socket.on("allUsers", handleAllUsers);

    return () => {
      socket.off("offer", handleReceiveOffer);
      socket.off("answer", handleReceiveAnswer);
      socket.off("candidate", handleReceiveCandidate);
      socket.off("chatMessage", handleReceiveChatMessage);
      socket.off("userDisconnected", handleUserDisconnected);
      socket.off("allUsers", handleAllUsers);
    };
  }, []);

  const getUserMedia = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (error) {
      console.error("Error accessing media devices.", error);
      alert(
        "Could not access your camera or microphone. Please check your devices."
      );
      throw error;
    }
  };

  const createPeerConnection = (userId) => {
    const peerConnection = new RTCPeerConnection();

    peerConnection.ontrack = (event) => {
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
        socket.emit("candidate", { to: userId, candidate: event.candidate });
      }
    };

    peerConnection.onconnectionstatechange = async () => {
      if (
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "failed"
      ) {
        console.log(
          `Connection with ${userId} lost. Attempting to reconnect...`
        );
        try {
          await peerConnection.restartIce();
        } catch (error) {
          console.error("ICE restart failed:", error);
          handleUserDisconnected(userId);
        }
      }
    };

    peerConnectionsRef.current[userId] = peerConnection;

    peerConnection.addEventListener("track", () => {
      setVideoBandwidth(peerConnection, 500);
    });

    return peerConnection;
  };

  const setVideoBandwidth = (peerConnection, maxBandwidth) => {
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track.kind === "video");
    if (sender) {
      const parameters = sender.getParameters();

      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }

      parameters.encodings[0].maxBitrate = maxBandwidth * 1000;

      sender
        .setParameters(parameters)
        .catch((err) => console.error("Error setting bandwidth:", err));
    }
  };

  const handleAllUsers = async (users) => {
    const stream = await getUserMedia();
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    users.forEach(async (userId) => {
      const peerConnection = createPeerConnection(userId);

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
  };

  const sendMessage = () => {
    if (message.trim()) {
      socket.emit("chatMessage", message);
      setChatMessages((prevMessages) => [
        ...prevMessages,
        { text: message, fromSelf: true },
      ]);
      setMessage("");
    }
  };

  const toggleAudio = () => {
    const stream = localVideoRef.current.srcObject;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsAudioMuted(!isAudioMuted);
  };

  const toggleVideo = () => {
    const stream = localVideoRef.current.srcObject;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsVideoOff(!isVideoOff);
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
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const videoTrack = screenStream.getVideoTracks()[0];

      Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
        const sender = peerConnection
          .getSenders()
          .find((sender) => sender.track.kind === "video");
        sender.replaceTrack(videoTrack);
      });

      videoTrack.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
    } catch (error) {
      console.error("Error starting screen share:", error);
    }
  };

  const stopScreenShare = async () => {
    const stream = await getUserMedia();
    const videoTrack = stream.getVideoTracks()[0];

    Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
      const sender = peerConnection
        .getSenders()
        .find((sender) => sender.track.kind === "video");
      sender.replaceTrack(videoTrack);
    });

    setIsScreenSharing(false);
  };

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localVideoRef.current.srcObject;
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
    <div className="container">
      <div className="video-wrapper">
        <div className="videos">
          <video
            ref={localVideoRef}
            autoPlay
            muted={!isCallStarted || isAudioMuted}
          />
          {remoteStreams.map((stream, index) => (
            <video key={index} id={`remoteVideo${index}`} autoPlay />
          ))}
        </div>
        <div className="controls">
          <button
            onClick={() => setIsCallStarted(true)}
            disabled={isCallStarted}
          >
            Start Call
          </button>
          <button onClick={toggleAudio}>
            {isAudioMuted ? (
              <span class="material-symbols-outlined">mic</span>
            ) : (
              <span class="material-symbols-outlined">mic_off</span>
            )}
          </button>
          <button onClick={toggleVideo}>
            {isVideoOff ? (
              <span class="material-symbols-outlined">videocam</span>
            ) : (
              <span class="material-symbols-outlined">videocam_off</span>
            )}
          </button>
          <button onClick={toggleScreenShare}>
            {isScreenSharing ? (
              <span class="material-symbols-outlined">stop_screen_share</span>
            ) : (
              <span class="material-symbols-outlined">screen_share</span>
            )}
          </button>
        </div>
      </div>
      <div className="message-wrapper">
        <h3>Chat</h3>
        <div className="message-box">
          {chatMessages.map((msg, index) => (
            <div
              key={index}
              style={{ textAlign: msg.fromSelf ? "right" : "left" }}
            >
              <p style={{ margin: "5px" }}>{msg.text}</p>
            </div>
          ))}
        </div>
        <div className="message-input">
          <div class="brutalist-container">
            <input
              class="brutalist-input smooth-type"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type your message..."
            />
            <label class="brutalist-label">HAVE A MESSAGE??</label>
          </div>
          <button className="send" onClick={sendMessage}>
            <div class="svg-wrapper-1">
              <div class="svg-wrapper">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                >
                  <path fill="none" d="M0 0h24v24H0z"></path>
                  <path
                    fill="currentColor"
                    d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"
                  ></path>
                </svg>
              </div>
            </div>
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
