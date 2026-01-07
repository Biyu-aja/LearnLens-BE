import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from "./routes/auth";
import materialsRoutes from "./routes/materials";
import chatRoutes from "./routes/chat";
import aiRoutes from "./routes/ai";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/materials", materialsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error" });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 LearnLens API running on http://localhost:${PORT}`);
    console.log(`📚 Health check: http://localhost:${PORT}/health`);
});

export default app;
