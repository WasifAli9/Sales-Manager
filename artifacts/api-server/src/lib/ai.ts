import OpenAI from "openai";

const OPENAI_MODEL = "gpt-5";

/** Construct without throwing when OPENAI_API_KEY is unset (local/dev). */
export function createDirectOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim() || "missing-openai-api-key",
  });
}

const openai = createDirectOpenAI();

/**
 * Run a single LLM call and parse the response as strict JSON.
 * Uses the caller's OPENAI_API_KEY secret directly via the official SDK.
 * Returns the parsed JSON and the model identifier used.
 */
export async function runJson(
  system: string,
  user: string,
): Promise<{ json: unknown; modelUsed: string }> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return { json: parseJsonLoose(text), modelUsed: OPENAI_MODEL };
}

/** Parse model output as JSON, tolerating markdown fences or stray prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown fences
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }
    // Last resort: first { ... } or [ ... ] span
    const start = Math.min(
      ...["{", "["].map((c) => {
        const i = trimmed.indexOf(c);
        return i === -1 ? Infinity : i;
      }),
    );
    if (start !== Infinity) {
      const open = trimmed[start];
      const close = open === "{" ? "}" : "]";
      const end = trimmed.lastIndexOf(close);
      if (end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
    }
    throw new Error("Model did not return valid JSON");
  }
}
