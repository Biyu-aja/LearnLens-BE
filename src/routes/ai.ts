import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { generateQuiz, generateKeyConcepts, generateFlashcards, generateGlossary, generateMindMap, generateStudyPlan } from "../lib/ai";
import type { Language } from "../lib/prompts";

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

        const concepts = await generateKeyConcepts(material.content || `Topic: ${material.title}\n${material.description || ''}`);

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
            customText = "",  // Now used as custom instructions, not additional content
            language = "en",   // Language for quiz generation
            customConfig
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

        if (materials.length === 0) {
            res.status(400).json({ error: "No materials found" });
            return;
        }

        // Combine content from all materials
        const combinedContent = materials.map(m =>
            `## ${m.title}\n\n${m.content}`
        ).join("\n\n---\n\n");

        // Generate quiz questions using AI with configuration and language
        const questions = await generateQuiz(combinedContent, count, model, difficulty, customText.trim() || undefined, customConfig, language as Language);

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
                        hint: q.hint || null,
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

// POST /api/ai/:materialId/glossary - Generate glossary for a material
router.post("/:materialId/glossary", async (req: Request, res: Response): Promise<void> => {
    try {
        const { model, language = "en", customConfig } = req.body;

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

        // Determinte content for glossary
        let contentForGlossary = material.content;

        // For research mode or empty content, use chat history
        if (!contentForGlossary || material.type === "research") {
            const messages = await prisma.message.findMany({
                where: { materialId: material.id },
                orderBy: { createdAt: "asc" },
                take: 50 // Limit to last 50 messages
            });

            if (messages.length > 0) {
                // Format chat history as content
                contentForGlossary = messages.map(m =>
                    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
                ).join("\n\n");
            } else if (material.description) {
                contentForGlossary = `Topic: ${material.title}\nDescription: ${material.description}`;
            } else {
                contentForGlossary = `Topic: ${material.title}`;
            }
        }

        const glossary = await generateGlossary(contentForGlossary || "No content available.", model, customConfig, language as Language);

        if (glossary.length === 0) {
            res.status(500).json({ error: "Failed to generate glossary" });
            return;
        }

        // Save glossary to material metadata
        await prisma.material.update({
            where: { id: material.id },
            data: {
                glossary: JSON.stringify(glossary),
            },
        });

        res.json({ success: true, glossary });
    } catch (error) {
        console.error("Error generating glossary:", error);
        res.status(500).json({ error: "Failed to generate glossary" });
    }
});

// GET /api/ai/:materialId/glossary - Get saved glossary for a material
router.get("/:materialId/glossary", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
            select: {
                id: true,
                glossary: true,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        let glossary = [];
        if (material.glossary) {
            try {
                glossary = JSON.parse(material.glossary as string);
            } catch (e) {
                glossary = [];
            }
        }

        res.json({ success: true, glossary });
    } catch (error) {
        console.error("Error fetching glossary:", error);
        res.status(500).json({ error: "Failed to fetch glossary" });
    }
});

// DELETE /api/ai/:materialId/glossary - Delete glossary for a material
router.delete("/:materialId/glossary", async (req: Request, res: Response): Promise<void> => {
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

        await prisma.material.update({
            where: { id: material.id },
            data: {
                glossary: null,
            },
        });

        res.json({ success: true, message: "Glossary deleted" });
    } catch (error) {
        console.error("Error deleting glossary:", error);
        res.status(500).json({ error: "Failed to delete glossary" });
    }
});

