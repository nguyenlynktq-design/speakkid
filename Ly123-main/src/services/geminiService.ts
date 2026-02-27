import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ImageGenerationResult {
  imageUrl: string;
  prompt: string;
  readingText: string;
}

export type EnglishLevel = "Starter" | "A1" | "A2" | "B1" | "B2";

export const generateContent = async (
  input: string,
  level: EnglishLevel,
  imageData?: string
): Promise<{ prompt: string; readingText: string }> => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are an expert educational content creator for English learners.
  Your task is to generate two things based on the user's input (topic/vocabulary/image):
  1. An image generation prompt for a children's book illustration (2D vector, vibrant, clean).
  2. A reading passage in English appropriate for the level: ${level}.
  
  Level Guidelines:
  - Starter: Very simple sentences (3-5 words), basic vocabulary (colors, animals, family), present simple only.
  - A1: Simple sentences, basic descriptions, daily activities, present simple and present continuous.
  - A2: Short paragraphs, connecting sentences with 'and', 'but', 'because', past simple, future with 'going to'.
  - B1: More complex descriptions, expressing opinions, using perfect tenses, relative clauses.
  - B2: Detailed descriptions, abstract topics, varied vocabulary, complex sentence structures.
  
  The reading passage should follow the structure of the examples provided:
  - Greeting (e.g., Hello everyone)
  - Introduction (Name, Age - make them up)
  - Description of the picture (bullet points or paragraph)
  - Closing (Thank you for listening)
  
  Output the result in JSON format with two keys: "prompt" and "readingText".
  The "prompt" should be in English, describing the visual scene.
  The "readingText" should be the educational passage.`;

  const parts: any[] = [{ text: `Topic: ${input}\nLevel: ${level}` }];
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(",")[1],
      },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { 
      systemInstruction,
      responseMimeType: "application/json"
    },
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      prompt: result.prompt || "",
      readingText: result.readingText || ""
    };
  } catch (e) {
    console.error("Failed to parse JSON response", e);
    return { prompt: "", readingText: "" };
  }
};

export const generateImage = async (
  prompt: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1"
): Promise<string> => {
  const model = "gemini-2.5-flash-image";
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio,
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image data returned from Gemini");
};
