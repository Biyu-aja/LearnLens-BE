import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { generateToken, authMiddleware } from "../middleware/auth";
import { AI_MODELS } from "../lib/ai";

const router = Router();

// POST /api/auth/register - Register new user with password
router.post("/register", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({ error: "Invalid email format" });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: "Password must be at least 6 characters" });
            return;
        }

        const existing = await prisma.user.findUnique({
            where: { email },
        });

        if (existing) {
            res.status(400).json({ error: "Email already registered" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: name || email.split("@")[0],
                emailVerified: new Date(),
            },
        });

        const token = generateToken(user.id);

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                preferredModel: user.preferredModel,
            },
            token,
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// POST /api/auth/login - Login with email and password
router.post("/login", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const token = generateToken(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                preferredModel: user.preferredModel,
            },
            token,
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

// GET /api/auth/me - Get current user
router.get("/me", authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        res.json({
            success: true,
            user: req.user,
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to get user" });
    }
});

// PUT /api/auth/settings - Update user settings
router.put("/settings", authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        const { name, preferredModel, maxTokens } = req.body;

        // Validate model if provided
        if (preferredModel) {
            const validModel = AI_MODELS.find(m => m.id === preferredModel);
            if (!validModel) {
                res.status(400).json({ error: "Invalid model selected" });
                return;
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(preferredModel !== undefined && { preferredModel }),
                ...(maxTokens !== undefined && { maxTokens: Number(maxTokens) }),
            },
        });

        res.json({
            success: true,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                image: updatedUser.image,
                preferredModel: updatedUser.preferredModel,
                maxTokens: updatedUser.maxTokens,
            },
        });
    } catch (error) {
        console.error("Settings update error:", error);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

// GET /api/auth/models - Get available AI models
router.get("/models", async (_req: Request, res: Response): Promise<void> => {
    res.json({
        success: true,
        models: AI_MODELS,
    });
});

export default router;
