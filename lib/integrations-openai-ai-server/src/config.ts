import OpenAI from "openai";

export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || "missing-openai-api-key";
  return new OpenAI({ apiKey });
}
