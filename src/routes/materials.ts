import { Router, Request, Response } from "express";
import multer from "multer";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { generateSummary } from "../lib/ai";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseLib = require("pdf-parse");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require("mammoth");

const router = Router();

// Helper to handle pdf-parse export inconsistencies
const parsePdf = async (buffer: Buffer) => {
    console.log("Inspecting pdf-parse lib...");
    console.log("Type:", typeof pdfParseLib);
    console.log("Keys:", Object.keys(pdfParseLib));
    // console.log("Value:", pdfParseLib); // Be careful if it's huge

    // Common patterns
    let parser = pdfParseLib;
    if (pdfParseLib.default) parser = pdfParseLib.default;

    // If it's still an object and likely the module namespace, maybe it has a named export?
    // But pdf-parse usually is the main export.

    if (typeof parser !== 'function') {
        throw new Error(`pdf-parse library is not a function. Keys: ${Object.keys(pdfParseLib).join(", ")}`);
    }
    return parser(buffer);
};

// Helper to parse Word documents (.docx)
const parseWord = async (buffer: Buffer): Promise<string> => {
    console.log("Parsing Word document with mammoth...");
    const result = await mammoth.extractRawText({ buffer });
    console.log("Word parsed successfully, content length:", result.value.length);
    return result.value;
};

