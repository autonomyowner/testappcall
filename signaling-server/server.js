 const express = require('express')
 const http = require('http')
 const socketIO = require('socket.io')

 const app = express();
 const server = http.createServer(app);
 const io = socketIO(server);

 const PORT = process.env.PORT || 5000;

 io.on('connection', (socket) =>{
    console.log('New user connected', socket.id)

    socket.on('disconnect', () =>{
        console.log('User disconnected', socket.id)
    });
 });

 server.listen(PORT, () => console.log(`Server running on port ${PORT}`));