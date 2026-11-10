import Link from "next/link";

export function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="tap-target gap-2.5 px-0">
      <span className="grid size-8 place-items-center rounded-md bg-forest text-sm font-bold text-white" aria-hidden>
        LF
      </span>
      <span className="font-display text-xl font-bold text-ink">LedgerFinesse</span>
    </Link>
  );
}
