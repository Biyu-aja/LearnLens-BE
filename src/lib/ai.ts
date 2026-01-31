import OpenAI from "openai";
import {
    getSummarySystemPrompt,
    getSummaryUserPrompt,
    getKeyConceptsSystemPrompt,
    getKeyConceptsUserPrompt,
    getGlossarySystemPrompt,
    getGlossaryUserPrompt,
    getQuizSystemPrompt,
    getQuizUserPrompt,
    getChatSystemPrompt,
    getFlashcardSystemPrompt,
    getFlashcardUserPrompt,
    getMindMapSystemPrompt,
    getMindMapUserPrompt,
    getStudyPlanSystemPrompt,
    getStudyPlanUserPrompt,
    type Language,
} from "./prompts";

// Get configuration from environment
const apiKey = process.env.AI_API_KEY;
const baseURL = process.env.AI_API_URL || "https://gateway.haluai.my.id/v1";
const defaultModel = process.env.AI_MODEL || "gemini-3-flash";

// Available models with their info (from HaluAI Gateway)
export const AI_MODELS = [
    {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        price: "Rp 2.500/1M tokens",
        description: "Model terbaru dengan kemampuan reasoning lebih baik.",
        pros: ["Model terbaru", "Reasoning terbaik", "Multimodal"],
        cons: ["Masih dalam development"]
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
    // Only use custom API if customApiUrl is explicitly provided and not empty
    // customApiKey might be undefined if it's already saved in the database
    if (customConfig?.customApiUrl && customConfig.customApiUrl.trim() !== "") {
        // We need an API key to use custom API
        if (!customConfig.customApiKey) {
            console.warn("⚠️  Custom API URL provided but no API key available");
            // Fall back to default if no key is available
            return {
                client: defaultAI,
                model: defaultModel,
            };
        }

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

    // Use default HaluAI Gateway
    console.log(`🤖 Using HaluAI Gateway with model: ${defaultModel}`);
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
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getSummarySystemPrompt(language) },
                { role: "user", content: getSummaryUserPrompt(content, customInstructions) },
            ],
            max_tokens: 10000,
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
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<string> {
    const { client, model: aiModel } = getAIClient(customConfig);
    const useModel = customConfig?.customModel || model || aiModel;

    const response = await client.chat.completions.create({
        model: useModel,
        messages: [
            { role: "system", content: getKeyConceptsSystemPrompt(language) },
            { role: "user", content: getKeyConceptsUserPrompt(content) },
        ],
        max_tokens: 9000,
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
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<GlossaryTerm[]> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getGlossarySystemPrompt(language) },
                { role: "user", content: getGlossaryUserPrompt(content) },
            ],
            max_tokens: 9000,
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

// Helper function to fix truncated JSON (especially arrays)
function fixTruncatedJson(jsonStr: string): string {
    let fixed = jsonStr.trim();

    // Count brackets to detect truncation
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;

    // If imbalanced, try to fix
    if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
        // Remove trailing incomplete object/array entries
        // Common patterns: trailing comma, incomplete string, incomplete object
        fixed = fixed.replace(/,\s*"[^"]*$/, ''); // Remove incomplete key
        fixed = fixed.replace(/,\s*\{[^}]*$/, ''); // Remove incomplete object at end
        fixed = fixed.replace(/,\s*$/, ''); // Remove trailing comma

        // Close any unclosed brackets/braces
        const newOpenBrackets = (fixed.match(/\[/g) || []).length;
        const newCloseBrackets = (fixed.match(/]/g) || []).length;
        const newOpenBraces = (fixed.match(/{/g) || []).length;
        const newCloseBraces = (fixed.match(/}/g) || []).length;

        // Add missing closing brackets
        for (let i = 0; i < newOpenBrackets - newCloseBrackets; i++) {
            fixed += ']';
        }
        for (let i = 0; i < newOpenBraces - newCloseBraces; i++) {
            fixed += '}';
        }
    }

    return fixed;
}

