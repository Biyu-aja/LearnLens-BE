import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

// Helper for loose typing while in dev
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaAny = prisma as any;

// GET /api/explore - List public content (ExploreContent)
router.get("/", async (req: Request, res: Response) => {
    try {
        const { query, sort, userId } = req.query;
        const searchQuery = query ? String(query) : undefined;
        const filterUserId = userId ? String(userId) : undefined;

        // Use ExploreContent model with explicit selection to avoid fetching heavy 'content'
        const contents = await prismaAny.exploreContent.findMany({
            where: {
                ...(filterUserId ? { userId: filterUserId } : {}),
                ...(searchQuery ? {
                    OR: [
                        { title: { contains: searchQuery, mode: 'insensitive' } },
                        { description: { contains: searchQuery, mode: 'insensitive' } }
                    ]
                } : {})
            },
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                createdAt: true,
                forksCount: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    }
                },
                _count: {
                    select: { likes: true, comments: true }
                },
                likes: {
                    where: { userId: req.user!.id },
                    select: { id: true }
                }
            },
            orderBy: sort === 'popular'
                ? { likes: { _count: 'desc' } }
                : { createdAt: 'desc' },
            take: 50
        });

        // Transform results
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedMaterials = contents.map((m: any) => ({
            ...m,
            isLiked: m.likes.length > 0,
            likeCount: m._count.likes,
            commentCount: m._count.comments,
            forkCount: m.forksCount || 0, // Should be in DB now, but keep fallback
            likes: undefined,
            _count: undefined
        }));

        res.json({ success: true, materials: formattedMaterials });
    } catch (error) {
        console.error("Explore Error:", error);
        res.status(500).json({ error: "Failed to fetch explore content. Please ensure Prisma Client is regenerated." });
    }
});

// GET /api/explore/:id - Get details of explore content
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const content = await prismaAny.exploreContent.findUnique({
            where: {
                id: req.params.id,
            },
            include: {
                user: { select: { name: true, image: true, id: true } },
                _count: { select: { likes: true } },
                likes: { where: { userId: req.user!.id } }
            }
        });

        if (!content) {
            res.status(404).json({ error: "Content not found" });
            return;
        }

        // Increment views
        prismaAny.exploreContent.update({
            where: { id: content.id },
            data: { views: { increment: 1 } }
        }).catch((err: any) => console.error("Failed to increment views:", err));

        const formattedContent = {
            ...content,
            isLiked: content.likes.length > 0,
            likeCount: content._count.likes,
            forkCount: content.forksCount || 0, // Fallback
            likes: undefined,
            _count: undefined
        };

        res.json({ success: true, material: formattedContent }); // Keep 'material' key for frontend compatibility or change to 'content'
    } catch (error) {
        console.error("Explore Detail Error:", error);
        res.status(500).json({ error: "Failed to fetch content details" });
    }
});

// POST /api/explore/:id/like - Toggle like on ExploreContent
router.post("/:id/like", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const existingLike = await prismaAny.exploreLike.findUnique({
            where: {
                userId_exploreContentId: {
                    userId,
                    exploreContentId: id
                }
            }
        });

        if (existingLike) {
            await prismaAny.exploreLike.delete({
                where: { id: existingLike.id }
            });
            res.json({ success: true, liked: false });
        } else {
            await prismaAny.exploreLike.create({
                data: {
                    userId,
                    exploreContentId: id
                }
            });
            res.json({ success: true, liked: true });
        }
    } catch (error) {
        console.error("Like Error:", error);
        res.status(500).json({ error: "Failed to toggle like" });
    }
});

// POST /api/explore/:id/fork - Copy content to own library (Material)
router.post("/:id/fork", async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const exploreContent = await prismaAny.exploreContent.findUnique({
            where: { id }
        });

        if (!exploreContent) {
            res.status(404).json({ error: "Content not found" });
            return;
        }

        // Create new Material from Explore Snapshot
        const newMaterial = await prisma.material.create({
            data: {
                title: `${exploreContent.title} (Fork)`,
                description: exploreContent.description,
                content: exploreContent.content,
                type: exploreContent.type,
                userId: userId,
                // forkedFromId: ?? We assume forks track materials. 
                // Maybe we should leave it null or repurpose field.
                isPublic: false,
            }
        });

        // Increment fork count on ExploreContent
        await prismaAny.exploreContent.update({
            where: { id: exploreContent.id },
            data: { forksCount: { increment: 1 } }
        });

        res.json({ success: true, material: newMaterial });
    } catch (error) {
        console.error("Fork Error:", error);
        res.status(500).json({ error: "Failed to fork content" });
    }
});

export default router;
