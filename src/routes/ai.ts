import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { generateQuiz, generateKeyConcepts } from "../lib/ai";

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/ai/:materialId/concepts - Generate key concepts
router.get("/:materialId/concepts", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        const concepts = await generateKeyConcepts(material.content);

        res.json({ success: true, concepts });
    } catch (error) {
        console.error("Error generating concepts:", error);
        res.status(500).json({ error: "Failed to generate key concepts" });
    }
});

// POST /api/ai/:materialId/quiz - Generate quiz questions
router.post("/:materialId/quiz", async (req: Request, res: Response): Promise<void> => {
    try {
        const count = parseInt(req.body.count) || 5;

        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Generate quiz questions using AI
        const questions = await generateQuiz(material.content, count);

        if (questions.length === 0) {
            res.status(500).json({ error: "Failed to generate quiz questions" });
            return;
        }

        // Save quiz questions to database
        const savedQuizzes = await Promise.all(
            questions.map((q) =>
                prisma.quiz.create({
                    data: {
                        question: q.question,
                        options: q.options,
                        answer: q.answer,
                        materialId: material.id,
                    },
                })
            )
        );

        res.json({ success: true, quizzes: savedQuizzes });
    } catch (error) {
        console.error("Error generating quiz:", error);
        res.status(500).json({ error: "Failed to generate quiz" });
    }
});

// GET /api/ai/:materialId/quiz - Get saved quizzes for a material
router.get("/:materialId/quiz", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        const quizzes = await prisma.quiz.findMany({
            where: { materialId: material.id },
            orderBy: { createdAt: "desc" },
        });

        res.json({ success: true, quizzes });
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).json({ error: "Failed to fetch quizzes" });
    }
});

// DELETE /api/ai/:materialId/quiz - Delete all quizzes for a material
router.delete("/:materialId/quiz", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        await prisma.quiz.deleteMany({
            where: { materialId: material.id },
        });

        res.json({ success: true, message: "Quizzes deleted" });
    } catch (error) {
        console.error("Error deleting quizzes:", error);
        res.status(500).json({ error: "Failed to delete quizzes" });
    }
});

export default router;
