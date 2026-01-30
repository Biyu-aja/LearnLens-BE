# LearnLens Backend

Express.js backend API for the LearnLens AI-powered tutoring app.

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MySQL
- **ORM**: Prisma
- **Authentication**: JWT & BCrypt
- **AI Integration**: OpenAI SDK (Compatible with Gemini/HaluAI)
- **File Handling**: Multer, PDFKit, Mammoth

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database (MySQL) - Your local connection
DATABASE_URL="mysql://root:password@localhost:3306/LearnLens"

# Server Configuration
PORT=5000
FRONTEND_URL="http://localhost:3000"

# Security
JWT_SECRET="your-super-secret-jwt-key"

# AI Configuration (HaluAI Gateway or OpenAI)
AI_API_KEY="your-ai-api-key"
AI_API_URL="your-ai-base-url"
```

### 3. Database Setup

Ensure your MySQL server is running. Then, sync the database schema:

```bash
# Generate Prisma Client
npm run prisma:generate

# Push schema to the database (creates tables)
npm run prisma:push
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:5000`

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user profile

### Materials
- `GET /api/materials` - List all materials
- `GET /api/materials/:id` - Get details of a material
- `POST /api/materials` - Upload a new material (PDF/Text)
- `GET /api/materials/:id/report` - Download PDF report
- `DELETE /api/materials/:id` - Delete a material

### Chat & AI
- `POST /api/chat/:materialId` - Chat with AI about the material
- `GET /api/chat/:materialId` - Get chat history
- `POST /api/ai/:materialId/quiz` - Generate a quiz
- `GET /api/ai/:materialId/concepts` - Get key concepts
- `POST /api/materials/:id/summary` - Generate summary

## 📁 Project Structure

```
src/
├── index.ts           # Application entry point
├── lib/
│   ├── prisma.ts      # Database client
│   ├── ai.ts          # AI service handler
│   └── report.ts      # PDF report generator
├── middleware/
│   └── auth.ts        # Authentication middleware
└── routes/
    ├── auth.ts        # Auth endpoints
    ├── materials.ts   # Material management endpoints
    ├── chat.ts        # Chat endpoints
    └── ai.ts          # AI-specific endpoints
```

## 📝 Available Scripts

- `npm run dev`: Start the development server with hot-reloading.
- `npm run build`: Compile TypeScript to JavaScript.
- `npm run start`: Run the compiled production code.
- `npm run prisma:generate`: Generate the Prisma client based on schema.
- `npm run prisma:push`: Push the Prisma schema state to the database.
- `npm run prisma:studio`: Open Prisma Studio to view/edit data.