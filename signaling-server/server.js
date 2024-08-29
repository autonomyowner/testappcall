const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = socketIO(server, {
    cors: {
        origin: "http://localhost:5173", // Your React app origin
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    }
});

const PORT = process.env.PORT || 5000;

io.on('connection', (socket) => {
    socket.emit('me', socket.id)

    // Join the user to a room (a room name can be anything, here we use "main")
    socket.join("main");

    // Notify the new user of all other users in the room
    const usersInRoom = Array.from(io.sockets.adapter.rooms.get("main") || []).filter(id => id !== socket.id);
    socket.emit('allUsers', usersInRoom);

    // Broadcast an offer to other users
    socket.on('offer', ({ to, offer }) => {
        socket.to(to).emit('offer', { from: socket.id, offer });
    });

    // Broadcast an answer to other users
    socket.on('answer', ({ to, answer }) => {
        socket.to(to).emit('answer', { from: socket.id, answer });
    });

    // Broadcast ICE candidates to other users
    socket.on('candidate', ({ to, candidate }) => {
        socket.to(to).emit('candidate', { from: socket.id, candidate });
    });

    // Broadcast chat messages to other users
    socket.on('chatMessage', (message) => {
        socket.broadcast.emit('chatMessage', message);
    });

    // Handle when a user disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        socket.broadcast.emit('userDisconnected', socket.id);
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
