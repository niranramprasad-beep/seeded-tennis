"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { TrainingPlannerSession, TrainingSessionType } from "@/lib/supabase/training";

export interface CopilotAction {
  action: "create" | "update" | "delete";
  sessionId: string | null;
  day: TrainingPlannerSession["day"];
  startTime: string;
  duration: number;
  typeId: string;
  typeLabel: string;
  title: string;
  intensity: TrainingPlannerSession["intensity"];
  notes: string;
  goals: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token;
}

export function TrainingCopilot({
  sessions,
  sessionTypes,
  onActions,
}: {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  onActions: (actions: CopilotAction[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setError("");
    const nextHistory = [...messages, { role: "user" as const, content: message }];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const token = await getAccessToken();
      const res = await fetch("/api/training/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message,
          history: messages,
          sessions: sessions.map((s) => ({
            id: s.id,
            title: s.title,
            typeLabel: getTypeLabel(sessionTypes, s.typeId),
            day: s.day,
            startTime: s.startTime,
            duration: s.duration,
            intensity: s.intensity,
          })),
          sessionTypes: sessionTypes.map((t) => ({ id: t.id, label: t.label })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "The copilot hit an error.");

      setMessages([...nextHistory, { role: "assistant", content: payload.reply }]);
      if (Array.isArray(payload.actions) && payload.actions.length > 0) {
        onActions(payload.actions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The copilot hit an error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-[520px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-[24px] border-[0.5px] border-line bg-card shadow-lift"
          >
            <div className="flex items-center gap-2 border-b-[0.5px] border-line bg-grass px-5 py-4 text-cream">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-medium">Training copilot</p>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg p-1 text-cream/80 transition-colors hover:bg-cream/15 hover:text-cream"
                aria-label="Close copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <p className="rounded-2xl bg-grass-50 px-3.5 py-3 text-sm leading-relaxed text-stone">
                  Tell me what to change — "add a 90 minute serve session Thursday at 4pm" or "move my
                  Saturday match prep to Sunday morning."
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-grass text-cream"
                      : "bg-grass-50 text-ink"
                  )}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 rounded-2xl bg-grass-50 px-3.5 py-2.5 text-sm text-stone">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              )}
              {error && (
                <p className="rounded-2xl bg-[#FBEAE5] px-3.5 py-2.5 text-sm text-[#9C3B22]">{error}</p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t-[0.5px] border-line p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask the copilot to add or change a session..."
                className="h-11 flex-1 rounded-xl border-[0.5px] border-line bg-cream/40 px-3.5 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-grass text-cream transition-opacity disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-grass text-cream shadow-lift transition-colors hover:bg-grass-900"
        aria-label={open ? "Close training copilot" : "Open training copilot"}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: -45 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 45 }}
            transition={{ duration: 0.15 }}
          >
            {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

function getTypeLabel(types: TrainingSessionType[], id: string): string {
  return types.find((t) => t.id === id)?.label ?? id;
}
