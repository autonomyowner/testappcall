const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = socketIO(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const rooms = new Map(); // Track rooms and their participants
const users = new Map(); // Track user details
const roomMessages = new Map();

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Create or join a room
    socket.on('createRoom', ({ username }) => {
        const roomId = generateRoomId();
        joinRoom(socket, { roomId, username, isHost: true });
        socket.emit('roomCreated', { roomId });
    });

    // Join existing room
    socket.on('joinRoom', ({ roomId, username }) => {
        if (!rooms.has(roomId)) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        joinRoom(socket, { roomId, username, isHost: false });
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ to, offer }) => {
        const user = users.get(socket.id);
        if (user) {
            socket.to(to).emit('offer', {
                from: socket.id,
                offer,
                username: user.username,
                isHost: user.isHost
            });
        }
    });

    socket.on('answer', ({ to, answer }) => {
        const user = users.get(socket.id);
        if (user) {
            socket.to(to).emit('answer', {
                from: socket.id,
                answer,
                username: user.username
            });
        }
    });

    socket.on('candidate', ({ to, candidate }) => {
        socket.to(to).emit('candidate', { from: socket.id, candidate });
    });

    // Handle chat messages
    socket.on('chatMessage', ({ roomId, message }) => {
        const user = users.get(socket.id);
        if (user && rooms.has(roomId)) {
            const messageData = {
                userId: socket.id,
                username: user.username,
                text: message,
                timestamp: new Date().toISOString(),
                isHost: user.isHost
            };
            
            // Store message in room messages
            if (!roomMessages.has(roomId)) {
                roomMessages.set(roomId, []);
            }
            roomMessages.get(roomId).push(messageData);
            
            // Broadcast to everyone in the room
            io.to(roomId).emit('chatMessage', messageData);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });

    // Add these event handlers in your socket.io connection handler
    socket.on('leaveRoom', ({ roomId }) => {
        handleDisconnect(socket);
    });

    socket.on('endCall', ({ roomId }) => {
        const user = users.get(socket.id);
        if (user && user.isHost) {
            io.to(roomId).emit('callEnded');
            // Clean up the room
            if (rooms.has(roomId)) {
                rooms.delete(roomId);
                // Clear room messages
                if (roomMessages.has(roomId)) {
                    roomMessages.delete(roomId);
                }
            }
        }
    });
});

// Helper functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function joinRoom(socket, { roomId, username, isHost }) {
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }

    // Add user to room
    rooms.get(roomId).add(socket.id);
    socket.join(roomId);

    // Store user details
    users.set(socket.id, {
        id: socket.id,
        username,
        roomId,
        isHost
    });

    // Get all users in the room
    const usersInRoom = Array.from(rooms.get(roomId))
        .map(id => users.get(id))
        .filter(user => user && user.id !== socket.id);

    // Send room info to the new user
    socket.emit('roomJoined', {
        roomId,
        users: usersInRoom,
        isHost
    });

    // Notify others in the room
    socket.to(roomId).emit('userJoined', {
        id: socket.id,
        username,
        isHost
    });
}

function handleDisconnect(socket) {
    const user = users.get(socket.id);
    if (user) {
        const { roomId } = user;
        
        // Remove user from room
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }

        // Remove user from users map
        users.delete(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('userLeft', {
            id: socket.id,
            username: user.username,
            isHost: user.isHost
        });
    }
}

server.listen(5000, () => console.log('Server running on port 5000'));
