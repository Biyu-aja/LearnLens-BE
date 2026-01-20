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
    {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        price: "Rp 2.500/1M tokens",
        description: "Model paling ringan dan cepat. Cocok untuk tugas sederhana.",
        pros: ["Tercepat", "Termurah", "Response instan"],
        cons: ["Kurang akurat untuk tugas kompleks", "Context window lebih kecil"]
    },
    {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        price: "Rp 2.500/1M tokens",
        description: "Keseimbangan antara kecepatan dan kualitas. Rekomendasi untuk sebagian besar penggunaan.",
        pros: ["Cepat", "Akurat", "Context window besar (1M tokens)"],
        cons: ["Sedikit lebih lambat dari Lite"]
    },
    {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        price: "Rp 2.500/1M tokens",
        description: "Model terbaru dengan kemampuan reasoning lebih baik.",
        pros: ["Model terbaru", "Reasoning terbaik", "Multimodal"],
        cons: ["Masih dalam development", "Bisa lebih lambat"]
    },
];

// Log configuration status
if (!apiKey) {
    console.warn("⚠️  AI_API_KEY not found in environment variables");
} else {
    console.log(`🤖 AI configured with default model: ${defaultModel}`);
}

// Initialize default OpenAI client with custom gateway (HaluAI)
const defaultAI = new OpenAI({
    apiKey: apiKey || "dummy-key-for-init",
    baseURL: baseURL,
});

// User custom API configuration interface
export interface CustomAPIConfig {
    customApiUrl?: string;
    customApiKey?: string;
    customModel?: string;
}

// Get AI client - uses custom API if configured, otherwise default
export function getAIClient(customConfig?: CustomAPIConfig): { client: OpenAI; model: string } {
    // If custom API is configured, create a new client
    if (customConfig?.customApiUrl && customConfig?.customApiKey) {
        console.log(`🔧 Using custom API: ${customConfig.customApiUrl}`);
        const customClient = new OpenAI({
            apiKey: customConfig.customApiKey,
            baseURL: customConfig.customApiUrl,
        });
        return {
            client: customClient,
            model: customConfig.customModel || defaultModel,
        };
    }

    // Otherwise use default
    return {
        client: defaultAI,
        model: defaultModel,
    };
}

// Generate a summary of the material content
export async function generateSummary(
    content: string,
    model?: string,
    customInstructions?: string,
    customConfig?: CustomAPIConfig
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: SUMMARY_SYSTEM_PROMPT },
                { role: "user", content: getSummaryUserPrompt(content, customInstructions) },
            ],
            max_tokens: 1500,
        });

        return response.choices[0]?.message?.content || "Unable to generate summary.";
    } catch (error: any) {
        console.error("AI Summary Error:", error);
        // If using custom API and it fails, don't fallback - let user know
        if (customConfig?.customApiUrl) {
            return "Failed to connect to your custom API. Please check your API URL and key.";
        }
        return "Unable to generate summary due to AI service error.";
    }
}

// Generate key concepts from the material
export async function generateKeyConcepts(
    content: string,
    model?: string,
    customConfig?: CustomAPIConfig
): Promise<string> {
    const { client, model: aiModel } = getAIClient(customConfig);
    const useModel = customConfig?.customModel || model || aiModel;

    const response = await client.chat.completions.create({
        model: useModel,
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
export async function generateGlossary(
    content: string,
    model?: string,
    customConfig?: CustomAPIConfig
): Promise<GlossaryTerm[]> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
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
        console.error("AI Glossary Error:", error);
        return [];
    }
}

// Quiz question interface
export interface QuizQuestion {
    question: string;
    options: string[];
    answer: number;
    hint?: string;
    explanation?: string;
}

// Generate quiz questions from the material
export async function generateQuiz(
    content: string,
    count: number = 10,
    model?: string,
    difficulty: "easy" | "medium" | "hard" = "medium",
    customInstructions?: string,
    customConfig?: CustomAPIConfig
): Promise<QuizQuestion[]> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getQuizSystemPrompt(count, difficulty) },
                { role: "user", content: getQuizUserPrompt(content, count, difficulty, customInstructions) },
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
        console.error("AI Quiz Error:", error);
        return [];
    }
}

// Chat with the material (answer questions based on content)
export async function chatWithMaterial(
    content: string,
    messages: { role: "user" | "assistant"; content: string }[],
    model?: string,
    maxTokens?: number,
    maxContext?: number,
    customConfig?: CustomAPIConfig
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;
        const contextLimit = maxContext || 6000;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content, contextLimit) },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
            max_tokens: maxTokens || 1000,
        });

        return response.choices[0]?.message?.content || "I couldn't generate a response.";
    } catch (error: any) {
        console.error("AI Chat Error:", error);
        if (customConfig?.customApiUrl) {
            return "Failed to connect to your custom API. Please check your settings.";
        }
        return "I apologize, but I'm having trouble connecting to the AI service right now. Please try again later.";
    }
}

// Chat with the material using streaming
export async function chatWithMaterialStream(
    content: string,
    messages: { role: "user" | "assistant"; content: string }[],
    model?: string,
    maxTokens?: number,
    maxContext?: number,
    onChunk?: (chunk: string) => void,
    customConfig?: CustomAPIConfig
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;
        const contextLimit = maxContext || 6000;

        console.log(`🤖 Streaming with model: ${useModel}${customConfig?.customApiUrl ? ' (Custom API)' : ''}, context: ${contextLimit}`);

        const stream = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content, contextLimit) },
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
        console.error("AI Stream Error:", error);
        throw error;
    }
}

export default defaultAI;
