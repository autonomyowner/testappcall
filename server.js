// Add this to your socket.io event handlers
socket.on('videoStateChange', ({ roomId, isVideoOff }) => {
  // Broadcast to all users in the room except sender
  socket.to(roomId).emit('videoStateChanged', {
    userId: socket.id,
    isVideoOff
  });
});

// When a user joins, notify others of their initial video state
socket.on('joinRoom', ({ roomId, username }) => {
  // Create user object
  const user = {
    id: socket.id,
    username,
    isVideoOff: false
  };
  
  // Add user to room
  if (!rooms[roomId]) {
    rooms[roomId] = [];
  }
  rooms[roomId].push(user);
  
  // Join socket room
  socket.join(roomId);
  
  // Notify others about the new user
  socket.to(roomId).emit('userJoined', { user });
  
  // Send room info back to the user
  socket.emit('roomJoined', {
    roomId,
    users: rooms[roomId],
    isHost: rooms[roomId].length === 1
  });
}); 