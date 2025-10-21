# Feynman Learn - Full Stack MERN Application

A complete peer-to-peer learning platform using the Feynman Technique with black & white minimalist design.

## 🎯 Project Overview

**Feynman Learn** helps students master topics by teaching them to others. The platform uses the Feynman Technique - explaining concepts in simple terms to identify knowledge gaps and improve understanding.

### Key Features

- **Peer-to-Peer Learning**: Create sessions to teach topics or join others' sessions to learn
- **Session Management**: Full CRUD operations with enrollment system
- **Real-time Notifications**: Automated reminders and session start alerts
- **Black & White Design**: Clean, distraction-free minimalist interface
- **Authentication**: Secure JWT-based user management
- **Admin Panel**: User and session management capabilities

## 🏗️ Architecture

### Frontend (Black & White Theme)
- **Vanilla JavaScript** - No framework dependencies
- **Modern CSS** - Clean black and white design with responsive layout
- **Progressive Enhancement** - Works without JavaScript for basic functionality

### Backend (Node.js/Express)
- **Express.js** - RESTful API server
- **MongoDB** - Document database with Mongoose ODM
- **JWT Authentication** - Secure token-based auth with HTTP-only cookies
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
   # Edit .env with your MongoDB URI and JWT secrets
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

Feynman Learn now uses **Google Sign-In** exclusively. When a user authenticates
with Google, the backend issues a short-lived JWT that is stored in an
HTTP-only cookie. Legacy email/password accounts are removed automatically at
startup, so make sure to configure a Google OAuth Client ID before launching
the server.

### Security Features:
- Google Identity Services for login
- JWT tokens in HTTP-only cookies
- Rate limiting on auth endpoints
- Input validation and sanitization

## 📡 API Endpoints

### Authentication
- `POST /api/auth/google` - Exchange a Google credential for a session
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Sessions
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/mine` - Get user's sessions
- `POST /api/sessions/:id/enroll` - Enroll in session
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
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth Client ID (or legacy `GOOGLE_CLIENT_ID`) | Yes |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email for Calendar API | Required for Meet sync |
| `GOOGLE_PRIVATE_KEY` | Private key for the service account (escaped newlines) | Required for Meet sync |
| `GOOGLE_CALENDAR_ID` | Calendar ID where Meet events are created | Required for Meet sync |
| `GOOGLE_CALENDAR_TIMEZONE` | Calendar timezone (e.g. `UTC`) | No (default: `UTC`) |
| `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | SMTP configuration for enrollment/reminder emails | Required for email notifications |

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
- Google Meet integration for video sessions

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
