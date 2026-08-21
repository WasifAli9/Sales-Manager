---
name: GPT image model selection
description: Which OpenAI image model to use and how — proxy vs direct client, response format, quality values.
---

## Rule
Use `imageOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` directly for all image generation and vision analysis. Never use the `@workspace/integrations-openai-ai-server` proxy for image calls.

**Why:** `@workspace/integrations-openai-ai-server` is for chat/text. Image models need a direct `OPENAI_API_KEY` client.

## Available image models (confirmed August 2026)
- `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`, `chatgpt-image-latest` — present on this account
- `dall-e-3`, `dall-e-2` — NOT available on this account (likely deprecated for newer-tier accounts)

## gpt-image-1 specifics
- Quality values: `"low"`, `"medium"`, `"high"`, `"auto"` — NOT `"standard"` or `"hd"` (those are dall-e-3 values)
- Response format: `b64_json` in `result.data[0].b64_json` — no URL returned
- Must convert to buffer: `Buffer.from(b64, "base64")` then store with `storeImageFromBuffer()`

## Vision analysis (gpt-4o)
- Use `imageOpenAI.chat.completions.create` with `model: "gpt-4o"` for vision
- Image passed as `{ type: "image_url", image_url: { url: "data:<mime>;base64,<b64>", detail: "low" } }`
