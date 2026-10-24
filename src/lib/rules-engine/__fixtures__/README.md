# Rules-engine fixtures

Known-answer fixtures for `src/lib/rules-engine/fixtures.test.ts`.

- One folder per jurisdiction, one sub-folder per case, each with `extraction.json`, `rules.json`, `expected.json`.
- `expected.json` is written by a human from the fixture (and, for real jurisdictions, the statute text). Never generate it by running the engine.
- `zz-testville/` is a **fictional** jurisdiction (state `ZZ`, city `Testville`) for engine mechanics. Its citations and URLs are placeholders, not real law.
- Real jurisdictions (e.g. `il-chicago/`) are added only with rules that have been verified against the official source (citation, source URL, verifier, date). Do not add real statute text or citations here until then.
