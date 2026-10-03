import { WhopClient } from "@whop/sdk";

// Null when WHOP_API_KEY isn't set yet, matching the rest of the app's
// pattern of degrading gracefully instead of crashing without optional keys.
let client: WhopClient | null = null;

export function getWhop(): WhopClient | null {
  const token = process.env.WHOP_API_KEY;
  if (!token) return null;
  if (!client) {
    client = new WhopClient({ token });
  }
  return client;
}

export const WHOP_PLAN_IDS = {
  player: process.env.WHOP_PLAN_PLAYER,
  family: process.env.WHOP_PLAN_FAMILY,
} as const;
