import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="no-print border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="font-serif text-xl font-bold text-emerald-950">
          Ledger<span className="text-amber-600">Finesse</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-semibold text-slate-600">
          <Link href="/#how-it-works" className="hidden hover:text-emerald-900 sm:inline">
            How it works
          </Link>
          <Link href="/#what-we-check" className="hidden hover:text-emerald-900 sm:inline">
            What we check
          </Link>
          <Link href="/audit" className="btn-primary">
            Start an audit
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 text-xs text-slate-500 sm:px-6 lg:px-8">
        LedgerFinesse compares your ledger to the lease terms you enter. It is not legal advice and does not replace a
        lawyer or your local tenant rights organization. Your lease and ledger stay in this browser.
      </div>
    </footer>
  );
}
