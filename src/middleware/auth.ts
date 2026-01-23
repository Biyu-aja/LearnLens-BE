import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name?: string;
                image?: string;
                preferredModel: string;
                maxTokens: number;
                maxContext: number;
                customApiUrl?: string;
                customApiKey?: string;
                customModel?: string;
                customMaxTokens?: number;
                customMaxContext?: number;
            };
        }
    }
}

// Auth middleware - verifies JWT token and attaches user to request
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.log("Auth failed: No token provided");
            res.status(401).json({ error: "Unauthorized - No token provided" });
            return;
        }

        const token = authHeader.split(" ")[1];
        const secret = process.env.JWT_SECRET || "learnlens-secret";

        const decoded = jwt.verify(token, secret) as { userId: string };

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
        });

        if (!user) {
            console.log("Auth failed: User not found for ID", decoded.userId);
            res.status(401).json({ error: "Unauthorized - User not found" });
            return;
        }

        req.user = {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
            preferredModel: user.preferredModel || "gemini-2.5-flash-lite",
            maxTokens: user.maxTokens || 1000,
            maxContext: (user as any).maxContext || 500000,
            customApiUrl: (user as any).customApiUrl ?? undefined,
            customApiKey: (user as any).customApiKey ?? undefined,
            customModel: (user as any).customModel ?? undefined,
            customMaxTokens: user.customMaxTokens ?? undefined,
            customMaxContext: user.customMaxContext ?? undefined,
        };

        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
}

// Generate JWT token for a user
export function generateToken(userId: string): string {
    const secret = process.env.JWT_SECRET || "learnlens-secret";
    return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}