// POST /api/ai/:materialId/glossary/term - Add a single term to glossary
router.post("/:materialId/glossary/term", async (req: Request, res: Response): Promise<void> => {
    try {
        const { term, model } = req.body;

        if (!term || typeof term !== "string" || term.trim().length === 0) {
            res.status(400).json({ error: "Term is required" });
            return;
        }

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

        // Get existing glossary
        let existingGlossary: { term: string; definition: string; category?: string }[] = [];
        if (material.glossary) {
            try {
                existingGlossary = JSON.parse(material.glossary as string);
            } catch (e) {
                existingGlossary = [];
            }
        }

        // Check if term already exists
        const termExists = existingGlossary.some(
            (g) => g.term.toLowerCase() === term.trim().toLowerCase()
        );
        if (termExists) {
            res.status(400).json({ error: "Term already exists in glossary" });
            return;
        }

        // Generate definition using AI
        const { default: ai } = await import("../lib/ai");
        const defaultModel = "gemini-2.5-flash-lite";

        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                {
                    role: "system",
                    content: `You are an educational assistant. Generate a clear, concise definition for the given term based on the learning material context.

RULES:
1. Keep the definition to 1-2 sentences max
2. Use simple, clear language
3. Respond ONLY with valid JSON in this format (no other text):
{
  "term": "Term Name",
  "definition": "Clear definition",
  "category": "Category (Technical/Concept/Acronym/Process/General)"
}`,
                },
                {
                    role: "user",
                    content: `Define this term based on the context of the material:

TERM: "${term.trim()}"

MATERIAL CONTEXT (for reference):
${(material.content || material.description || material.title).slice(0, 3000)}`,
                },
            ],
            max_tokens: 300,
        });

        const responseText = response.choices[0]?.message?.content || "";

        let newTerm: { term: string; definition: string; category?: string };
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // Fallback: create simple entry
                newTerm = {
                    term: term.trim(),
                    definition: `Definition for "${term.trim()}" - please regenerate glossary for full definitions.`,
                    category: "General",
                };
            } else {
                newTerm = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            newTerm = {
                term: term.trim(),
                definition: responseText.slice(0, 200) || `A term from the learning material.`,
                category: "General",
            };
        }

        // Add to glossary
        existingGlossary.push(newTerm);

        // Save updated glossary
        await prisma.material.update({
            where: { id: material.id },
            data: {
                glossary: JSON.stringify(existingGlossary),
            },
        });

        res.json({ success: true, term: newTerm, glossary: existingGlossary });
    } catch (error) {
        console.error("Error adding term to glossary:", error);
        res.status(500).json({ error: "Failed to add term to glossary" });
    }
});

// POST /api/ai/:materialId/cleanup - Clean up content by removing unnecessary parts
router.post("/:materialId/cleanup", async (req: Request, res: Response): Promise<void> => {
    try {
        const { content } = req.body;

        if (!content || typeof content !== "string") {
            res.status(400).json({ error: "Content is required" });
            return;
        }

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

        const originalLength = content.length;

        // Use AI to identify and clean up unnecessary parts
        const { default: ai } = await import("../lib/ai");
        const defaultModel = "gemini-2.5-flash-lite";

        const response = await ai.chat.completions.create({
            model: defaultModel,
            messages: [
                {
                    role: "system",
                    content: `Kamu adalah asisten yang membantu membersihkan konten dokumen.

TUGAS: Hapus bagian-bagian yang TIDAK PENTING dari konten berikut:
- Daftar Isi (Table of Contents)
- Daftar Gambar (List of Figures)
- Daftar Tabel (List of Tables) 
- Halaman kosong atau placeholder
- Header/footer berulang
- Nomor halaman
- Catatan kaki yang tidak relevan
- Daftar Pustaka/Referensi (kecuali sangat singkat)
- Indeks
- Ucapan terima kasih (Acknowledgments)
- Cover/sampul

PENTING:
1. JANGAN hapus konten pembelajaran yang substantif
2. Pertahankan semua penjelasan, definisi, konsep, contoh
3. Kembalikan konten yang sudah dibersihkan TANPA tambahan apapun
4. Jangan tambahkan teks pembuka atau penutup
5. Output HANYA konten yang sudah dibersihkan`
                },
                {
                    role: "user",
                    content: `Bersihkan konten berikut:\n\n${content.slice(0, 50000)}`
                }
            ],
            max_tokens: 16000,
        });

        const cleanedContent = response.choices[0]?.message?.content || content;
        const removedChars = originalLength - cleanedContent.length;

        res.json({
            success: true,
            cleanedContent,
            removedChars: Math.max(0, removedChars)
        });
    } catch (error) {
        console.error("Error cleaning up content:", error);
        res.status(500).json({ error: "Failed to clean up content" });
    }
});

// POST /api/ai/:materialId/flashcards - Generate flashcards from material
router.post("/:materialId/flashcards", async (req: Request, res: Response): Promise<void> => {
    try {
        const { count = 10, language = "en", model, customConfig } = req.body;

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

        // Generate flashcards using AI
        const flashcards = await generateFlashcards(
            material.content || `Topic: ${material.title}\n${material.description || ''}`,
            count,
            model,
            customConfig,
            language as Language
        );

        if (flashcards.length === 0) {
            res.status(500).json({ error: "Failed to generate flashcards" });
            return;
        }

        // Save flashcards to material (as JSON in a field)
        await prisma.material.update({
            where: { id: material.id },
            data: {
                flashcards: JSON.stringify(flashcards),
            },
        });

        res.json({ success: true, flashcards });
    } catch (error) {
        console.error("Error generating flashcards:", error);
        res.status(500).json({ error: "Failed to generate flashcards" });
    }
});

