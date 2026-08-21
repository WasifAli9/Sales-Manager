import OpenAI from "openai";

/**
 * Prefer Replit AI Integration credentials when present, otherwise the
 * standard OPENAI_API_KEY used on Contabo / Docker.
 */
export function createOpenAIClient(): OpenAI {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "missing-openai-api-key";
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  return new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
}
