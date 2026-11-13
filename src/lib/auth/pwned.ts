/**
 * Leaked-password check (Have I Been Pwned, k-anonymity): only the first 5 hex characters of the SHA-1 leave the
 * server, with response padding on. Fails open: if the service is unreachable the password is not refused.
 */
export async function isLeakedPassword(password: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
    const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const response = await fetcher(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "LedgerFinesse" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const suffix = hex.slice(5);
    return (await response.text()).split(/\r?\n/).some((line) => {
      const [hash, count] = line.trim().split(":");
      return hash === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.error(JSON.stringify({ msg: "leaked-password check unavailable", error: String(error) }));
    return false;
  }
}
