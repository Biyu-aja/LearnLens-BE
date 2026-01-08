import { Router, Request, Response } from "express";
import multer from "multer";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { generateSummary } from "../lib/ai";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseLib = require("pdf-parse");

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

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF and text files are allowed"));
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

            let content: string;
            let type: string;
            const title = req.body.title || "Untitled Material";

            console.log("Processing upload...");
            if (req.file) {
                console.log("File received:", req.file.originalname, req.file.mimetype, req.file.size);
                // Handle file upload
                if (req.file.mimetype === "application/pdf") {
                    console.log("Parsing PDF...");
                    const pdfData = await parsePdf(req.file.buffer);
                    content = pdfData.text;
                    type = "pdf";
                    console.log("PDF parsed, content length:", content.length);
                } else {
                    content = req.file.buffer.toString("utf-8");
                    type = "text";
                    console.log("Text file read, content length:", content.length);
                }
            } else if (req.body.content) {
                console.log("Raw content received");
                // Handle raw text input
                content = req.body.content;
                type = "text";
            } else {
                console.error("No file or content provided");
                res.status(400).json({ error: "No file or content provided" });
                return;
            }

            console.log("Creating prisma record...");
            // Create material in database
            const material = await prisma.material.create({
                data: {
                    title,
                    content,
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

        // Generate summary using AI
        const summary = await generateSummary(material.content);

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

            let content = "";
            if (req.file.mimetype === "application/pdf") {
                const pdfData = await parsePdf(req.file.buffer);
                content = pdfData.text;
            } else {
                content = req.file.buffer.toString("utf-8");
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

export default router;
