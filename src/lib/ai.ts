import OpenAI from "openai";

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
    explanation?: string;
}

// Difficulty descriptions for AI prompt
const difficultyPrompts = {
    easy: `Create EASY questions that:
- Test basic recall and recognition of facts
- Use straightforward language
- Have clearly distinguishable answer options
- Focus on "what", "who", "when" type questions`,
    medium: `Create MEDIUM difficulty questions that:
- Test understanding and application of concepts  
- Require some analysis to answer correctly
- Include some similar-looking answer options that require careful reading
- Focus on "how", "why", and "explain" type questions`,
    hard: `Create HARD questions that:
- Test critical thinking and deep analysis
- Require synthesis of multiple concepts
- Include nuanced answer options that require careful consideration
- Focus on application, analysis, and evaluation
- May include scenario-based questions`
};

// Generate quiz questions from the material
export async function generateQuiz(
    content: string,
    count: number = 10,
    model?: string,
    difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<QuizQuestion[]> {
    try {
        const difficultyGuide = difficultyPrompts[difficulty];

        const response = await ai.chat.completions.create({
            model: model || defaultModel,
            messages: [
                {
                    role: "system",
                    content: `You are an expert educational assessment creator. Your task is to create high-quality multiple-choice quiz questions based STRICTLY on the provided learning material.

${difficultyGuide}

IMPORTANT RULES:
1. Create EXACTLY ${count} questions
2. Each question MUST have exactly 4 options (A, B, C, D)
3. Only ONE option should be correct
4. Questions must be based ONLY on the provided material - do not add external information
5. Distribute questions across different topics/sections in the material
6. Avoid trivial or obvious questions
7. Make incorrect options plausible but clearly wrong when analyzed
8. Include a brief explanation for why the correct answer is right

Respond in this EXACT JSON format (and ONLY this JSON, no other text):
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

The "answer" field should be the index (0-3) of the correct option.`,
                },
                {
                    role: "user",
                    content: `Generate ${count} ${difficulty.toUpperCase()} difficulty quiz questions from this material:\n\n${content.slice(0, 12000)}`,
                },
            ],
            max_tokens: Math.min(4000, count * 300), // Scale tokens with question count
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
