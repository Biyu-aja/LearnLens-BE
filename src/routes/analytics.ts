import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Start a study session
router.post("/session/start", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { materialId } = req.body;
        const userId = req.user!.id;

        // Verify material belongs to user
        const material = await prisma.material.findFirst({
            where: { id: materialId, userId }
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }

        // Create new study session
        const session = await prisma.studySession.create({
            data: {
                materialId,
                userId,
                startTime: new Date()
            }
        });

        res.json({ success: true, session });
    } catch (error) {
        console.error("Start session error:", error);
        res.status(500).json({ error: "Failed to start session" });
    }
});

// End a study session
router.post("/session/end", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user!.id;

        // Find the session
        const session = await prisma.studySession.findFirst({
            where: { id: sessionId, userId }
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Calculate duration in seconds
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

        // Update session with end time and duration
        const updatedSession = await prisma.studySession.update({
            where: { id: sessionId },
            data: {
                endTime,
                duration
            }
        });

        res.json({ success: true, session: updatedSession });
    } catch (error) {
        console.error("End session error:", error);
        res.status(500).json({ error: "Failed to end session" });
    }
});

// Save quiz attempt
router.post("/quiz-attempt", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { materialId, score, totalQuestions } = req.body;
        const userId = req.user!.id;

        // Verify material belongs to user
        const material = await prisma.material.findFirst({
            where: { id: materialId, userId }
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }

        // Calculate percentage
        const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

        // Create quiz attempt
        const attempt = await prisma.quizAttempt.create({
            data: {
                materialId,
                userId,
                score,
                totalQuestions,
                percentage
            }
        });

        res.json({ success: true, attempt });
    } catch (error) {
        console.error("Save quiz attempt error:", error);
        res.status(500).json({ error: "Failed to save quiz attempt" });
    }
});

// Get analytics for a specific material
router.get("/material/:materialId", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { materialId } = req.params;
        const userId = req.user!.id;

        // Verify material belongs to user
        const material = await prisma.material.findFirst({
            where: { id: materialId, userId }
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }

        // Get study sessions for this material
        const studySessions = await prisma.studySession.findMany({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" },
            take: 10 // Last 10 sessions
        });

        // Get quiz attempts for this material
        const quizAttempts = await prisma.quizAttempt.findMany({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" },
            take: 10 // Last 10 attempts
        });

        // Calculate totals
        const totalStudyTime = studySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        const totalSessions = studySessions.length;

        const totalAttempts = quizAttempts.length;
        const averageScore = totalAttempts > 0
            ? quizAttempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts
            : 0;
        const bestScore = totalAttempts > 0
            ? Math.max(...quizAttempts.map(a => a.percentage))
            : 0;

        res.json({
            success: true,
            analytics: {
                studyTime: {
                    total: totalStudyTime, // in seconds
                    sessions: totalSessions,
                    recentSessions: studySessions
                },
                quizPerformance: {
                    totalAttempts,
                    averageScore: Math.round(averageScore * 10) / 10,
                    bestScore: Math.round(bestScore * 10) / 10,
                    recentAttempts: quizAttempts
                }
            }
        });
    } catch (error) {
        console.error("Get material analytics error:", error);
        res.status(500).json({ error: "Failed to get analytics" });
    }
});

export default router;
