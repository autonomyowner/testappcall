import React from "react";

const ParticipantList = ({ participants, activeParticipant, localUser, showParticipants }) => {
  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!participants || participants.length === 0) {
    return (
      <div className="participants-section">
        <div className="participants-header">
          <h4 className="text-premium-bold">Participants</h4>
          <span className="participant-count">1</span>
        </div>
        <div className="participant-item local-user">
          <div className="participant-avatar premium">
            <span className="avatar-initials">You</span>
          </div>
          <div className="participant-info">
            <div className="participant-name text-premium">You</div>
            <div className="participant-status">
              <span className="status-badge host">Host</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="participants-section">
      <div className="participants-header">
        <h4 className="text-premium-bold">Participants</h4>
        <span className="participant-count">{participants.length + 1}</span>
      </div>
      
      <div className="participants-list">
        {/* Local user */}
        <div className="participant-item local-user">
          <div className="participant-avatar premium">
            <span className="avatar-initials">You</span>
          </div>
          <div className="participant-info">
            <div className="participant-name text-premium">You</div>
            <div className="participant-status">
              {localUser?.isHost && <span className="status-badge host">Host</span>}
            </div>
          </div>
        </div>

        {/* Remote participants */}
        {participants.map((participant) => (
          <div
            key={participant.id}
            className={`participant-item ${
              participant.id === activeParticipant ? "speaking" : ""
            }`}
          >
            <div className="participant-avatar premium">
              <span className="avatar-initials">
                {getInitials(participant.username)}
              </span>
              {participant.id === activeParticipant && (
                <div className="speaking-indicator"></div>
              )}
            </div>
            <div className="participant-info">
              <div className="participant-name text-premium">
                {participant.username || 'Participant'}
              </div>
              <div className="participant-status">
                {participant.isHost && <span className="status-badge host">Host</span>}
                <div className="status-icons">
                  {participant.isAudioMuted && (
                    <span className="status-icon muted" title="Muted">🔇</span>
                  )}
                  {participant.isVideoOff && (
                    <span className="status-icon video-off" title="Camera Off">📹</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantList;
