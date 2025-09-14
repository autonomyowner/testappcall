// Audio debugging utilities for WebRTC video chat

export const debugAudio = {
  // Check if audio is working for a video element
  checkVideoAudio: (videoElement) => {
    if (!videoElement) return null;
    
    const audioTracks = videoElement.srcObject?.getAudioTracks() || [];
    const videoTracks = videoElement.srcObject?.getVideoTracks() || [];
    
    return {
      element: {
        muted: videoElement.muted,
        volume: videoElement.volume,
        paused: videoElement.paused,
        readyState: videoElement.readyState,
        currentTime: videoElement.currentTime
      },
      stream: {
        active: videoElement.srcObject?.active,
        audioTracks: audioTracks.map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings()
        })),
        videoTracks: videoTracks.map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        }))
      }
    };
  },

  // Check all video elements on the page
  checkAllVideos: () => {
    const videos = document.querySelectorAll('video');
    const results = {};
    
    videos.forEach((video, index) => {
      const isLocal = video.classList.contains('local');
      results[isLocal ? 'local' : `remote_${index}`] = debugAudio.checkVideoAudio(video);
    });
    
    return results;
  },

  // Force enable audio for all remote videos
  forceEnableAudio: () => {
    const remoteVideos = document.querySelectorAll('video:not(.local)');
    const results = [];
    
    remoteVideos.forEach((video, index) => {
      const before = debugAudio.checkVideoAudio(video);
      
      // Force unmute and set volume
      video.muted = false;
      video.volume = 1.0;
      
      // Try to play
      if (video.paused) {
        video.play().catch(err => console.warn('Play failed:', err));
      }
      
      const after = debugAudio.checkVideoAudio(video);
      
      results.push({
        index,
        before,
        after,
        success: !video.muted && video.volume > 0
      });
    });
    
    return results;
  },

  // Check browser audio context
  checkAudioContext: () => {
    if (window.AudioContext || window.webkitAudioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      return {
        available: true,
        state: AudioContext.state,
        sampleRate: AudioContext.sampleRate,
        baseLatency: AudioContext.baseLatency
      };
    }
    return { available: false };
  },

  // Comprehensive audio check
  fullAudioCheck: () => {
    return {
      timestamp: new Date().toISOString(),
      audioContext: debugAudio.checkAudioContext(),
      videos: debugAudio.checkAllVideos(),
      userAgent: navigator.userAgent,
      mediaDevices: {
        supported: !!navigator.mediaDevices,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia
      }
    };
  }
};

// Make it available globally for console debugging
if (typeof window !== 'undefined') {
  window.debugAudio = debugAudio;
}