// Generate quiz questions from the material
export async function generateQuiz(
    content: string,
    count: number = 10,
    model?: string,
    difficulty: "easy" | "medium" | "hard" = "medium",
    customInstructions?: string,
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<QuizQuestion[]> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        // Increase max_tokens to prevent truncation
        // Each question with options, hint, explanation needs ~500-700 tokens
        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getQuizSystemPrompt(count, difficulty, language) },
                { role: "user", content: getQuizUserPrompt(content, count, difficulty, customInstructions) },
            ],
            max_tokens: Math.max(8000, count * 700),
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return [];

            let jsonStr = jsonMatch[0];

            // Try parsing directly first
            try {
                const parsed = JSON.parse(jsonStr);
                return parsed.questions || [];
            } catch {
                // If direct parse fails, try to fix truncated JSON
                console.log("Attempting to fix truncated quiz JSON...");
                const fixedJson = fixTruncatedJson(jsonStr);
                const parsed = JSON.parse(fixedJson);
                const questions = parsed.questions || [];
                console.log(`Recovered ${questions.length} questions from truncated response`);
                return questions;
            }
        } catch (e) {
            console.error("Failed to parse quiz response:", e);
            return [];
        }
    } catch (error: any) {
        console.error("AI Quiz Error:", error);
        return [];
    }
}

// Flashcard interface
export interface Flashcard {
    front: string;
    back: string;
    category?: string;
}

// Generate flashcards from the material
export async function generateFlashcards(
    content: string,
    count: number = 10,
    model?: string,
    customConfig?: CustomAPIConfig,
    language: Language = "en"
): Promise<Flashcard[]> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getFlashcardSystemPrompt(count, language) },
                { role: "user", content: getFlashcardUserPrompt(content, count) },
            ],
            max_tokens: Math.min(3000, count * 200),
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.flashcards || [];
        } catch (e) {
            console.error("Failed to parse flashcards response:", e);
            return [];
        }
    } catch (error: any) {
        console.error("AI Flashcards Error:", error);
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
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;
        const contextLimit = maxContext || 6000;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content, contextLimit, language) },
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
    customConfig?: CustomAPIConfig,
    language: Language = "id"
): Promise<string> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;
        const contextLimit = maxContext || 6000;

        console.log(`🤖 Streaming with model: ${useModel}${customConfig?.customApiUrl ? ' (Custom API)' : ''}, context: ${contextLimit}, lang: ${language}`);

        const stream = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getChatSystemPrompt(content, contextLimit, language) },
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

// Check if content is safe (moderation)
export async function isContentSafe(
    content: string,
    customConfig?: CustomAPIConfig
): Promise<{ safe: boolean; reason?: string }> {
    try {
        const { client, model } = getAIClient(customConfig);

        // We use a strict system prompt to detect unsafe content
        const response = await client.chat.completions.create({
            model: "gemini-3-flash", // Use default model for moderation
            messages: [
                {
                    role: "system",
                    content: `You are a Content Safety Moderator. Your task is to analyze the user's text and determine if it contains ANY sexually explicit content, pornography, severe hate speech, or illegal acts. 
                    
                    If the content is SAFE, respond with strictly: "SAFE"
                    If the content is UNSAFE, respond with strictly: "UNSAFE: <reason>" (e.g. UNSAFE: Sexual content)
                    
                    The content is educational material, so biological/medical terms are allowed if in an educational context. Only flag explicit/NSFW content.`
                },
                {
                    role: "user",
                    content: `Analyze this content:\n\n${content.slice(0, 10000)}`
                },
            ],
            max_tokens: 50,
        });

        const result = response.choices[0]?.message?.content?.trim() || "SAFE";

        if (result.startsWith("UNSAFE")) {
            return { safe: false, reason: result.replace("UNSAFE:", "").trim() };
        }

        return { safe: true };
    } catch (error) {
        console.error("Moderation Check Failed:", error);
        // Fail open or closed? For safety, maybe warn but allow if system error, 
        // OR fail closed. Let's fail closed for safety.
        return { safe: false, reason: "Content moderation service unavailable." };
    }
}


// Mind Map interfaces
export interface MindMapNode {
    id: string;
    label: string;
    type?: string;
}

export interface MindMapEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

export interface MindMapData {
    nodes: MindMapNode[];
    edges: MindMapEdge[];
}

