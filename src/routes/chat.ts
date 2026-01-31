import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { chatWithMaterial, chatWithMaterialStream, CustomAPIConfig } from "../lib/ai";

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

// POST /api/chat/:materialId - Send a message and get AI response (non-streaming)
router.post("/:materialId", async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, language = "id" } = req.body;

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

        // Build custom API config from user settings
        // Only use custom config if customApiUrl is explicitly set and not empty
        const customConfig: CustomAPIConfig | undefined =
            (req.user!.customApiUrl && req.user!.customApiUrl.trim() !== "") ? {
                customApiUrl: req.user!.customApiUrl,
                customApiKey: req.user!.customApiKey,
                customModel: req.user!.customModel,
            } : undefined;

        // Use custom settings if custom API is configured, otherwise use default settings
        const maxTokens = customConfig ? (req.user!.customMaxTokens ?? 1000) : (req.user!.maxTokens ?? 1000);
        const maxContext = customConfig ? (req.user!.customMaxContext ?? 8000) : (req.user!.maxContext ?? 500000);

        // Get AI response using user's preferred model (or custom API)
        const preferredModel = req.user!.preferredModel ?? "gemini-3-flash";
        // Use smaller context for empty/research mode materials
        const effectiveMaxContext = (material.content && material.content.trim()) ? maxContext : 1000;
        const aiResponse = await chatWithMaterial(
            material.content ?? "", // Handle null content for research mode
            chatHistory,
            preferredModel,
            maxTokens,
            effectiveMaxContext,
            customConfig,
            language as "id" | "en"
        );

        // Save assistant message
        const assistantMessage = await prisma.message.create({
            data: {
                role: "assistant",
                content: aiResponse,
                materialId: material.id,
            },
        });

        // If this is a research material, append the conversation to the content
        if (material.type === "research") {
            const newContent = `\n\nUser: ${message}\nAssistant: ${aiResponse}`;
            await prisma.material.update({
                where: { id: material.id },
                data: {
                    content: (material.content || "") + newContent
                }
            });
        }

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

// POST /api/chat/:materialId/stream - Send a message and get streaming AI response
router.post("/:materialId/stream", async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, language = "id" } = req.body;

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
                    take: 10,
                },
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Save user message first
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

        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
        res.flushHeaders();

        // Send user message ID first
        res.write(`data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`);

        let fullContent = "";

        // Build custom API config from user settings
        // Only use custom config if customApiUrl is explicitly set and not empty
        const customConfig: CustomAPIConfig | undefined =
            (req.user!.customApiUrl && req.user!.customApiUrl.trim() !== "") ? {
                customApiUrl: req.user!.customApiUrl,
                customApiKey: req.user!.customApiKey,
                customModel: req.user!.customModel,
            } : undefined;

        // Use custom settings if custom API is configured, otherwise use default settings
        const maxTokens = customConfig ? (req.user!.customMaxTokens ?? 1000) : (req.user!.maxTokens ?? 1000);
        const maxContext = customConfig ? (req.user!.customMaxContext ?? 8000) : (req.user!.maxContext ?? 500000);

        try {
            // Stream AI response with language support
            const preferredModel = req.user!.preferredModel ?? "gemini-3-flash";
            // Use smaller context for empty/research mode materials
            const effectiveMaxContext = (material.content && material.content.trim()) ? maxContext : 1000;
            await chatWithMaterialStream(
                material.content ?? "", // Handle null content for research mode
                chatHistory,
                preferredModel,
                maxTokens,
                effectiveMaxContext,
                (chunk: string) => {
                    fullContent += chunk;
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                },
                customConfig,
                language as "id" | "en"
            );

            // Save the complete assistant message to database
            const assistantMessage = await prisma.message.create({
                data: {
                    role: "assistant",
                    content: fullContent,
                    materialId: material.id,
                },
            });

            // If this is a research material, append the conversation to the content
            if (material.type === "research") {
                const newContent = `\n\nUser: ${message}\nAssistant: ${fullContent}`;
                await prisma.material.update({
                    where: { id: material.id },
                    data: {
                        content: (material.content || "") + newContent
                    }
                });
            }

            // Send completion event with full message
            res.write(`data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`);
        } catch (streamError) {
            console.error("Stream error:", streamError);
            res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`);
        }

        res.end();
    } catch (error) {
        console.error("Error in streaming chat:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to process message" });
        }
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

