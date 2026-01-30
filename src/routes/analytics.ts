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

        // Get chat messages for this material (count user questions)
        const messages = await prisma.message.findMany({
            where: { materialId },
            orderBy: { createdAt: "desc" },
            take: 20
        });

        const userMessages = messages.filter(m => m.role === "user");
        const totalQuestions = userMessages.length;

        // Get last activity
        const lastActivity = messages.length > 0 ? messages[0].createdAt : null;

        // Get quiz attempts for this material
        const quizAttempts = await prisma.quizAttempt.findMany({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" },
            take: 10 // Last 10 attempts
        });

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
                chatActivity: {
                    totalQuestions,
                    lastActivity,
                    recentMessages: messages.slice(0, 5)
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

// AI Evaluate learning from chat history
router.post("/evaluate/:materialId", authMiddleware, async (req: Request, res: Response) => {
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

        // Get all chat messages for this material
        const messages = await prisma.message.findMany({
            where: { materialId },
            orderBy: { createdAt: "asc" }
        });

        const userMessages = messages.filter(m => m.role === "user");

        if (userMessages.length < 1) {
            return res.status(400).json({
                error: "Not enough conversations to evaluate. Ask some questions first!"
            });
        }

        // Get quiz attempts for context
        const quizAttempts = await prisma.quizAttempt.findMany({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" },
            take: 5
        });

        // Get previous evaluation for comparison
        const previousEval = await prisma.learningEvaluation.findFirst({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" }
        });

        // Build chat history for AI
        const chatHistory = messages.map(m => `${m.role === "user" ? "Siswa" : "AI"}: ${m.content}`).join("\n\n");

        const quizContext = quizAttempts.length > 0
            ? `\n\nHasil Quiz:\n${quizAttempts.map(q => `- Score: ${q.score}/${q.totalQuestions} (${q.percentage}%)`).join("\n")}`
            : "";

        const previousContext = previousEval
            ? `\n\nEvaluasi sebelumnya (skor: ${previousEval.score}/10, ${previousEval.questionsCount} pertanyaan):\n${previousEval.content.substring(0, 500)}...`
            : "";

        // Calculate quiz avg score
        const quizAvgScore = quizAttempts.length > 0
            ? quizAttempts.reduce((sum, q) => sum + q.percentage, 0) / quizAttempts.length
            : null;

        // Use OpenAI to evaluate
        const { getAIClient } = await import("../lib/ai");
        const { client, model } = getAIClient();

        const response = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Kamu adalah tutor AI yang mengevaluasi progress belajar siswa.

Berdasarkan riwayat percakapan antara Siswa dan AI, berikan evaluasi dalam format berikut:

## 📊 Ringkasan Pembelajaran
[Ringkas topik-topik yang sudah dipelajari]

## ✅ Kekuatan
[3-5 poin tentang apa yang sudah dipahami dengan baik]

## 🎯 Area untuk Ditingkatkan
[3-5 poin tentang area yang perlu lebih banyak dipelajari]

## 💡 Rekomendasi
[3-5 saran konkret untuk langkah selanjutnya]

${previousEval ? `## 📈 Perubahan dari Evaluasi Sebelumnya
[Bandingkan dengan evaluasi sebelumnya dan sebutkan progress/perubahan]

` : ""}## 🌟 Skor Pemahaman: X/10
[Berikan skor 1-10 dengan penjelasan singkat. PENTING: Tulis dalam format "Skor Pemahaman: X/10"]

Berikan feedback yang memotivasi dan konstruktif dalam Bahasa Indonesia.`
                },
                {
                    role: "user",
                    content: `Materi: ${material.title}\n\nRiwayat Percakapan:\n${chatHistory}${quizContext}${previousContext}`
                }
            ],
            max_tokens: 1500
        });

        const evaluationContent = response.choices[0]?.message?.content || "Gagal membuat evaluasi";

        // Extract score from evaluation (look for "X/10" pattern)
        const scoreMatch = evaluationContent.match(/(\d+)\/10/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;

        // Save evaluation to database
        const evaluation = await prisma.learningEvaluation.create({
            data: {
                content: evaluationContent,
                score,
                questionsCount: userMessages.length,
                quizAvgScore,
                materialId,
                userId
            }
        });

        res.json({
            success: true,
            evaluation: {
                id: evaluation.id,
                content: evaluation.content,
                score: evaluation.score,
                questionsCount: evaluation.questionsCount,
                quizAvgScore: evaluation.quizAvgScore,
                createdAt: evaluation.createdAt
            }
        });
    } catch (error) {
        console.error("Evaluate learning error:", error);
        res.status(500).json({ error: "Failed to evaluate learning" });
    }
});

// Get evaluation history for a material
router.get("/evaluations/:materialId", authMiddleware, async (req: Request, res: Response) => {
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

        // Get all evaluations
        const evaluations = await prisma.learningEvaluation.findMany({
            where: { materialId, userId },
            orderBy: { createdAt: "desc" },
            take: 10
        });

        res.json({
            success: true,
            evaluations
        });
    } catch (error) {
        console.error("Get evaluations error:", error);
        res.status(500).json({ error: "Failed to get evaluations" });
    }
});

export default router;


