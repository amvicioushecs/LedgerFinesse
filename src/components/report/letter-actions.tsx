"use client";

import { useState } from "react";

export function LetterActions({ text, copy, copied, print }: { text: string; copy: string; copied: string; print: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-forest"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }}
      >
        {done ? copied : copy}
      </button>
      <button type="button" className="btn btn-outline" onClick={() => window.print()}>
        {print}
      </button>
    </div>
  );
}