// Configure multer for file uploads (memory storage)
// Supported file types
const ALLOWED_MIMETYPES = [
    "application/pdf",
    "text/plain",
    "text/markdown",
    // Word documents
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc (legacy, limited support)
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, Word (.docx), Text, Markdown`));
        }
    },
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/materials - List all materials for the user
router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const materials = await prisma.material.findMany({
            where: { userId: req.user!.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                type: true,
                summary: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: { messages: true, quizzes: true },
                },
            },
        });

        res.json({ success: true, materials });
    } catch (error) {
        console.error("Error fetching materials:", error);
        res.status(500).json({ error: "Failed to fetch materials" });
    }
});

// GET /api/materials/:id - Get a single material with messages
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                },
                quizzes: true,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        res.json({ success: true, material });
    } catch (error) {
        console.error("Error fetching material:", error);
        res.status(500).json({ error: "Failed to fetch material" });
    }
});

// POST /api/materials - Upload a new material
router.post(
    "/",
    upload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        console.log("POST /api/materials received request");
        try {
            if (!req.user) {
                console.error("No user attached to request");
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            console.log("User found:", req.user.id);

            const title = req.body.title || "Untitled Material";
            const description = req.body.description;
            const requestedType = req.body.type; // "research", "text", "pdf", etc.

            let content: string | null = null;
            let type: string;

            console.log("Processing upload...", { requestedType, hasFile: !!req.file, hasContent: !!req.body.content, hasDescription: !!description });

            // Research mode - no content needed, just description
            if (requestedType === "research") {
                type = "research";
                content = null; // Research mode doesn't have content initially
                console.log("Research mode material");
            }
            // File upload mode
            else if (req.file) {
                console.log("File received:", req.file.originalname, req.file.mimetype, req.file.size);
                const mimetype = req.file.mimetype;

                if (mimetype === "application/pdf") {
                    console.log("Parsing PDF...");
                    const pdfData = await parsePdf(req.file.buffer);
                    content = pdfData.text;
                    type = requestedType || "pdf";
                    console.log("PDF parsed, content length:", content.length);
                } else if (
                    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    mimetype === "application/msword"
                ) {
                    console.log("Parsing Word document...");
                    content = await parseWord(req.file.buffer);
                    type = requestedType || "docx";
                    console.log("Word parsed, content length:", content.length);
                } else {
                    content = req.file.buffer.toString("utf-8");
                    type = mimetype === "text/markdown" ? "markdown" : (requestedType || "text");
                    console.log("Text file read, content length:", content.length);
                }
            }
            // Text content mode
            else if (req.body.content) {
                console.log("Raw content received");
                content = req.body.content;
                type = requestedType || "text";
            }
            // No file, no content, no research mode
            else {
                console.error("No file, content, or research mode specified");
                res.status(400).json({ error: "No file, content, or research mode provided" });
                return;
            }

            console.log("Creating prisma record...");
            // Create material in database
            const material = await prisma.material.create({
                data: {
                    title,
                    content,
                    description,
                    type,
                    userId: req.user!.id,
                },
            });
            console.log("Material created successfully:", material.id);

            res.status(201).json({ success: true, material });
        } catch (error) {
            console.error("Error creating material DETAILS:", error);
            res.status(500).json({ error: "Failed to create material", details: String(error) });
        }
    }
);

// PUT /api/materials/:id - Update material content/title
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const { title, content } = req.body;

        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        const updatedMaterial = await prisma.material.update({
            where: { id: material.id },
            data: {
                title: title || undefined,
                content: content || undefined,
            },
        });

        res.json({ success: true, material: updatedMaterial });
    } catch (error) {
        console.error("Error updating material:", error);
        res.status(500).json({ error: "Failed to update material" });
    }
});

// POST /api/materials/:id/summary - Generate AI summary
router.post("/:id/summary", async (req: Request, res: Response): Promise<void> => {
    try {
        const { model, customText, language = "en" } = req.body;

        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Determinte content for summary
        let contentToSummarize = material.content;

        // For research mode or empty content, use chat history
        if (!contentToSummarize || material.type === "research") {
            const messages = await prisma.message.findMany({
                where: { materialId: material.id },
                orderBy: { createdAt: "asc" },
                take: 50 // Limit to last 50 messages to catch the context
            });

            if (messages.length > 0) {
                // Format chat history as content
                contentToSummarize = messages.map(m =>
                    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
                ).join("\n\n");
            } else if (material.description) {
                contentToSummarize = `Topic: ${material.title}\nDescription: ${material.description}`;
            } else {
                contentToSummarize = `Topic: ${material.title}`;
            }
        }

        // Generate summary using AI with optional model, custom instructions, and language
        // Ensure content is not null/empty string if possible, though previous logic handles it
        const summary = await generateSummary(contentToSummarize || "No content available.", model, customText, undefined, language);

        // Save summary to database
        await prisma.material.update({
            where: { id: material.id },
            data: { summary },
        });

        res.json({ success: true, summary });
    } catch (error) {
        console.error("Error generating summary:", error);
        res.status(500).json({ error: "Failed to generate summary" });
    }
});

// DELETE /api/materials/:id - Delete a material
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        await prisma.material.delete({
            where: { id: material.id },
        });

        res.json({ success: true, message: "Material deleted" });
    } catch (error) {
        console.error("Error deleting material:", error);
        res.status(500).json({ error: "Failed to delete material" });
    }
});

// POST /api/materials/parse - Parse a file and return text content
router.post(
    "/parse",
    upload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.file) {
                res.status(400).json({ error: "No file provided" });
                return;
            }

            const smartCleanup = req.body.smartCleanup === "true";

            let content = "";
            const mimetype = req.file.mimetype;

            if (mimetype === "application/pdf") {
                const pdfData = await parsePdf(req.file.buffer);
                content = pdfData.text;
            } else if (
                mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                mimetype === "application/msword"
            ) {
                content = await parseWord(req.file.buffer);
            } else {
                content = req.file.buffer.toString("utf-8");
            }

            // If smart cleanup is enabled, use AI to clean the content
            if (smartCleanup && content.length > 100) {
                try {
                    const { default: ai } = await import("../lib/ai");
                    const defaultModel = "gemini-2.5-flash-lite";

                    const response = await ai.chat.completions.create({
                        model: defaultModel,
                        messages: [
                            {
                                role: "system",
                                content: `Kamu adalah asisten yang membersihkan konten dokumen akademik/pembelajaran.

TUGAS: Hapus bagian-bagian yang TIDAK PENTING:
- Daftar Isi (Table of Contents)
- Daftar Gambar/Tabel
- Halaman kosong atau teks "This page intentionally left blank"
- Header/footer berulang (seperti nama universitas berulang)
- Nomor halaman standalone
- Catatan kaki yang hanya berisi referensi
- Cover/sampul/title page
- Ucapan terima kasih
- Indeks di akhir dokumen
- Watermark atau teks repeated

PENTING:
1. PERTAHANKAN semua konten pembelajaran substantif
2. Pertahankan semua penjelasan, definisi, rumus, contoh, soal
3. Pertahankan judul bab dan sub-bab
4. Output HANYA konten yang sudah dibersihkan, tanpa komentar tambahan`
                            },
                            {
                                role: "user",
                                content: `Bersihkan dokumen ini:\n\n${content.slice(0, 50000)}`
                            }
                        ],
                        max_tokens: 16000,
                    });

                    const cleanedContent = response.choices[0]?.message?.content;
                    if (cleanedContent && cleanedContent.length > 50) {
                        const originalLength = content.length;
                        content = cleanedContent;
                        console.log(`Smart cleanup: ${originalLength} -> ${content.length} chars (removed ${originalLength - content.length})`);
                    }
                } catch (cleanupError) {
                    console.error("Smart cleanup failed, using original content:", cleanupError);
                    // Continue with original content if cleanup fails
                }
            }

            res.json({ success: true, content });
        } catch (error) {
            console.error("Error parsing file:", error);
            res.status(500).json({ error: "Failed to parse file" });
        }
    }
);


// DELETE /api/materials/:id/summary - Delete summary for a material
router.delete("/:id/summary", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        await prisma.material.update({
            where: { id: req.params.id },
            data: { summary: null },
        });

        res.json({ success: true, message: "Summary deleted" });
    } catch (error) {
        console.error("Error deleting summary:", error);
        res.status(500).json({ error: "Failed to delete summary" });
    }
});

// DELETE /api/materials/:id/quizzes - Delete all quizzes for a material
router.delete("/:id/quizzes", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        await prisma.quiz.deleteMany({
            where: { materialId: req.params.id },
        });

        res.json({ success: true, message: "Quizzes deleted" });
    } catch (error) {
        console.error("Error deleting quizzes:", error);
        res.status(500).json({ error: "Failed to delete quizzes" });
    }
});

// DELETE /api/materials/:id/messages - Delete all messages for a material (clear chat)
router.delete("/:id/messages", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        await prisma.message.deleteMany({
            where: { materialId: req.params.id },
        });

        res.json({ success: true, message: "All messages deleted" });
    } catch (error) {
        console.error("Error deleting messages:", error);
        res.status(500).json({ error: "Failed to delete messages" });
    }
});

// DELETE /api/materials/:id/messages/:messageId - Delete a single message
router.delete("/:id/messages/:messageId", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        const message = await prisma.message.findFirst({
            where: {
                id: req.params.messageId,
                materialId: req.params.id,
            },
        });

        if (!message) {
            res.status(404).json({ error: "Message not found" });
            return;
        }

        await prisma.message.delete({
            where: { id: req.params.messageId },
        });

        res.json({ success: true, message: "Message deleted" });
    } catch (error) {
        console.error("Error deleting message:", error);
        res.status(500).json({ error: "Failed to delete message" });
    }
});

// POST /api/materials/:id/append-file - Append PDF content to existing material
router.post(
    "/:id/append-file",
    upload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const material = await prisma.material.findFirst({
                where: {
                    id: req.params.id,
                    userId: req.user!.id,
                },
            });

            if (!material) {
                res.status(404).json({ error: "Material not found" });
                return;
            }

            if (!req.file) {
                res.status(400).json({ error: "No file provided" });
                return;
            }

            let newContent = "";
            const mimetype = req.file.mimetype;

            if (mimetype === "application/pdf") {
                const pdfData = await parsePdf(req.file.buffer);
                newContent = pdfData.text;
            } else if (
                mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                mimetype === "application/msword"
            ) {
                newContent = await parseWord(req.file.buffer);
            } else {
                newContent = req.file.buffer.toString("utf-8");
            }

            // Append content with separator
            const separator = "\n\n---\n\n[Tambahan Konten]\n\n";
            const updatedContent = material.content + separator + newContent;

            const updatedMaterial = await prisma.material.update({
                where: { id: material.id },
                data: { content: updatedContent },
            });

            res.json({ success: true, material: updatedMaterial });
        } catch (error) {
            console.error("Error appending file:", error);
            res.status(500).json({ error: "Failed to append file" });
        }
    }
);

// POST /api/materials/:id/append-text - Append text content to existing material
router.post("/:id/append-text", async (req: Request, res: Response): Promise<void> => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== "string") {
            res.status(400).json({ error: "No text provided" });
            return;
        }

        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Append text with separator
        const separator = "\n\n---\n\n[Tambahan Catatan]\n\n";
        const updatedContent = material.content + separator + text;

        const updatedMaterial = await prisma.material.update({
            where: { id: material.id },
            data: { content: updatedContent },
        });

        res.json({ success: true, material: updatedMaterial });
    } catch (error) {
        console.error("Error appending text:", error);
        res.status(500).json({ error: "Failed to append text" });
    }
});

// POST /api/materials/:id/publish - Publish material (Create/Update Explore Snapshot)
router.post("/:id/publish", async (req: Request, res: Response): Promise<void> => {
    try {
        // Accept override title/description for the published card
        const { title, description } = req.body;

        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        // Content Moderation check
        const publishTitle = title || material.title;
        const publishDesc = description || material.description || "";
        const combinedContent = `Title: ${publishTitle}\nDescription: ${publishDesc}\nContent: ${material.content || ''}`;

        // Dynamic import to avoid circular dependencies
        const { isContentSafe } = await import("../lib/ai");
        const moderation = await isContentSafe(combinedContent);

        if (!moderation.safe) {
            res.status(400).json({
                error: "Content Moderation Failed",
                reason: moderation.reason || "Content contains restricted material."
            });
            return;
        }

        // Check if we already have an existing Explore snapshot for this material
        // We need to cast prisma to any because the client might not be regenerated yet in dev
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaAny = prisma as any;

        // Use custom content if provided, otherwise use material content
        const publishContent = req.body.content !== undefined ? req.body.content : (material.content || "");

        const existingExplore = await prismaAny.exploreContent.findFirst({
            where: { originalMaterialId: material.id }
        });

        let exploreContent;
        if (existingExplore) {
            // Update existing snapshot
            exploreContent = await prismaAny.exploreContent.update({
                where: { id: existingExplore.id },
                data: {
                    title: publishTitle,
                    description: publishDesc,
                    content: publishContent,
                    updatedAt: new Date()
                }
            });
        } else {
            // Create new snapshot
            exploreContent = await prismaAny.exploreContent.create({
                data: {
                    title: publishTitle,
                    description: publishDesc,
                    content: publishContent,
                    type: material.type,
                    userId: req.user!.id,
                    originalMaterialId: material.id
                }
            });
        }

        // Mark local material as hasPublished (we can still use isPublic as a status indicator)
        const updatedMaterial = await prisma.material.update({
            where: { id: material.id },
            data: {
                isPublic: true,
                publishedAt: new Date()
            },
        });

        res.json({ success: true, material: updatedMaterial, exploreContent });
    } catch (error) {
        console.error("Error publishing material:", error);
        res.status(500).json({ error: "Failed to publish material" });
    }
});

// POST /api/materials/:id/unpublish - Make material private
router.post("/:id/unpublish", async (req: Request, res: Response): Promise<void> => {
    try {
        const material = await prisma.material.findFirst({
            where: {
                id: req.params.id,
                userId: req.user!.id,
            },
        });

        if (!material) {
            res.status(404).json({ error: "Material not found" });
            return;
        }

        const updatedMaterial = await prisma.material.update({
            where: { id: material.id },
            data: {
                isPublic: false,
                publishedAt: null
            },
        });

        res.json({ success: true, material: updatedMaterial });
    } catch (error) {
        console.error("Error unpublishing material:", error);
        res.status(500).json({ error: "Failed to unpublish material" });
    }
});

export default router;

