import React, { useRef } from 'react';

const VideoChat = () => {
    const localVideoRef = useRef(null);

    return (
        <div>
            <video ref={localVideoRef} autoPlay muted />
        </div>
    );
};

export default VideoChat;
