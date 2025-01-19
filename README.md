# Real-Time Video Chat Application

A real-time video chat application built with React, WebRTC, and Socket.IO that enables users to have video conversations in private rooms.

## Features

- 🎥 **Real-time video and audio streaming**
- 💬 **Text chat functionality**
- 🔐 **Private room creation**
- 👥 **Multiple participant support**
- 📱 **Responsive design**
- 🎛️ **Camera/Microphone controls**
- 🔗 **Shareable room links**
- ⚡ **Low-latency communication**

## Technologies Used

### Frontend:
- **React.js**
- **WebRTC**
- **Socket.IO-client**
- **Material UI Icons**
- **CSS3**

### Backend:
- **Node.js**
- **Express.js**
- **Socket.IO**
- **WebRTC Signaling**

## Getting Started

### Prerequisites

Ensure the following are installed:

- **Node.js**: Version 14 or higher
- **npm** or **yarn**
- **Git**

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/HabibAdavize/Video-Chat-WebRTC.git
   cd Video-Chat-WebRTC
   ```

2. Install frontend dependencies:
   ```bash
   cd client
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd ../server
   npm install
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

5. Start the frontend application:
   ```bash
   cd ../client
   npm start
   ```

6. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

1. Open the application in your browser.
2. Allow camera and microphone permissions when prompted.
3. Create a new room or join an existing one using a room ID.
4. Share the room ID with others to join the video chat.

### Use the control buttons to:
- Toggle camera
- Toggle microphone
- Leave the room
- Send chat messages

## Features in Detail

### Video Chat
- Real-time video and audio streaming using WebRTC
- Support for multiple participants
- Camera on/off toggle
- Microphone mute/unmute toggle

### Room Management
- Create private rooms
- Join existing rooms via room ID
- Automatic room cleanup when empty

### Chat Features
- Real-time text chat alongside video
- Participant presence indicators
- Chat history within session

### Error Handling
- Graceful handling of device permission denials
- Connection status indicators
- Automatic reconnection attempts
- Clear error messages for users

## Contributing

Contributions are welcome! To contribute:

1. Fork the project.
2. Create your feature branch:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes:
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

- **Habib Adavize** - [@HabibAdavize](https://github.com/HabibAdavize)
- **Project Link**: [Video Chat WebRTC](https://github.com/HabibAdavize/Video-Chat-WebRTC)

## Acknowledgments

- WebRTC Community
- Socket.IO Team
- React Community
- All contributors and testers
