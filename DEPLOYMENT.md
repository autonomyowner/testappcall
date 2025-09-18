# 🚀 Deployment Guide for Video Chat WebRTC

## Backend Server (Railway)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "Deploy from GitHub"
4. Select your `testappcall` repository
5. **IMPORTANT**: Set the **Root Directory** to `signaling-server`
6. Add environment variable: `FRONTEND_URL=https://your-frontend-url.vercel.app`
7. Deploy!

## Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click "Import Project"
4. Select your `testappcall` repository
5. **IMPORTANT**: Set the **Root Directory** to `video-chat-frontend`
6. Add environment variables:
   - `VITE_SERVER_URL=https://your-backend-url.railway.app`
   - Optional TURN (recommended for restrictive networks):
     - `VITE_TURN_URL=turns:your-turn.example.com:5349,turn:your-turn.example.com:3478`
     - `VITE_TURN_USERNAME=your-username`
     - `VITE_TURN_CREDENTIAL=your-credential`
7. Deploy!

## Environment Variables

### Backend (Railway)
- `FRONTEND_URL`: Your Vercel frontend URL
- `PORT`: (Optional) Railway will set this automatically

### Frontend (Vercel)
- `VITE_SERVER_URL`: Your Railway backend URL

## Troubleshooting

- Make sure you set the correct **Root Directory** for each deployment
- Backend should be `signaling-server`
- Frontend should be `video-chat-frontend`
- Wait for both deployments to complete before testing