// Generate mind map from material content
export async function generateMindMap(
    content: string,
    model?: string,
    customConfig?: CustomAPIConfig,
    language: Language = "en"
): Promise<MindMapData> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        console.log("[generateMindMap] Using model:", useModel);
        console.log("[generateMindMap] Content length:", content?.length || 0);

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getMindMapSystemPrompt(language) },
                { role: "user", content: getMindMapUserPrompt(content) },
            ],
            max_tokens: 4000,
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            console.log("[generateMindMap] Raw response:", text.substring(0, 500));

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error("[generateMindMap] No JSON found in response");
                return { nodes: [], edges: [] };
            }

            const parsed = JSON.parse(jsonMatch[0]);
            console.log("[generateMindMap] Parsed nodes:", parsed.nodes?.length || 0, "edges:", parsed.edges?.length || 0);
            return parsed;
        } catch (e) {
            console.error("[generateMindMap] Failed to parse response:", e);
            return { nodes: [], edges: [] };
        }
    } catch (error: any) {
        console.error("[generateMindMap] AI Error:", error.message || error);
        throw error; // Re-throw to propagate the actual error
    }
}

// Study Plan interfaces
export interface StudyTask {
    day: number;
    task: string;
    description?: string;
    question?: string;      // Pre-generated verification question
    questionHint?: string;  // Hint for the question
}

export interface StudyPlanData {
    tasks: StudyTask[];
}

// Generate study plan from material content
export async function generateStudyPlan(
    content: string,
    model?: string,
    customConfig?: CustomAPIConfig,
    language: Language = "en",
    focus?: string
): Promise<StudyPlanData> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || model || aiModel;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                { role: "system", content: getStudyPlanSystemPrompt(language) },
                { role: "user", content: getStudyPlanUserPrompt(content, focus) },
            ],
            max_tokens: 4000,
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return { tasks: [] };

            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
        } catch (e) {
            console.error("Failed to parse study plan response:", e);
            return { tasks: [] };
        }
    } catch (error: any) {
        console.error("AI Study Plan Error:", error);
        return { tasks: [] };
    }
}

// Task Verification interfaces
export interface TaskQuestion {
    question: string;
    description?: string; // Additional explanation/hints for the question
    context?: string;
}

export interface TaskEvaluation {
    passed: boolean;
    score: number; // 0-100
    feedback: string;
    correctAnswer?: string;
}

// Generate an essay question for a study plan task
export async function generateTaskQuestion(
    task: string,
    taskDescription: string | undefined,
    materialContent: string,
    planTitle: string, // Added planTitle for context
    customConfig?: CustomAPIConfig,
    language: Language = "en"
): Promise<TaskQuestion> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || aiModel;

        const langName = language === "id" ? "Indonesian" : language === "en" ? "English" : language;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                {
                    role: "system",
                    content: `You are an educational assessment expert. Create ONE specific verification question.

CONTEXT:
- Main Topic: "${planTitle}"
- Task: "${task}"
${taskDescription ? `- Task Description: "${taskDescription}"` : ""}

RULES:
1. If Task Description exists, BASE YOUR QUESTION ON IT. Extract specific concepts mentioned (e.g., analogies, key terms, examples) and ask about those.
2. If Task is generic (Review, Summary, Quiz), ask about Main Topic concepts instead.
3. Question must be answerable in 2-4 sentences.
4. Respond in ${langName}.

OUTPUT (JSON only):
{"question": "Specific question here", "description": "What aspects to cover in the answer"}`
                },
                {
                    role: "user",
                    content: `Create a verification question.

TOPIC: ${planTitle}
TASK: ${task}
${taskDescription ? `DETAILS: ${taskDescription}` : ""}

MATERIAL EXCERPT:
${materialContent.slice(0, 2500)}

Generate a SPECIFIC question based on the task details above. Do not just repeat the task name.`
                }
            ],
            max_tokens: 500,
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            // Smart Fallback Helper
            const isGenericTask = /review|summary|recap|quiz|test|exam|ulangan|ringkasan/i.test(task);
            const fallbackSubject = isGenericTask ? planTitle : task;

            const fallbackResponse = {
                question: `Explain the key concepts you learned about "${fallbackSubject}".`,
                description: `Describe the main points in your own words.`,
            };

            if (!jsonMatch) {
                return fallbackResponse;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return {
                question: parsed.question || fallbackResponse.question,
                description: parsed.description || fallbackResponse.description,
            };
        } catch (e) {
            console.error("Failed to parse task question response:", e);
            const isGenericTask = /review|summary|recap|quiz|test|exam|ulangan|ringkasan/i.test(task);
            const fallbackSubject = isGenericTask ? planTitle : task;
            return {
                question: `Explain the key concepts you learned about "${fallbackSubject}".`,
                description: `Describe the main points in your own words.`,
            };
        }
    } catch (error: any) {
        console.error("AI Task Question Error:", error);
        const isGenericTask = /review|summary|recap|quiz|test|exam|ulangan|ringkasan/i.test(task);
        const fallbackSubject = isGenericTask ? planTitle : task;
        return {
            question: `Explain the key concepts you learned about "${fallbackSubject}".`,
            description: `Describe the main points in your own words.`,
        };
    }
}

