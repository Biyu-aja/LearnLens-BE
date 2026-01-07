# LearnLens Backend

Express.js backend API for the LearnLens AI-powered tutoring app.

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with:

```bash
# Database (PostgreSQL) - Your local connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/dbname?schema=public"

# Server
PORT=5000
FRONTEND_URL="http://localhost:3000"

# JWT Secret
JWT_SECRET="learnlens-super-secret-jwt-key-2025"

# AI API (HaluAI Gateway)
AI_API_KEY="ai-api-key"
AI_API_URL="ai-api-url"
```

### 3. Create the Database

Make sure PostgreSQL is running, then create the database:

```sql
CREATE DATABASE "LearnLens";
```

Or using psql:
```bash
psql -U postgres -c "CREATE DATABASE \"LearnLens\";"
```

### 4. Set up Database Schema

```bash
npm run prisma:generate
npm run prisma:push
```

### 5. Start Development Server

```bash
npm run dev
```

The API will be running at `http://localhost:5000`

## 📚 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google` | Login with Google OAuth |
| GET | `/api/auth/me` | Get current user |

### Materials

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/materials` | List all materials |
| GET | `/api/materials/:id` | Get single material |
| POST | `/api/materials` | Upload new material |
| POST | `/api/materials/:id/summary` | Generate AI summary |
| DELETE | `/api/materials/:id` | Delete material |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/:materialId` | Get chat history |
| POST | `/api/chat/:materialId` | Send message |
| DELETE | `/api/chat/:materialId` | Clear chat history |

### AI Features

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai/:materialId/concepts` | Get key concepts |
| GET | `/api/ai/:materialId/quiz` | Get saved quizzes |
| POST | `/api/ai/:materialId/quiz` | Generate new quiz |
| DELETE | `/api/ai/:materialId/quiz` | Delete quizzes |

## 📁 Project Structure

```
src/
├── index.ts           # Express app entry point
├── lib/
│   ├── prisma.ts      # Prisma client
│   └── ai.ts          # AI service (OpenAI-compatible)
├── middleware/
│   └── auth.ts        # JWT authentication
└── routes/
    ├── auth.ts        # Auth routes
    ├── materials.ts   # Materials CRUD + upload
    ├── chat.ts        # Chat functionality
    └── ai.ts          # AI features (concepts, quiz)
```

## 📝 Available Scripts

```bash
npm run dev              # Start development server with hot reload
npm run build            # Build for production
npm run start            # Start production server
npm run prisma:generate  # Generate Prisma client
npm run prisma:push      # Push schema to database
npm run prisma:studio    # Open Prisma Studio
```