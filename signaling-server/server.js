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

const PORT = process.env.PORT || 5000;

const users = {}; // Track users by socket ID

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('joinRoom', ({ username }) => {
        users[socket.id] = username;
        socket.join("main");
        
        // Notify the new user of all other users in the room
        const usersInRoom = Object.keys(users).filter(id => id !== socket.id).map(id => ({
            id: id,
            username: users[id]
        }));
        socket.emit('allUsers', usersInRoom);

        // Broadcast to others that a new user has joined
        socket.broadcast.emit('newUser', { id: socket.id, username });
    });

    socket.on('offer', ({ to, offer }) => {
        socket.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
        socket.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('candidate', ({ to, candidate }) => {
        socket.to(to).emit('candidate', { from: socket.id, candidate });
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        delete users[socket.id];
        socket.broadcast.emit('userDisconnected', { id: socket.id, username });
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
