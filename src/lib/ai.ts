import OpenAI from "openai";
import {
    SUMMARY_SYSTEM_PROMPT,
    getSummaryUserPrompt,
    KEY_CONCEPTS_SYSTEM_PROMPT,
    getKeyConceptsUserPrompt,
    GLOSSARY_SYSTEM_PROMPT,
    getGlossaryUserPrompt,
    getQuizSystemPrompt,
    getQuizUserPrompt,
    getChatSystemPrompt,
} from "./prompts";

// Get configuration from environment
const apiKey = process.env.AI_API_KEY;
const baseURL = process.env.AI_API_URL || "https://gateway.haluai.my.id/v1";
const defaultModel = process.env.AI_MODEL || "gemini-2.5-flash-lite";

// Available models with their info (from HaluAI Gateway)
export const AI_MODELS = [
    // Flash tier
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", tier: "flash", price: "Rp 2.500/1M tokens" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "flash", price: "Rp 2.500/1M tokens" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", tier: "flash", price: "Rp 2.500/1M tokens" },
    // Standard tier
    { id: "gemini-3-pro-low", name: "Gemini 3 Pro Low", tier: "standard", price: "Rp 25.000/1M tokens" },
    { id: "claude-sonnet-4-5", name: "Claude 4.5 Sonnet", tier: "standard", price: "Rp 25.000/1M tokens" },
    // Pro tier
    { id: "gemini-3-pro-high", name: "Gemini 3 Pro High", tier: "pro", price: "Rp 37.500/1M tokens" },
    { id: "gemini-3-pro-image", name: "Gemini 3 Pro (Image)", tier: "pro", price: "Rp 37.500/1M tokens" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "pro", price: "Rp 37.500/1M tokens" },
    // Thinking tier
    { id: "gemini-2.5-flash-thinking", name: "Gemini 2.5 Flash (Thinking)", tier: "thinking", price: "Rp 50.000/1M tokens" },
    { id: "claude-sonnet-4-5-thinking", name: "Claude 4.5 Sonnet (Thinking)", tier: "thinking", price: "Rp 50.000/1M tokens" },
    // Premium tier
    { id: "claude-opus-4-5-thinking", name: "Claude 4.5 Opus (Thinking)", tier: "premium", price: "Rp 62.500/1M tokens" },
];

// Log configuration status
if (!apiKey) {
    console.warn("⚠️  AI_API_KEY not found in environment variables");
} else {
    console.log(`🤖 AI configured with default model: ${defaultModel}`);
}

// Initialize OpenAI client with custom gateway (HaluAI)
const ai = new OpenAI({
    apiKey: apiKey || "dummy-key-for-init",
    baseURL: baseURL,
});

// Generate a summary of the material content
export async function generateSummary(content: string, model?: string): Promise<string> {
    try {
        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                { role: "system", content: SUMMARY_SYSTEM_PROMPT },
                { role: "user", content: getSummaryUserPrompt(content) },
            ],
            max_tokens: 1000,
        });

        return response.choices[0]?.message?.content || "Unable to generate summary.";
    } catch (error: any) {
        if (model && model !== defaultModel) {
            console.warn(`Model ${model} failed, retrying with default...`);
            return generateSummary(content, defaultModel);
        }
        console.error("AI Summary Error:", error);
        return "Unable to generate summary due to AI service error.";
    }
}

// Generate key concepts from the material
export async function generateKeyConcepts(content: string, model?: string): Promise<string> {
    const response = await ai.chat.completions.create({
        model: model || defaultModel,
        messages: [
            { role: "system", content: KEY_CONCEPTS_SYSTEM_PROMPT },
            { role: "user", content: getKeyConceptsUserPrompt(content) },
        ],
        max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || "Unable to extract key concepts.";
}

// Glossary term interface
export interface GlossaryTerm {
    term: string;
    definition: string;
    category?: string;
}

// Generate glossary from the material content
export async function generateGlossary(content: string, model?: string): Promise<GlossaryTerm[]> {
    try {
        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                { role: "system", content: GLOSSARY_SYSTEM_PROMPT },
                { role: "user", content: getGlossaryUserPrompt(content) },
            ],
            max_tokens: 2000,
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.glossary || [];
        } catch (e) {
            console.error("Failed to parse glossary response:", e);
            return [];
        }
    } catch (error: any) {
        if (model && model !== defaultModel) {
            console.warn(`Glossary model ${model} failed, retrying with default...`);
            return generateGlossary(content, defaultModel);
        }
        console.error("AI Glossary Error:", error);
        return [];
    }
}

// Quiz question interface
export interface QuizQuestion {
    question: string;
    options: string[];
    answer: number;
    explanation?: string;
}

// Generate quiz questions from the material
export async function generateQuiz(
    content: string,
    count: number = 10,
    model?: string,
    difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<QuizQuestion[]> {
    try {
        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                { role: "system", content: getQuizSystemPrompt(count, difficulty) },
                { role: "user", content: getQuizUserPrompt(content, count, difficulty) },
            ],
            max_tokens: Math.min(4000, count * 300),
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.questions || [];
        } catch (e) {
            console.error("Failed to parse quiz response:", e);
            return [];
        }
    } catch (error: any) {
        if (model && model !== defaultModel) {
            console.warn(`Quiz model ${model} failed, retrying with default...`);
            return generateQuiz(content, count, defaultModel);
        }
        console.error("AI Quiz Error:", error);
        return [];
    }
}

// Chat with the material (answer questions based on content)
export async function chatWithMaterial(
    content: string,
    messages: { role: "user" | "assistant"; content: string }[],
    model?: string,
    maxTokens?: number
): Promise<string> {
    try {
        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content) },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
            max_tokens: maxTokens || 1000,
        });

        return response.choices[0]?.message?.content || "I couldn't generate a response.";
    } catch (error: any) {
        if (model && model !== defaultModel) {
            console.warn(`Chat model ${model} failed, retrying with default...`);
            return chatWithMaterial(content, messages, defaultModel, maxTokens);
        }
        console.error("AI Chat Error:", error);
        return "I apologize, but I'm having trouble connecting to the AI service right now. Please try again later.";
    }
}

// Chat with the material using streaming
export async function chatWithMaterialStream(
    content: string,
    messages: { role: "user" | "assistant"; content: string }[],
    model?: string,
    maxTokens?: number,
    onChunk?: (chunk: string) => void
): Promise<string> {
    try {
        const stream = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content) },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
            max_tokens: maxTokens || 1000,
            stream: true,
        });

        let fullContent = "";

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (delta) {
                fullContent += delta;
                if (onChunk) {
                    onChunk(delta);
                }
            }
        }

        return fullContent || "I couldn't generate a response.";
    } catch (error: any) {
        if (model && model !== defaultModel) {
            console.warn(`Stream model ${model} failed, retrying with default...`);
            return chatWithMaterialStream(content, messages, defaultModel, maxTokens, onChunk);
        }
        console.error("AI Stream Error:", error);
        throw error;
    }
}

export default ai;

