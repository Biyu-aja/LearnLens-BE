import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { chatWithMaterial } from "../lib/ai";

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/chat/:materialId - Get chat history for a material
router.get("/:materialId", async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify material belongs to user
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

        const messages = await prisma.message.findMany({
            where: { materialId: material.id },
            orderBy: { createdAt: "asc" },
        });

        res.json({ success: true, messages });
    } catch (error) {
        console.error("Error fetching chat:", error);
        res.status(500).json({ error: "Failed to fetch chat history" });
    }
});

// POST /api/chat/:materialId - Send a message and get AI response
router.post("/:materialId", async (req: Request, res: Response): Promise<void> => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== "string") {
            res.status(400).json({ error: "Message is required" });
            return;
        }

        // Verify material belongs to user
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.materialId,
                userId: req.user!.id,
            },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 10, // Limit context to last 10 messages
                },
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Save user message
        const userMessage = await prisma.message.create({
            data: {
                role: "user",
                content: message,
                materialId: material.id,
            },
        });

        // Build message history for AI
        const chatHistory = material.messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));
        chatHistory.push({ role: "user", content: message });

        // Get AI response using user's preferred model
        const aiResponse = await chatWithMaterial(
            material.content,
            chatHistory,
            req.user!.preferredModel,
            req.user!.maxTokens
        );

        // Save assistant message
        const assistantMessage = await prisma.message.create({
            data: {
                role: "assistant",
                content: aiResponse,
                materialId: material.id,
            },
        });

        res.json({
            success: true,
            userMessage,
            assistantMessage,
        });
    } catch (error) {
        console.error("Error in chat:", error);
        res.status(500).json({ error: "Failed to process message" });
    }
});

// DELETE /api/chat/:materialId - Clear chat history
router.delete("/:materialId", async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify material belongs to user
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

        await prisma.message.deleteMany({
            where: { materialId: material.id },
        });

        res.json({ success: true, message: "Chat history cleared" });
    } catch (error) {
        console.error("Error clearing chat:", error);
        res.status(500).json({ error: "Failed to clear chat history" });
    }
});

export default router;
