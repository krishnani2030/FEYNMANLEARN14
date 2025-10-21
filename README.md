# Feynman Learn - Full Stack MERN Application

A complete peer-to-peer learning platform using the Feynman Technique with black & white minimalist design.

## 🎯 Project Overview

**Feynman Learn** helps students master topics by teaching them to others. The platform uses the Feynman Technique - explaining concepts in simple terms to identify knowledge gaps and improve understanding.

### Key Features

- **Peer-to-Peer Learning**: Create sessions to teach topics or join others' sessions to learn.
- **Session Management**: Full CRUD operations with enrollment, reminders, and discussion threads.
- **Live WebRTC Rooms**: Join browser-based calls five minutes before start time—no external meeting link required.
- **Email OTP Verification**: One-time passwords ensure every account is verified before accessing the dashboard.
- **System Chat Notifications**: Automated “Feynman” messages confirm enrollments and remind learners right before class.
- **Black & White Design**: Clean, distraction-free minimalist interface.

## 🏗️ Architecture

### Frontend (Black & White Theme)
- **Vanilla JavaScript** - No framework dependencies
- **Modern CSS** - Clean black and white design with responsive layout
- **Progressive Enhancement** - Works without JavaScript for basic functionality

### Backend (Node.js/Express)
- **Express.js** - RESTful API server
- **MongoDB** - Document database with Mongoose ODM
- **JWT Authentication** - Secure token-based auth with HTTP-only cookies
- **Socket.io & WebRTC** - Live session signaling with peer-to-peer media streams
- **Cron Jobs** - Automated session status updates and notifications
- **Rate Limiting** - Security and abuse prevention

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm or yarn

### Installation

1. **Clone the project:**
   ```bash
   git clone <your-repo>
   cd feynman-learn-fullstack
   ```

2. **Install dependencies:**
   ```bash
   npm run install-all
   ```

3. **Set up environment variables:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your MongoDB URI, JWT secret, SMTP credentials, and optional WebRTC secret
   ```

4. **Seed the database (optional):**
   ```bash
   npm run seed
   ```

5. **Start the application:**
   ```bash
   # Development - runs backend only (serves frontend)
   npm run dev

   # Or run separately:
   npm run backend    # Backend on port 5000
   npm run frontend   # Frontend on port 3000
   ```

6. **Access the application:**
   - Full application: http://localhost:5000
   - Frontend only: http://localhost:3000
   - API: http://localhost:5000/api

## 📁 Project Structure

```
feynman-learn-fullstack/
├── package.json                 # Root package.json with scripts
├── README.md                   # This file
├── backend/                    # Backend API
│   ├── package.json           # Backend dependencies
│   ├── server.js              # Main server file
│   ├── .env.example           # Environment variables template
│   ├── middleware/
│   │   └── auth.js            # Authentication middleware
│   ├── models/
│   │   ├── User.js            # User schema
│   │   └── Session.js         # Session schema
│   ├── routes/
│   │   ├── auth.js            # Authentication routes
│   │   ├── sessions.js        # Session management routes
│   │   └── users.js           # User management routes
│   ├── services/
│   │   ├── notificationService.js  # Email/notification handling
│   │   └── sessionService.js       # Session timing logic
│   └── scripts/
│       └── seed.js            # Database seeding script
└── frontend/                  # Frontend application
    ├── package.json           # Frontend package info
    ├── index.html             # Main HTML file
    ├── style.css              # Black & white CSS styles
    └── app.js                 # Frontend JavaScript
```

## 🎨 Design Theme

The frontend features a sophisticated **black and white design**:

- **Pure monochrome palette** - Only black, white, and gray shades
- **High contrast** - Excellent accessibility and readability
- **Minimalist interface** - Focus on content over decoration
- **Modern typography** - Inter font for clean, professional look
- **Responsive design** - Works perfectly on mobile and desktop

## 🔐 Authentication

Feynman Learn ships with classic **email/password authentication** hardened by
mandatory one-time password (OTP) verification. New users register with their
email address, receive a 6-digit code via SMTP, and must verify the address
before gaining dashboard access. Once verified, the backend issues an HTTP-only
JWT cookie that powers subsequent requests.

### Security Features:
- OTP email verification with configurable expiry (10 minutes by default).
- JWT tokens stored in HTTP-only cookies to protect against XSS.
- Rate limiting on auth endpoints to mitigate brute force attacks.
- Input validation and sanitisation across every route.

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Create a new account and trigger OTP verification
- `POST /api/auth/login` - Log in with verified email/password credentials
- `POST /api/auth/verify-email` - Submit the 6-digit OTP to activate the account
- `POST /api/auth/resend-verification` - Resend the OTP email (rate limited)
- `POST /api/auth/logout` - Clear the auth cookie and sign out
- `GET /api/auth/me` - Fetch the current authenticated user

### Sessions
- `GET /api/sessions` - List all sessions with join-window metadata
- `POST /api/sessions` - Create a new teaching session
- `GET /api/sessions/mine` - Get the sessions you created
- `POST /api/sessions/:id/enroll` - Enroll in a session and trigger notifications
- `POST /api/sessions/:id/webrtc-token` - Obtain a signed token to enter the live room
- `GET /api/health` - Health check

## 🚀 Deployment

### Production Deployment

1. **Set environment variables:**
   ```bash
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-uri
   JWT_SECRET=your-production-jwt-secret
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

The backend serves the frontend in production mode.

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret used for session cookies | Yes |
| `JWT_EXPIRES_IN` | JWT expiration window (e.g. `7d`) | No (default: `7d`) |
| `PORT` | Server port | No (default: 5000) |
| `CLIENT_URL` | Frontend URL for CORS | No (default: http://localhost:3000) |
| `SMTP_HOST` | SMTP host used to deliver OTP and reminder emails | Required for sending email |
| `SMTP_PORT` | SMTP port (e.g. `587`) | Required for sending email |
| `SMTP_SECURE` | Use TLS (set to `true` for port 465) | No (default: `false`) |
| `SMTP_USER` | SMTP username | Required for sending email |
| `SMTP_PASSWORD` | SMTP password or app password | Required for sending email |
| `SMTP_FROM` | From address shown in emails | No (defaults to `SMTP_USER`) |
| `WEBRTC_SECRET` | Overrides token signing secret for live sessions | No (defaults to derived value) |
| `SYSTEM_USER_EMAIL`, `SYSTEM_USER_NAME`, `SYSTEM_USER_PASSWORD` | Optional identity for the “Feynman” system chat user | No |

## 🛠️ Development

### Backend Development
- Uses nodemon for auto-restart
- MongoDB with Mongoose ODM
- Express.js with middleware stack
- Cron jobs for session management

### Frontend Development
- Vanilla JavaScript (ES6+)
- Modern CSS with CSS Grid/Flexbox
- Progressive enhancement
- No build process required

## 📊 Features in Detail

### Session Management
- Create teaching sessions with topic, level, date/time
- Enroll in others' sessions with capacity limits
- Automatic status updates (upcoming → ongoing → completed)
- Built-in WebRTC live rooms with five-minute early access

### Notification System
- Automated reminders 15 minutes before sessions
- Session start notifications
- Email integration ready (configurable)

### Admin Features
- User management and statistics
- Session oversight and moderation
- System health monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For questions or issues:
1. Check the README and documentation
2. Review the API endpoints and error responses
3. Check the console logs for debugging information

---

Built with ❤️ for peer-to-peer learning using the Feynman Technique.
