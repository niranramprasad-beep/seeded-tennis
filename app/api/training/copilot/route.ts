import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getAuthedUser } from "@/lib/api-auth";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const ActionSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  sessionId: z
    .string()
    .nullable()
    .describe("The existing session id to update or delete. Null when creating a new session."),
  day: z.enum(WEEKDAYS),
  startTime: z.string().describe('24-hour time, e.g. "16:30".'),
  duration: z.number().describe("Session length in minutes."),
  typeId: z
    .string()
    .describe("One of the existing session type ids if it reasonably fits, otherwise a new short kebab-case id."),
  typeLabel: z.string().describe("Human-readable label for typeId, used only if typeId is new."),
  title: z.string(),
  intensity: z.enum(["low", "moderate", "high"]),
  notes: z.string(),
  goals: z.string(),
});

const CopilotResponseSchema = z.object({
  reply: z.string().describe("A short, friendly reply to show in the chat. One or two sentences."),
  actions: z.array(ActionSchema),
});

// Plain JSON Schema mirror of CopilotResponseSchema above — Gemini's
// responseJsonSchema takes a raw schema object, not a Zod instance.
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "A short, friendly reply to show in the chat. One or two sentences.",
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "delete"] },
          sessionId: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "The existing session id to update or delete. Null when creating a new session.",
          },
          day: { type: "string", enum: WEEKDAYS as unknown as string[] },
          startTime: { type: "string", description: '24-hour time, e.g. "16:30".' },
          duration: { type: "number", description: "Session length in minutes." },
          typeId: {
            type: "string",
            description: "One of the existing session type ids if it reasonably fits, otherwise a new short kebab-case id.",
          },
          typeLabel: { type: "string", description: "Human-readable label for typeId, used only if typeId is new." },
          title: { type: "string" },
          intensity: { type: "string", enum: ["low", "moderate", "high"] },
          notes: { type: "string" },
          goals: { type: "string" },
        },
        required: [
          "action",
          "sessionId",
          "day",
          "startTime",
          "duration",
          "typeId",
          "typeLabel",
          "title",
          "intensity",
          "notes",
          "goals",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
};

interface CopilotRequestBody {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessions: Array<{
    id: string;
    title: string;
    typeLabel: string;
    day: string;
    startTime: string;
    duration: number;
    intensity: string;
  }>;
  sessionTypes: Array<{ id: string; label: string }>;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The training copilot isn't configured yet." }, { status: 500 });
  }

  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await req.json()) as CopilotRequestBody;
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  const sessionsSummary = body.sessions.length
    ? body.sessions
        .map(
          (s) =>
            `- id=${s.id} | ${s.day} ${s.startTime} (${s.duration}m) | ${s.typeLabel} | "${s.title}" | intensity=${s.intensity}`
        )
        .join("\n")
    : "(no sessions yet)";
  const typesSummary = body.sessionTypes.map((t) => `${t.id} (${t.label})`).join(", ") || "(none yet)";

  const systemInstruction = `You are the training-calendar copilot inside Seeded, a college tennis recruiting app. The player manages their recurring weekly training calendar through chat with you, in addition to adding sessions by hand.

Existing session types: ${typesSummary}
Current sessions on the weekly calendar:
${sessionsSummary}

Rules:
- Use "create" to add a new session, "update" to change an existing one (set sessionId to the id being changed, and fully restate every field — not just the changed ones), "delete" to remove one (set sessionId; other fields can just repeat the existing session's values).
- Prefer an existing typeId when it reasonably fits. Only invent a new one (short kebab-case id, plus a human typeLabel) when nothing fits.
- Times are 24-hour "HH:MM". Durations are in minutes. This is a recurring weekly plan, not tied to a specific calendar date — "day" is the only scheduling anchor.
- If a request is vague (e.g. "add a leg day"), make a reasonable default choice yourself rather than asking a clarifying question, and briefly mention the choice in your reply.
- If the message doesn't require any calendar change (a question, small talk, something unrelated), return an empty actions array and just reply.
- Keep the reply short — one or two sentences, friendly, no bullet lists or markdown.
- Respond with JSON only, matching the provided schema exactly.`;

  const contents = [
    ...body.history.slice(-10).map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: body.message }] },
  ];

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: "gemini-flash-latest",
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw) {
      return NextResponse.json({ error: "Couldn't understand that — try rephrasing." }, { status: 500 });
    }

    const parsed = CopilotResponseSchema.parse(JSON.parse(raw));
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The copilot hit an error." },
      { status: 500 }
    );
  }
}
