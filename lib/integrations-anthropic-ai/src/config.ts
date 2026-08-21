import Anthropic from "@anthropic-ai/sdk";

/**
 * Prefer Replit AI Integration credentials when present, otherwise the
 * standard ANTHROPIC_API_KEY used on Contabo / Docker.
 */
export function createAnthropicClient(): Anthropic {
  const apiKey =
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    "missing-anthropic-api-key";
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  return new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });
}
