import type { Platform } from "./types.ts";
import { bridgePlatform, type PreviewBridge } from "./bridge.ts";

let current: Platform | null = null;

export async function loadPlatform(): Promise<Platform> {
  if (current) return current;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __creatorBridge?: PreviewBridge };
  if (w.__TAURI_INTERNALS__) {
    const m = await import("./tauri.ts");
    current = m.tauriPlatform;
  } else if (w.__creatorBridge) {
    current = bridgePlatform(w.__creatorBridge);
  } else {
    throw new Error("CREATOR.EXE must be opened as the installed Windows app. A plain browser cannot reach its database.");
  }
  return current;
}

export function platform(): Platform {
  if (!current) throw new Error("Platform not loaded yet");
  return current;
}

export function setPlatformForTests(p: Platform): void {
  current = p;
}
