import { useState, useCallback } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function post(path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

// ── Registration ───────────────────────────────────────────────────────────────

export function usePasskeyRegistration() {
  const [state, setState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const options = await post("/webauthn/register/options");
      const attResp = await startRegistration({ optionsJSON: options });
      await post("/webauthn/register/verify", attResp);
      setState("success");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      // User cancelled is not a real error
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        setState("idle");
      } else {
        setError(msg);
        setState("error");
      }
      return false;
    }
  }, []);

  return { register, state, error };
}

// ── Authentication ─────────────────────────────────────────────────────────────

export interface BiometricAuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

export async function attemptBiometricLogin(): Promise<BiometricAuthResult> {
  if (!browserSupportsWebAuthn()) return { success: false };

  const optionsJson = await post("/webauthn/authenticate/options");
  const { _key, ...options } = optionsJson;

  try {
    const assertionResp = await startAuthentication({ optionsJSON: options });
    const result = await post("/webauthn/authenticate/verify", {
      ...assertionResp,
      _key,
    });
    return { success: result.verified === true, user: result.user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Cancelled or no credential — not a real error
    if (
      msg.toLowerCase().includes("cancel") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("not allowed") ||
      msg.toLowerCase().includes("no credentials")
    ) {
      return { success: false };
    }
    throw err;
  }
}

// ── Credential management ──────────────────────────────────────────────────────

export interface StoredCredential {
  id: number;
  deviceType: string | null;
  backedUp: boolean | null;
  createdAt: string;
}

export async function listCredentials(): Promise<StoredCredential[]> {
  const data = await get("/webauthn/credentials");
  return (data as { credentials: StoredCredential[] }).credentials;
}

export async function deleteCredential(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/webauthn/credentials/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Delete failed");
}
