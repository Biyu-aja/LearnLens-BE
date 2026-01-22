import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { chatWithMaterialStream, CustomAPIConfig } from "../lib/ai";
import { Language } from "../lib/prompts";

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/chat-sessions - List all chat sessions
router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const chatSessions = await prisma.chatSession.findMany({
            where: { userId: req.user!.id },
            include: {
                materials: {
                    include: {
                        material: {
                            select: { id: true, title: true, type: true }
                        }
                    }
                },
                _count: {
                    select: { messages: true }
                }
            },
            orderBy: { updatedAt: "desc" }
        });

        // Transform response to include material info
        const sessions = chatSessions.map(session => ({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            materials: session.materials.map(m => m.material),
            messageCount: session._count.messages
        }));

        res.json({ success: true, chatSessions: sessions });
    } catch (error) {
        console.error("Error fetching chat sessions:", error);
        res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
});

// GET /api/chat-sessions/:id - Get a specific chat session with messages
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const chatSession = await prisma.chatSession.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id
            },
            include: {
                materials: {
                    include: {
                        material: {
                            select: { id: true, title: true, type: true, content: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: "asc" }
                }
            }
        });

        if (!chatSession) {
            res.status(404).json({ error: "Chat session not found" });
            return;
        }

        res.json({
            success: true,
            chatSession: {
                id: chatSession.id,
                title: chatSession.title,
                createdAt: chatSession.createdAt,
                updatedAt: chatSession.updatedAt,
                materials: chatSession.materials.map(m => ({
                    id: m.material.id,
                    title: m.material.title,
                    type: m.material.type
                })),
                messages: chatSession.messages
            }
        });
    } catch (error) {
        console.error("Error fetching chat session:", error);
        res.status(500).json({ error: "Failed to fetch chat session" });
    }
});

// POST /api/chat-sessions - Create a new chat session
router.post("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const { materialIds, title } = req.body;

        if (!materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
            res.status(400).json({ error: "At least one material ID is required" });
            return;
        }

        // Verify all materials belong to user
        const materials = await prisma.material.findMany({
            where: {
                id: { in: materialIds },
                userId: req.user!.id
            }
        });

        if (materials.length !== materialIds.length) {
            res.status(404).json({ error: "One or more materials not found" });
            return;
        }

        // Generate title if not provided
        const sessionTitle = title ||
            materials.slice(0, 3).map(m => m.title).join(" + ") +
            (materials.length > 3 ? ` +${materials.length - 3} more` : "");

        // Create chat session with material associations
        const chatSession = await prisma.chatSession.create({
            data: {
                title: sessionTitle,
                userId: req.user!.id,
                materials: {
                    create: materialIds.map((materialId: string) => ({
                        materialId
                    }))
                }
            },
            include: {
                materials: {
                    include: {
                        material: {
                            select: { id: true, title: true, type: true }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            chatSession: {
                id: chatSession.id,
                title: chatSession.title,
                createdAt: chatSession.createdAt,
                updatedAt: chatSession.updatedAt,
                materials: chatSession.materials.map(m => m.material),
                messageCount: 0
            }
        });
    } catch (error) {
        console.error("Error creating chat session:", error);
        res.status(500).json({ error: "Failed to create chat session" });
    }
});

// POST /api/chat-sessions/:id/stream - Send message to chat session (streaming)
router.post("/:id/stream", async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, language = "en" } = req.body;

        if (!message || typeof message !== "string") {
            res.status(400).json({ error: "Message is required" });
            return;
        }

        // Get chat session with materials and recent messages
        const chatSession = await prisma.chatSession.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id
            },
            include: {
                materials: {
                    include: {
                        material: {
                            select: { id: true, title: true, content: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 10
                }
            }
        });

        if (!chatSession) {
            res.status(404).json({ error: "Chat session not found" });
            return;
        }

        // Combine content from all materials
        const combinedContent = chatSession.materials
            .map(m => `=== ${m.material.title} ===\n${m.material.content}`)
            .join("\n\n---\n\n");

        // Save user message
        const userMessage = await prisma.chatSessionMessage.create({
            data: {
                role: "user",
                content: message,
                chatSessionId: chatSession.id
            }
        });

        // Build message history for AI
        const chatHistory = chatSession.messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content
        }));
        chatHistory.push({ role: "user", content: message });

        // Set up SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        // Send user message
        res.write(`data: ${JSON.stringify({ type: "user_message", message: userMessage })}\n\n`);

        let fullContent = "";

        // Build custom API config
        const customConfig: CustomAPIConfig | undefined = req.user!.customApiUrl ? {
            customApiUrl: req.user!.customApiUrl,
            customApiKey: req.user!.customApiKey,
            customModel: req.user!.customModel
        } : undefined;

        try {
            await chatWithMaterialStream(
                combinedContent,
                chatHistory,
                req.user!.preferredModel,
                req.user!.maxTokens,
                req.user!.maxContext,
                (chunk: string) => {
                    fullContent += chunk;
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                },
                customConfig,
                language as Language
            );

            // Save assistant message
            const assistantMessage = await prisma.chatSessionMessage.create({
                data: {
                    role: "assistant",
                    content: fullContent,
                    chatSessionId: chatSession.id
                }
            });

            // Update session's updatedAt
            await prisma.chatSession.update({
                where: { id: chatSession.id },
                data: { updatedAt: new Date() }
            });

            res.write(`data: ${JSON.stringify({ type: "done", message: assistantMessage })}\n\n`);
        } catch (streamError) {
            console.error("Stream error:", streamError);
            res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`);
        }

        res.end();
    } catch (error) {
        console.error("Error in chat session stream:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to process message" });
        }
    }
});

// DELETE /api/chat-sessions/:id - Delete a chat session
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const chatSession = await prisma.chatSession.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id
            }
        });

        if (!chatSession) {
            res.status(404).json({ error: "Chat session not found" });
            return;
        }

        await prisma.chatSession.delete({
            where: { id: chatSession.id }
        });

        res.json({ success: true, message: "Chat session deleted" });
    } catch (error) {
        console.error("Error deleting chat session:", error);
        res.status(500).json({ error: "Failed to delete chat session" });
    }
});

// DELETE /api/chat-sessions/:id/messages - Clear chat history
router.delete("/:id/messages", async (req: Request, res: Response): Promise<void> => {
    try {
        const chatSession = await prisma.chatSession.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id
            }
        });

        if (!chatSession) {
            res.status(404).json({ error: "Chat session not found" });
            return;
        }

        await prisma.chatSessionMessage.deleteMany({
            where: { chatSessionId: chatSession.id }
        });

        res.json({ success: true, message: "Chat history cleared" });
    } catch (error) {
        console.error("Error clearing chat history:", error);
        res.status(500).json({ error: "Failed to clear chat history" });
    }
});

export default router;
