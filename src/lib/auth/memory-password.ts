import type { PasswordAuthProvider } from "@/lib/auth/password";

/**
 * DEVELOPMENT ONLY (LF_BACKEND=memory, refused outside SITE_ENV=development): password accounts in process
 * memory, salted PBKDF2-SHA-256. No email is sent: sign-up signs in at once and a reset is a no-op.
 */
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, key, 256);
  return hex(new Uint8Array(bits));
}

export class MemoryPasswordProvider implements PasswordAuthProvider {
  readonly users = new Map<string, { salt: string; hash: string }>();
  /** Email of the signed-in dev session, set by the runtime before updatePassword. */
  currentEmail: string | null = null;

  private async set(email: string, password: string) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    this.users.set(email, { salt, hash: await derive(password, salt) });
  }

  async signIn(email: string, password: string) {
    const user = this.users.get(email.toLowerCase());
    if (!user) return "invalid" as const;
    return (await derive(password, user.salt)) === user.hash ? ("ok" as const) : ("invalid" as const);
  }

  async signUp(email: string, password: string) {
    const key = email.toLowerCase();
    if (this.users.has(key)) return "confirm" as const;
    await this.set(key, password);
    return "signed_in" as const;
  }

  async sendReset() {}

  async updatePassword(password: string) {
    if (!this.currentEmail) return "error" as const;
    await this.set(this.currentEmail.toLowerCase(), password);
    return "ok" as const;
  }
}
