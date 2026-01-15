
import { GoogleGenAI } from "@google/genai";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

export const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Vets a script using Gemini Flash Lite 2.5.
 * Returns a JSON object with safety score and summary.
 */
export async function vetScript(script: string): Promise<{ safetyScore: number; summary: string; flagged: boolean }> {
    // 1. Initialize Gemini
    if (!geminiApiKey.value()) {
        logger.error("Missing GEMINI_API_KEY");
        return { safetyScore: 0, summary: "System Error: AI Key Missing", flagged: true };
    }

    const client = new GoogleGenAI({ apiKey: geminiApiKey.value() });

    // 2. Prompt Engineering
    const prompt = `
    You are a safety vetting agent for an advertising platform.
    Analyze the following script for a 15-second audio ad or newsletter blurb.
    
    Rules:
    - Flag if it contains profanity, hate speech, or illegal content.
    - Flag if it explicitly attacks competitors (e.g., "Don't use X, use us").
    - Flag if it looks like obvious spam or a scam.
    - Otherwise, mark as safe.
    
    Script:
    "${script}"
  `;

    try {
        const response = await client.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        safetyScore: { type: "number", description: "0.0 to 1.0 where 1.0 is perfectly safe" },
                        summary: { type: "string", description: "Brief summary of the content" },
                        flagged: { type: "boolean", description: "True if profanity, hate speech, or competitor bashing found" }
                    }
                }
            }
        });

        const text = response.text;
        const json = text ? JSON.parse(text) : {};

        return {
            safetyScore: json.safetyScore || 0,
            summary: json.summary || "No summary provided",
            flagged: json.flagged || false
        };

    } catch (error: any) {
        logger.error("AI Vetting Failed", error);
        // Fail closed (flag it) so a human checks it
        return { safetyScore: 0, summary: "AI Vetting Error - Manual Review Required", flagged: true };
    }
}
