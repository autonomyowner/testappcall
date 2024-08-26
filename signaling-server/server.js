const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors'); // Import the cors middleware

const app = express();
const server = http.createServer(app);

// Use the cors middleware with default settings
app.use(cors());

// Configure Socket.io with CORS options
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:5173", 
        methods: ["GET", "POST"], // Allowed HTTP methods
        allowedHeaders: ["Content-Type"],
        credentials: true // Allow credentials
    }
});

app.get("/", (req, res) => {
    res.send('Server is Running');
})

const PORT = process.env.PORT || 5000;

io.on('connection', (socket) => {
    socket.emit('me', socket.id)

    // Handle the 'offer' event from the client
    socket.on('offer', ({userTocall, signalData, from, name}) => {
        io.to(userTocall).emit('offer', {signal: signalData, from, name})
    });

    // Handle the 'answer' event from the client
    socket.on('answer', (data) => {
        io.to(data.to).emit('callaccepted', data.signal)
    });

    // Handle the 'candidate' event from the client
    socket.on('candidate', (data) => {
        socket.broadcast.emit('candidate', data);
    });

    // Handle the 'chatMessage' event from the client
    socket.on('chatMessage', (message) => {
        socket.broadcast.emit('chatMessage', message);
    });

    // Handle when a user disconnects
    socket.on('disconnect', () => {
        socket.broadcast.emit('callended')
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
