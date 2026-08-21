import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { runJson } from "../lib/ai";

const router: IRouter = Router();

const HUMAN_WRITER_SYSTEM = `You are a world-class B2B sales copywriter. Your messages have generated millions in pipeline. You write outreach that feels like it came from a real person who genuinely did their homework — not from a tool, a template farm, or an AI.

Your non-negotiable rules:
- Short sentences. Two lines max per thought. White space is your friend.
- No corporate speak. Never write: "I hope this finds you well", "I wanted to reach out", "touch base", "synergy", "leverage", "game-changer", "I'm excited to", "following up", "per my last", "circle back", "deep dive", "at your earliest convenience", or any variation of these.
- Open with the problem or observation — show you understand THEIR world before mentioning yourself.
- Lead to ONE clear action point. Casual ask, not a sales pitch. Like asking a smart friend for a coffee.
- Deliver value or spark genuine curiosity. Make them feel something.
- No bullet points in the message body. Prose only.
- Write like you're texting a sharp professional who you respect. Peer to peer.
- Conversational contractions: "don't", "it's", "you're", "I've", "can't". Not formal.
- 80–130 words for emails and LinkedIn messages. Sharp, not exhaustive.
- Connection request notes: STRICT 300 character maximum. One or two punchy sentences.
- The goal: they read it and think "huh, this person gets it" — not "another sales email".

Return ONLY strict JSON matching the schema requested.`;

const Body = z.object({
  type: z.enum(["email", "linkedin_message", "linkedin_connection"]),
  context: z.string().min(5),
  productContext: z.string().optional(),
});

router.post("/generate-template", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { type, context, productContext } = parsed.data;

  const schemaDesc = type === "email"
    ? `{"subject": "compelling subject line under 10 words", "body": "the full email body, 80-130 words, plain text"}`
    : type === "linkedin_connection"
    ? `{"body": "connection request note, STRICT max 300 characters, warm and specific"}`
    : `{"body": "LinkedIn direct message body, 80-130 words, plain text"}`;

  const prompt = `Write a ${type === "email" ? "cold outreach email" : type === "linkedin_connection" ? "LinkedIn connection request note" : "LinkedIn direct message"}.

Purpose / context the sender provided:
${context.trim()}
${productContext ? `\nProduct / what they sell:\n${productContext.trim()}` : ""}

Constraints:
${type === "linkedin_connection" ? "- MUST be under 300 characters total — count carefully.\n" : ""}- Sound like a real human. Peer to peer.
- Open with the problem or a sharp observation. No fluff opener.
- One casual call to action at the end.
- No corporate speak or AI tells.

Return ONLY this JSON (no markdown, no explanation):
${schemaDesc}`;

  try {
    const { json } = await runJson(HUMAN_WRITER_SYSTEM, prompt);
    if (!json || typeof json !== "object") throw new Error("Bad AI response");
    res.json(json);
  } catch (err) {
    req.log?.error({ err }, "Template generation failed");
    res.status(500).json({ error: "Generation failed — please try again" });
  }
});

export default router;