// GET /api/ai/:materialId/flashcards - Get saved flashcards for a material
router.get("/:materialId/flashcards", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
            select: {
                id: true,
                flashcards: true,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        let flashcards = [];
        if (material.flashcards) {
            try {
                flashcards = JSON.parse(material.flashcards as string);
            } catch (e) {
                flashcards = [];
            }
        }

        res.json({ success: true, flashcards });
    } catch (error) {
        console.error("Error fetching flashcards:", error);
        res.status(500).json({ error: "Failed to fetch flashcards" });
    }
});

// DELETE /api/ai/:materialId/flashcards - Delete flashcards for a material
router.delete("/:materialId/flashcards", async (req: Request, res: Response): Promise<void> => {
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

        await prisma.material.update({
            where: { id: material.id },
            data: {
                flashcards: null,
            },
        });

        res.json({ success: true, message: "Flashcards deleted" });
    } catch (error) {
        console.error("Error deleting flashcards:", error);
        res.status(500).json({ error: "Failed to delete flashcards" });
    }
});

// POST /api/ai/:materialId/mindmap - Generate mind map for a material
router.post("/:materialId/mindmap", async (req: Request, res: Response): Promise<void> => {
    try {
        const { language = "en", model, customConfig } = req.body;

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

        // Generate mind map using AI
        const mindMapData = await generateMindMap(
            material.content || `Topic: ${material.title}\n${material.description || ''}`,
            model,
            customConfig,
            language as Language
        );

        if (mindMapData.nodes.length === 0) {
            res.status(500).json({ error: "Failed to generate mind map" });
            return;
        }

        // Save mind map to material
        await prisma.material.update({
            where: { id: material.id },
            data: {
                mindMap: JSON.stringify(mindMapData),
            },
        });

        res.json({ success: true, mindMap: mindMapData });
    } catch (error) {
        console.error("Error generating mind map:", error);
        res.status(500).json({ error: "Failed to generate mind map" });
    }
});

// GET /api/ai/:materialId/mindmap - Get saved mind map for a material
router.get("/:materialId/mindmap", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
            select: {
                id: true,
                mindMap: true,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        let mindMap = { nodes: [], edges: [] };
        if (material.mindMap) {
            try {
                mindMap = JSON.parse(material.mindMap as string);
            } catch (e) {
                mindMap = { nodes: [], edges: [] };
            }
        }

        res.json({ success: true, mindMap });
    } catch (error) {
        console.error("Error fetching mind map:", error);
        res.status(500).json({ error: "Failed to fetch mind map" });
    }
});

// DELETE /api/ai/:materialId/mindmap - Delete mind map for a material
router.delete("/:materialId/mindmap", async (req: Request, res: Response): Promise<void> => {
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

        await prisma.material.update({
            where: { id: material.id },
            data: {
                mindMap: null,
            },
        });

        res.json({ success: true, message: "Mind map deleted" });
    } catch (error) {
        console.error("Error deleting mind map:", error);
        res.status(500).json({ error: "Failed to delete mind map" });
    }
});

// POST /api/ai/:materialId/study-plan - Generate or regenerate study plan
router.post("/:materialId/study-plan", async (req: Request, res: Response): Promise<void> => {
    try {
        const { language = "en", model, customConfig, focus } = req.body;

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

        // Generate plan using AI
        const planData = await generateStudyPlan(
            material.content || `Topic: ${material.title}\n${material.description || ''}`,
            model,
            customConfig,
            language as Language,
            focus
        );

        if (planData.tasks.length === 0) {
            res.status(500).json({ error: "Failed to generate study plan" });
            return;
        }

        // Check if plan exists, delete old tasks if it does
        const existingPlan = await prisma.studyPlan.findUnique({
            where: {
                materialId_userId: {
                    materialId: material.id,
                    userId: req.user!.id,
                },
            },
        });

        let planId = existingPlan?.id;

        if (existingPlan) {
            // Delete old tasks
            await prisma.studyTask.deleteMany({
                where: { studyPlanId: existingPlan.id },
            });
        } else {
            // Create new plan
            const newPlan = await prisma.studyPlan.create({
                data: {
                    materialId: material.id,
                    userId: req.user!.id,
                },
            });
            planId = newPlan.id;
        }

        // Create new tasks
        await prisma.studyTask.createMany({
            data: planData.tasks.map((t) => ({
                studyPlanId: planId!,
                day: t.day,
                task: t.task,
                description: t.description,
            })),
        });

        // Fetch complete plan with tasks
        const minFullPlan = await prisma.studyPlan.findUnique({
            where: { id: planId },
            include: {
                tasks: {
                    orderBy: [{ day: 'asc' }, { id: 'asc' }],
                },
            },
        });

        res.json({ success: true, plan: minFullPlan });
    } catch (error) {
        console.error("Error generating study plan:", error);
        res.status(500).json({ error: "Failed to generate study plan" });
    }
});

