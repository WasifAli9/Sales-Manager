import { Router, type IRouter, type Request, type Response } from "express";
import { buildDirectorSystem } from "../lib/director";
import { createDirectOpenAI } from "../lib/ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OPENAI_MODEL = "gpt-5";
const openai = createDirectOpenAI();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

router.post("/chat", async (req: Request, res: Response) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: ChatMessage[];
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  // Cap history to last 20 messages to avoid token bloat
  const recentHistory = (history as ChatMessage[]).slice(-20);

  let system: string;
  try {
    system = await buildDirectorSystem();
  } catch (err) {
    logger.error({ err }, "Failed to build director system prompt");
    res.status(500).json({ error: "Failed to load context" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
  } catch (err) {
    logger.error({ err }, "Director chat stream error");
    res.write(`data: ${JSON.stringify({ error: "AI response failed" })}\n\n`);
  }

  res.end();
});

export default router;
