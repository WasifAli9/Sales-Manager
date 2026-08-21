import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// POST /api/leads/extract-from-image
// Accepts a base64-encoded image, runs it through GPT vision, and returns
// extracted contact fields ready to pre-fill the Add Lead form.
router.post("/leads/extract-from-image", async (req: Request, res: Response) => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const safeType = (mimeType ?? "image/png").startsWith("image/") ? mimeType : "image/png";
  const dataUrl = `data:${safeType};base64,${imageBase64}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content:
            "You are a contact-extraction assistant. The user will provide a screenshot (e.g. from LinkedIn, a business card, an email signature, or any source). Extract every contact detail you can find and return ONLY a JSON object with these exact keys — leave a key as an empty string if the field is not visible:\n\n" +
            '{"firstName":"","lastName":"","email":"","phone":"","linkedinUrl":"","company":"","title":""}' +
            "\n\nRules:\n- firstName / lastName: split a full name appropriately\n- email: full address if shown\n- phone: full number including country code if present\n- linkedinUrl: full linkedin.com URL if visible, or reconstruct from a profile slug shown on screen\n- company: current employer or organisation\n- title: current job title or role\n- Return ONLY the JSON, no markdown fences, no extra text.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Attempt to salvage JSON from within the string
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const result = {
      firstName: parsed.firstName ?? "",
      lastName: parsed.lastName ?? "",
      email: parsed.email ?? "",
      phone: parsed.phone ?? "",
      linkedinUrl: parsed.linkedinUrl ?? "",
      company: parsed.company ?? "",
      title: parsed.title ?? "",
    };

    res.json(result);
  } catch (err) {
    console.error("Image extraction error:", err);
    res.status(500).json({ error: "Failed to extract contact info from image" });
  }
});

export default router;
