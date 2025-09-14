import { io } from 'socket.io-client';

// Use environment variable for the server URL, fallback to localhost for development
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const socket = io(SERVER_URL, {
    withCredentials: true,
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err);
});

export default socket;
