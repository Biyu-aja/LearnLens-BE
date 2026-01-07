import OpenAI from "openai";

// Get configuration from environment
const apiKey = process.env.AI_API_KEY;
const baseURL = process.env.AI_API_URL || "https://gateway.haluai.my.id/v1";
const defaultModel = process.env.AI_MODEL || "gemini-2.5-flash-lite";

// Available models with their info
export const AI_MODELS = [
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", tier: "flash", price: "Rp 5.000/1M tokens" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "flash", price: "Rp 5.000/1M tokens" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", tier: "flash", price: "Rp 5.000/1M tokens" },
    { id: "gemini-3-pro-low", name: "Gemini 3 Pro Low", tier: "standard", price: "Rp 50.000/1M tokens" },
    { id: "claude-4-5-sonnet", name: "Claude 4.5 Sonnet", tier: "standard", price: "Rp 50.000/1M tokens" },
    { id: "gemini-3-pro-high", name: "Gemini 3 Pro High", tier: "pro", price: "Rp 75.000/1M tokens" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "pro", price: "Rp 75.000/1M tokens" },
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
                {
                    role: "system",
                    content: `You are an educational assistant. Create a clear, concise summary of the provided learning material. 
Focus on the main concepts and key takeaways. Format your response in markdown for easy reading.
Keep the summary focused and helpful for learning.`,
                },
                {
                    role: "user",
                    content: `Please summarize this learning material:\n\n${content.slice(0, 8000)}`,
                },
            ],
            max_tokens: 1000,
        });

        return response.choices[0]?.message?.content || "Unable to generate summary.";
    } catch (error: any) {
        // Fallback to default model if specific model fails
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
            {
                role: "system",
                content: `You are an educational assistant. Extract and explain the key concepts from the learning material.
For each concept:
1. Name the concept
2. Provide a clear, simple explanation
3. Give a brief example if applicable

Format your response in markdown with clear headings.`,
            },
            {
                role: "user",
                content: `Extract key concepts from this material:\n\n${content.slice(0, 8000)}`,
            },
        ],
        max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || "Unable to extract key concepts.";
}

// Quiz question interface
export interface QuizQuestion {
    question: string;
    options: string[];
    answer: number;
}

// Generate quiz questions from the material
export async function generateQuiz(content: string, count: number = 5, model?: string): Promise<QuizQuestion[]> {
    try {
        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                {
                    role: "system",
                    content: `You are an educational assistant. Create ${count} multiple-choice quiz questions based ONLY on the provided learning material.
Each question should:
1. Test understanding of a key concept
2. Have exactly 4 options
3. Have only one correct answer

Respond in this exact JSON format (and ONLY this JSON, no other text):
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0
    }
  ]
}

The "answer" field should be the index (0-3) of the correct option.`,
                },
                {
                    role: "user",
                    content: `Generate ${count} quiz questions from this material:\n\n${content.slice(0, 8000)}`,
                },
            ],
            max_tokens: 2000,
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
        // Fallback to default model if specific model fails
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
                {
                    role: "system",
                    content: `You are an educational tutor helping a student understand their learning material.
IMPORTANT: Only answer questions based on the provided material below. If asked about something not in the material, politely explain that you can only help with content from their uploaded document.

=== LEARNING MATERIAL ===
${content.slice(0, 6000)}
=== END OF MATERIAL ===

Be helpful, encouraging, and explain concepts clearly. Use examples from the material when possible.`,
                },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
            max_tokens: maxTokens || 1000,
        });

        return response.choices[0]?.message?.content || "I couldn't generate a response.";
    } catch (error: any) {
        // Fallback to default model if specific model fails
        if (model && model !== defaultModel) {
            console.warn(`Chat model ${model} failed, retrying with default...`);
            return chatWithMaterial(content, messages, defaultModel, maxTokens);
        }
        console.error("AI Chat Error:", error);
        return "I apologize, but I'm having trouble connecting to the AI service right now. Please try again later.";
    }
}

export default ai;
