import { NextResponse } from "next/server";
import type { MatchAnalysis } from "@/lib/supabase/features";

export async function POST(request: Request) {
  const body = await request.json();
  const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallbackAnalysis(body), { status: 200 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a precise junior tennis development analyst. Return strict JSON with summary, takeaways, drills, nextWeekFocus. Keep feedback specific and practical.",
          },
          {
            role: "user",
            content: JSON.stringify(body),
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return NextResponse.json({
      summary: parsed.summary ?? "Match analysis complete.",
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 4) : [],
      drills: Array.isArray(parsed.drills) ? parsed.drills.slice(0, 5) : [],
      nextWeekFocus: parsed.nextWeekFocus ?? "Build one repeatable pattern for pressure points.",
      source: "ai",
    } satisfies MatchAnalysis);
  } catch {
    return NextResponse.json(fallbackAnalysis(body), { status: 200 });
  }
}

function fallbackAnalysis(body: any): MatchAnalysis {
  const match = body?.match ?? {};
  const needsWork = String(match.needsWork || match.notes || "serve and first-ball patterns");
  return {
    summary: "Saved a practical analysis from your match notes.",
    takeaways: [
      match.result === "win"
        ? "Protect the pattern that won points instead of changing too early."
        : "Stabilize the first four shots before chasing winners.",
      needsWork,
    ],
    drills: [
      `20 minutes targeted reps on ${needsWork.split(/[,.]/)[0] || "the weakest pattern"}.`,
      "Serve plus one: call target, serve, then play cross-court with margin.",
      "Pressure game: start every point at 30-all and track first-ball errors.",
    ],
    nextWeekFocus: needsWork,
    source: "fallback",
  };
}
