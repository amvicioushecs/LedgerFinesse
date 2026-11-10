"use client";

import { useState } from "react";

interface Labels {
  jurisdiction: string;
  ledgerTag: string;
  ledgerTitle: string;
  ledgerHint: string;
  leaseTag: string;
  leaseTitle: string;
  leaseHint: string;
  choose: string;
  ready: string;
  limits: string;
  run: string;
  running: string;
  missing: string;
  tenantLabel: string;
  landlordLabel: string;
  addressLabel: string;
}

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

function FileField({ name, tag, title, hint, choose, ready, onPick }: { name: string; tag: string; title: string; hint: string; choose: string; ready: string; onPick: (f: string | null) => void }) {
  const [file, setFile] = useState<string | null>(null);
  return (
    <label className={`block cursor-pointer rounded-lg border-2 border-dashed p-5 ${file ? "border-forest bg-mint" : "border-line bg-cream hover:border-forest"}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-muted">{tag}</span>
      <span className="mt-1 block font-bold">{title}</span>
      <span className="block text-sm text-muted">{hint}</span>
      <span className="btn btn-outline mt-3 text-sm">{file ? `✓ ${ready}: ${file}` : `📷 ${choose}`}</span>
      <input
        type="file"
        name={name}
        accept={ACCEPT}
        required
        className="sr-only"
        data-testid={`file-${name}`}
        onChange={(e) => {
          const name = e.currentTarget.files?.[0]?.name ?? null;
          setFile(name);
          onPick(name);
        }}
      />
    </label>
  );
}

export function UploadForm({ locale, labels, jurisdictions }: { locale: string; labels: Labels; jurisdictions: { key: string; label: string }[] }) {
  const [files, setFiles] = useState<{ ledger: string | null; lease: string | null }>({ ledger: null, lease: null });
  const [busy, setBusy] = useState(false);
  const ready = files.ledger !== null && files.lease !== null;
  return (
    <form action="/api/audits" method="post" encType="multipart/form-data" className="space-y-6" onSubmit={() => setBusy(true)}>
      <input type="hidden" name="locale" value={locale} />
      <fieldset>
        <legend className="text-sm font-bold">{labels.jurisdiction}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {jurisdictions.map((j, i) => (
            <label key={j.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-line p-3 text-sm font-semibold has-[:checked]:border-forest has-[:checked]:bg-mint">
              <input type="radio" name="jurisdiction" value={j.key} defaultChecked={i === 0} className="accent-[var(--color-forest)]" />
              {j.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <FileField name="ledger" tag={labels.ledgerTag} title={labels.ledgerTitle} hint={labels.ledgerHint} choose={labels.choose} ready={labels.ready} onPick={(f) => setFiles((s) => ({ ...s, ledger: f }))} />
        <FileField name="lease" tag={labels.leaseTag} title={labels.leaseTitle} hint={labels.leaseHint} choose={labels.choose} ready={labels.ready} onPick={(f) => setFiles((s) => ({ ...s, lease: f }))} />
      </div>
      <p className="text-xs text-muted">{labels.limits}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            ["tenantName", labels.tenantLabel, "name"],
            ["landlordName", labels.landlordLabel, "organization"],
            ["propertyAddress", labels.addressLabel, "street-address"],
          ] as const
        ).map(([name, label, auto]) => (
          <label key={name} className="block text-sm">
            <span className="font-semibold">{label}</span>
            <input name={name} maxLength={name === "propertyAddress" ? 500 : 200} autoComplete={auto} className="mt-1 block w-full rounded-md border border-line px-3 py-2.5 text-base" />
          </label>
        ))}
      </div>
      {!ready ? <p className="text-sm text-muted">{labels.missing}</p> : null}
      <button type="submit" className="btn btn-gold w-full sm:w-auto" disabled={busy} data-testid="run-scan">
        {busy ? labels.running : labels.run}
      </button>
    </form>
  );
}
