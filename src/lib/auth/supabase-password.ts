import type { PasswordAuthProvider } from "@/lib/auth/password";

interface AuthError {
  code?: string;
  status?: number;
}
type Result = Promise<{ data: unknown; error: AuthError | null }>;

/** The slice of supabase.auth this uses (a cookie-bound server client, so a session lands in cookies). */
export interface SupabasePasswordClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Result;
    signUp(credentials: { email: string; password: string; options: { emailRedirectTo: string } }): Result;
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Result;
    updateUser(attributes: { password: string }): Result;
  };
}

const log = (msg: string, error: AuthError) => console.error(JSON.stringify({ msg, status: error.status, code: error.code }));

export class SupabasePasswordProvider implements PasswordAuthProvider {
  constructor(private readonly supabase: SupabasePasswordClient) {}

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (!error) return "ok" as const;
    if (error.code === "invalid_credentials") return "invalid" as const;
    if (error.code === "email_not_confirmed") return "unconfirmed" as const;
    log("password sign-in failed", error);
    return "error" as const;
  }

  async signUp(email: string, password: string, confirmRedirectTo: string) {
    const { data, error } = await this.supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirmRedirectTo } });
    if (error) {
      if (error.code === "weak_password") return "weak" as const;
      // Only seen with confirmations off; answer like a new sign-up so accounts aren't revealed.
      if (error.code === "user_already_exists" || error.code === "email_exists") return "confirm" as const;
      log("password sign-up failed", error);
      return "error" as const;
    }
    return (data as { session?: unknown } | null)?.session ? ("signed_in" as const) : ("confirm" as const);
  }

  async sendReset(email: string, redirectTo: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) log("password reset email failed", error);
  }

  async updatePassword(password: string) {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (!error) return "ok" as const;
    if (error.code === "weak_password" || error.code === "same_password") return "weak" as const;
    log("password update failed", error);
    return "error" as const;
  }
}