// Evaluate user's answer to a task verification question
export async function evaluateTaskAnswer(
    task: string,
    question: string,
    userAnswer: string,
    materialContent: string,
    customConfig?: CustomAPIConfig,
    language: Language = "en"
): Promise<TaskEvaluation> {
    try {
        const { client, model: aiModel } = getAIClient(customConfig);
        const useModel = customConfig?.customModel || aiModel;

        const langName = language === "id" ? "Indonesian" : language === "en" ? "English" : language;

        const response = await client.chat.completions.create({
            model: useModel,
            messages: [
                {
                    role: "system",
                    content: `You are a SUPPORTIVE educational evaluator. Your goal is to ENCOURAGE learning, not to be strict.

EVALUATION APPROACH:
- Be GENEROUS with scoring - any sign of understanding should be rewarded
- Even partial answers show effort and should pass
- Focus on what the student GOT RIGHT, not what's missing

SCORING (BE LENIENT):
- 50-100: PASS - Student shows ANY understanding (even partial/basic)
- 0-49: FAIL - Only if answer is completely wrong or irrelevant

IMPORTANT RULES:
1. If student shows they tried and has some understanding → PASS (50+)
2. Only fail if answer shows zero effort or is totally off-topic
3. Always start feedback with something positive
4. Be warm and encouraging in ${langName}
5. Short, helpful feedback (2-3 sentences max)

Respond in JSON:
{"passed": true/false, "score": 0-100, "feedback": "Encouraging feedback", "correctAnswer": "Only if failed"}`
                },
                {
                    role: "user",
                    content: `Task: ${task}
Question: ${question}
Student's Answer: ${userAnswer}

Material (for reference):
${materialContent.slice(0, 3000)}

Evaluate generously. If they show any understanding, pass them.`
                }
            ],
            max_tokens: 500,
        });

        try {
            const text = response.choices[0]?.message?.content || "{}";
            console.log("🔍 Evaluation raw response:", text.slice(0, 500));

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error("❌ No JSON found in evaluation response");
                return {
                    passed: false,
                    score: 0,
                    feedback: "Could not evaluate your answer. Please try again.",
                };
            }

            const parsed = JSON.parse(jsonMatch[0]);
            console.log("✅ Evaluation parsed:", { passed: parsed.passed, score: parsed.score });

            return {
                passed: parsed.passed ?? false,
                score: parsed.score ?? 0,
                feedback: parsed.feedback || "No feedback available.",
                correctAnswer: parsed.correctAnswer,
            };
        } catch (e) {
            console.error("❌ Failed to parse evaluation response:", e);
            return {
                passed: false,
                score: 0,
                feedback: "An error occurred while evaluating. Please try again.",
            };
        }
    } catch (error: any) {
        console.error("❌ AI Evaluation Error:", error?.message || error);
        return {
            passed: false,
            score: 0,
            feedback: `Evaluation service is temporarily unavailable. Please try again later.`,
        };
    }
}

export default defaultAI;
