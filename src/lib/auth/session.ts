import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "manicepte_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 gün

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET tanımlı değil veya çok kısa. .env.local içinde en az 16 karakterlik bir değer tanımlayın.",
    );
  }
  return secret;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export interface SessionPayload {
  email: string;
  iat: number;
}

export function createSessionToken(email: string): string {
  const payload: SessionPayload = { email, iat: Date.now() };
  const encoded = base64url(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(encoded)) as SessionPayload;
    const ageSeconds = (Date.now() - payload.iat) / 1000;
    if (ageSeconds > SESSION_MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(email: string): Promise<void> {
  const token = createSessionToken(email);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
