"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

type DeviceId = "iphone15" | "iphoneSE";

interface Device {
  label: string;
  width: number;
  height: number;
  /** Outer black bezel thickness, in px. */
  bezel: number;
  /** Corner radius of the outer bezel. */
  bezelRadius: number;
  /** Corner radius of the inner screen (iframe). */
  screenRadius: number;
  /** iPhone 15 has a Dynamic Island; iPhone SE has neither notch nor island. */
  dynamicIsland: boolean;
}

const DEVICES: Record<DeviceId, Device> = {
  iphone15: {
    label: "iPhone 15 (393×852)",
    width: 393,
    height: 852,
    bezel: 14,
    bezelRadius: 62,
    screenRadius: 48,
    dynamicIsland: true,
  },
  iphoneSE: {
    label: "iPhone SE (375×667)",
    width: 375,
    height: 667,
    bezel: 20,
    bezelRadius: 34,
    screenRadius: 14,
    dynamicIsland: false,
  },
};

function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  // Allow pasting a full URL — only the path/query/hash actually gets used
  // in the iframe, same-origin only.
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
  } catch {
    // Not a parseable absolute URL — fall through and treat as a path.
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function PhonePreview() {
  const [device, setDevice] = useState<DeviceId>("iphone15");
  const [path, setPath] = useState("/");
  const [inputValue, setInputValue] = useState("/");

  const active = DEVICES[device];

  const loadPath = (raw: string) => {
    const next = normalizePath(raw);
    setPath(next);
    setInputValue(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    loadPath(inputValue);
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="mb-8 max-w-xl">
        <span className="eyebrow text-gold">Dev tool</span>
        <h1 className="display-serif mt-3 text-3xl text-ink">Phone preview</h1>
        <p className="mt-2 text-sm text-stone">
          Loads the app in an iframe at real device dimensions, for eyeballing layout —
          not a substitute for testing on an actual phone. Dev-only; this route 404s in
          production.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={onSubmit} className="flex flex-1 min-w-[260px] max-w-md gap-2">
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="/dashboard"
            className="h-10 w-full rounded-xl border-[0.5px] border-line bg-card px-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-xl bg-grass px-4 text-sm font-medium text-on-primary transition-colors hover:bg-grass-700"
          >
            Go
          </button>
        </form>

        <div className="flex items-center gap-1 rounded-xl border-[0.5px] border-line bg-card p-1">
          {(Object.keys(DEVICES) as DeviceId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setDevice(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                device === id
                  ? "bg-grass text-on-primary"
                  : "text-stone hover:text-ink"
              )}
            >
              {DEVICES[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 flex justify-center">
        <div
          className="relative bg-black shadow-lift"
          style={{
            width: active.width + active.bezel * 2,
            height: active.height + active.bezel * 2,
            borderRadius: active.bezelRadius,
            padding: active.bezel,
          }}
        >
          {active.dynamicIsland && (
            <div
              aria-hidden
              className="absolute left-1/2 top-[26px] z-10 h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black"
            />
          )}
          <div
            className="h-full w-full overflow-hidden bg-cream"
            style={{ borderRadius: active.screenRadius }}
          >
            <iframe
              key={device}
              title="Phone preview"
              src={path}
              width={active.width}
              height={active.height}
              style={{
                width: active.width,
                height: active.height,
                border: 0,
                display: "block",
              }}
            />
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-stone-light">
        Showing <span className="font-medium text-stone">{path}</span> at{" "}
        {active.width}×{active.height}
      </p>
    </div>
  );
}
