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

// POST /api/ai/:materialId/quiz - Generate quiz questions with configuration
router.post("/:materialId/quiz", async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            count = 10,
            difficulty = "medium",
            model,
            materialIds = [],
            customText = ""
        } = req.body;

        // If no materialIds provided, use the route param materialId
        const targetMaterialIds = materialIds.length > 0 ? materialIds : [req.params.materialId];

        // Fetch all selected materials
        const materials = await prisma.material.findMany({
            where: {
                id: { in: targetMaterialIds },
                userId: req.user!.id,
            },
        });

        if (materials.length === 0 && !customText.trim()) {
            res.status(400).json({ error: "No materials found or custom text provided" });
            return;
        }

        // Combine content from all materials
        let combinedContent = materials.map(m =>
            `## ${m.title}\n\n${m.content}`
        ).join("\n\n---\n\n");

        // Add custom text if provided
        if (customText.trim()) {
            combinedContent += `\n\n---\n\n## Additional Content\n\n${customText}`;
        }

        // Generate quiz questions using AI with configuration
        const questions = await generateQuiz(combinedContent, count, model, difficulty);

        if (questions.length === 0) {
            res.status(500).json({ error: "Failed to generate quiz questions" });
            return;
        }

        // Delete existing quizzes for the main material
        await prisma.quiz.deleteMany({
            where: { materialId: req.params.materialId },
        });

        // Save quiz questions to database (linked to the main material)
        const savedQuizzes = await Promise.all(
            questions.map((q) =>
                prisma.quiz.create({
                    data: {
                        question: q.question,
                        options: q.options,
                        answer: q.answer,
                        materialId: req.params.materialId,
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