// GET /api/ai/:materialId/study-plan - Get active study plan
router.get("/:materialId/study-plan", async (req: Request, res: Response): Promise<void> => {
    try {
        const plan = await prisma.studyPlan.findUnique({
            where: {
                materialId_userId: {
                    materialId: req.params.materialId,
                    userId: req.user!.id,
                },
            },
            include: {
                tasks: {
                    orderBy: [{ day: 'asc' }, { id: 'asc' }],
                },
            },
        });

        res.json({ success: true, plan });
    } catch (error) {
        console.error("Error fetching study plan:", error);
        res.status(500).json({ error: "Failed to fetch study plan" });
    }
});

// PATCH /api/ai/study-plan/task/:taskId - Update task status
router.patch("/study-plan/task/:taskId", async (req: Request, res: Response): Promise<void> => {
    try {
        const { isCompleted } = req.body;
        const { taskId } = req.params;

        // Verify ownership through plan
        const task = await prisma.studyTask.findUnique({
            where: { id: taskId },
            include: { studyPlan: true },
        });

        if (!task || task.studyPlan.userId !== req.user!.id) {
            res.status(404).json({ error: "Task not found" });
            return;
        }

        const updatedTask = await prisma.studyTask.update({
            where: { id: taskId },
            data: { isCompleted },
        });

        res.json({ success: true, task: updatedTask });
    } catch (error) {
        console.error("Error updating study task:", error);
        res.status(500).json({ error: "Failed to update task" });
    }
});

// POST /api/ai/task/:taskId/question - Generate essay question for task verification
router.post("/task/:taskId/question", async (req: Request, res: Response): Promise<void> => {
    try {
        const { taskId } = req.params;
        const { language = "en" } = req.body;

        // Fetch task with related study plan and material
        const task = await prisma.studyTask.findUnique({
            where: { id: taskId },
            include: {
                studyPlan: {
                    include: {
                        material: true,
                    },
                },
            },
        });

        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }

        // Verify ownership
        if (task.studyPlan.userId !== req.user!.id) {
            res.status(403).json({ error: "Access denied" });
            return;
        }

        const material = task.studyPlan.material;
        const content = material.content || `Topic: ${material.title}\n${material.description || ''}`;

        // Generate essay question using AI
        const { generateTaskQuestion } = await import("../lib/ai");
        const questionData = await generateTaskQuestion(
            task.task,
            task.description || undefined,
            content,
            task.studyPlan.material.title, // Pass plan title for context (from Material)
            undefined, // customConfig
            language as Language
        );

        res.json({
            success: true,
            question: questionData.question,
            description: questionData.description,
            taskId: task.id,
            task: task.task,
        });
    } catch (error) {
        console.error("Error generating task question:", error);
        res.status(500).json({ error: "Failed to generate question" });
    }
});

// POST /api/ai/task/:taskId/evaluate - Evaluate user's answer for task verification
router.post("/task/:taskId/evaluate", async (req: Request, res: Response): Promise<void> => {
    try {
        const { taskId } = req.params;
        const { question, answer, language = "en" } = req.body;

        if (!question || !answer) {
            res.status(400).json({ error: "Question and answer are required" });
            return;
        }

        // Fetch task with related study plan and material
        const task = await prisma.studyTask.findUnique({
            where: { id: taskId },
            include: {
                studyPlan: {
                    include: {
                        material: true,
                    },
                },
            },
        });

        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }

        // Verify ownership
        if (task.studyPlan.userId !== req.user!.id) {
            res.status(403).json({ error: "Access denied" });
            return;
        }

        const material = task.studyPlan.material;
        const content = material.content || `Topic: ${material.title}\n${material.description || ''}`;

        // Evaluate answer using AI
        const { evaluateTaskAnswer } = await import("../lib/ai");
        const evaluation = await evaluateTaskAnswer(
            task.task,
            question,
            answer,
            content,
            undefined, // customConfig
            language as Language
        );

        // If passed, mark task as complete
        if (evaluation.passed) {
            await prisma.studyTask.update({
                where: { id: taskId },
                data: { isCompleted: true },
            });
        }

        res.json({
            success: true,
            passed: evaluation.passed,
            score: evaluation.score,
            feedback: evaluation.feedback,
            correctAnswer: evaluation.correctAnswer,
            taskCompleted: evaluation.passed,
        });
    } catch (error) {
        console.error("Error evaluating answer:", error);
        res.status(500).json({ error: "Failed to evaluate answer" });
    }
});

export default router;


