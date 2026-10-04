import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
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

  const systemPrompt = `You are the training-calendar copilot inside Seeded, a college tennis recruiting app. The player manages their recurring weekly training calendar through chat with you, in addition to adding sessions by hand.

Existing session types: ${typesSummary}
Current sessions on the weekly calendar:
${sessionsSummary}

Rules:
- Use "create" to add a new session, "update" to change an existing one (set sessionId to the id being changed, and fully restate every field — not just the changed ones), "delete" to remove one (set sessionId; other fields can just repeat the existing session's values).
- Prefer an existing typeId when it reasonably fits. Only invent a new one (short kebab-case id, plus a human typeLabel) when nothing fits.
- Times are 24-hour "HH:MM". Durations are in minutes. This is a recurring weekly plan, not tied to a specific calendar date — "day" is the only scheduling anchor.
- If a request is vague (e.g. "add a leg day"), make a reasonable default choice yourself rather than asking a clarifying question, and briefly mention the choice in your reply.
- If the message doesn't require any calendar change (a question, small talk, something unrelated), return an empty actions array and just reply.
- Keep the reply short — one or two sentences, friendly, no bullet lists or markdown.`;

  const messages: Anthropic.MessageParam[] = [
    ...body.history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: body.message },
  ];

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      messages,
      output_config: {
        format: zodOutputFormat(CopilotResponseSchema),
      },
    });

    if (!response.parsed_output) {
      return NextResponse.json({ error: "Couldn't understand that — try rephrasing." }, { status: 500 });
    }

    return NextResponse.json(response.parsed_output);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The copilot hit an error." },
      { status: 500 }
    );
  }
}
