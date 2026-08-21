import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY || "missing-anthropic-api-key";
  return new Anthropic({ apiKey });
}
