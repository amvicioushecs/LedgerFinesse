# LedgerFinesse — Development Server Recovery & Audit Suite Plan

Restore the live preview environment for **LedgerFinesse** by provisioning the missing workspace dependency tree and restarting the Vite development server on port 3000, ensuring seamless access to both the editorial landing page and the side-by-side rent ledger and lease audit workspace.

## User Review & Critical Decisions

> [!IMPORTANT]
> Workspace inspection confirmed that the local dependency directory (`node_modules`) is currently unpopulated and no active development server process is running. No product requirements are ambiguous, so this plan proceeds directly to restoring the runtime environment without altering your existing application features or design.

- **Runtime Recovery Strategy**: Install all declared project dependencies, verify the TypeScript and Vite bundle compilation, and launch a fresh development server bound to `0.0.0.0:3000`.
- **Feature & Design Preservation**: Maintain 100% of the existing **LedgerFinesse** editorial landing page (including the clean hero headline without the underline and the streamlined header navigation) and the synchronized side-by-side comparison workspace.

---

## 1. Overview & Core Concept

- **What It Does**: **LedgerFinesse** empowers residential tenants to audit historical rent ledgers side-by-side against their signed lease agreements, automatically flagging uncontracted junk fees, premature late penalties during grace periods, excessive late fee caps, duplicate utility billings, premature rent hikes, and running-balance arithmetic drift.
- **Target Audience / Persona**: Renters, tenant advocates, and housing counselors reviewing portal ledger statements against residential lease clauses.
- **Key Value**: Transforms opaque landlord accounting portals into a transparent, cross-referenced forensic audit with one-click formal dispute and reconciliation demand letter generation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Editorial Landing Experience**: Visitors arrive on the **LedgerFinesse** overview featuring an interactive live sample scan where clicking questionable ledger charges immediately highlights the governing lease clause and explains the violation.
  2. **Pre-Loaded & Custom Case Launch**: Users can launch directly into the side-by-side workspace using three realistic preset cases (Austin High-Rise stealth fees, Denver premature rent hike & grace period breach, Seattle arithmetic balance drift) or upload/paste custom CSV ledger rows and lease terms.
  3. **Synchronized Side-by-Side Comparison**: Clicking any ledger transaction highlights and scrolls to its governing lease clause on the right; clicking any lease clause highlights all mapped ledger lines on the left and displays compliance totals.
  4. **Self-Advocacy & Export**: Users can filter by discrepancy category, add or remove manual ledger entries, adjust lease baseline parameters in real time, export the audited ledger to CSV, and generate a formal dispute demand letter ready to copy, download, or print.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-trust editorial and forensic financial clarity.
  - *Color Palette & Mood*: Crisp paper white (`#FFFFFF`) and soft slate (`#F8FAFC`) surfaces anchored by deep forest green (`#052E16` / `#064E3B`), warm amber accents (`#F59E0B`), and semantic status indicators—emerald (`#16A34A`) for compliant charges, amber (`#D97706`) for warnings/math drift, and crimson (`#E11D48`) for disputed violations.
  - *Typography & Hierarchy*: **Newsreader** serif for authoritative editorial headlines and legal contract excerpts, **Plus Jakarta Sans** for crisp UI controls and scannable descriptions, and **IBM Plex Mono** (`tabular-nums`) for all financial figures, dates, and running-balance columns.
  - *Component Styling & Layout*: Single-elevation flat surfaces with 1px hairline borders, responsive 50/50 split-pane desktop workspace (1440px baseline), and tabbed mobile switching.
- **Interactive Feedback & Motion**: Smooth scroll-into-view synchronization across split panes, active cross-reference inspection ribbon, and instant reactive re-auditing when parameters or rows change.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Deterministic Client-Side Forensic Audit Engine**
  - *Chosen Approach*: Execute line-by-line math verification, grace-period timing checks, fee-cap comparisons, and duplicate detection synchronously in the browser via a deterministic rule engine.
  - *Why*: Guarantees zero-latency recalculation as users edit lease parameters or add ledger rows, with complete privacy and zero dependency on external network calls.
  - *Alternatives Considered*: Server-only batch processing was passed over because it introduces network latency during interactive clause tweaking.
- **Decision 2: Dependency Installation & Dev Server Lifecycle**
  - *Chosen Approach*: Populate the dependency tree using the platform dependency installer, validate the production build and TypeScript types, and trigger a clean development server restart on port 3000.
  - *Why*: Directly resolves the missing runtime binaries (`vite`) that prevented the preview server from starting.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Vite Dev Server (Port 3000 / SPA)                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Application Root & State Controller                   │
│   • Active View Mode (Landing Overview vs. Side-by-Side Workspace)       │
│   • Active Preset Case, Lease Agreement State & Raw Ledger Store         │
│   • Synchronized Selection State (Selected Entry ID ↔ Active Clause ID)  │
└───────────────┬──────────────────────────────────────────┬───────────────┘
                │                                          │
                ▼                                          ▼
┌───────────────────────────────┐          ┌───────────────────────────────┐
│    Editorial Landing View     │          │  Forensic Audit Rule Engine   │
│ • Interactive Hero Scan Sheet │          │ • Running Math Verification   │
│ • 3-Step Workflow & 6 Checks  │          │ • Grace Period & Cap Checks   │
│ • FTC/Census Evidence Banner  │          │ • Unauthorized & Dup Scanner  │
│ • Case Study Quick-Launchers  │          └───────────────┬───────────────┘
└───────────────────────────────┘                          │
                                                           ▼
                                           ┌───────────────────────────────┐
                                           │  Side-by-Side Audit Workspace │
                                           ├───────────────┬───────────────┤
                                           │  Ledger Pane  │  Lease Pane   │
                                           │ • Chron Table │ • Clause Cards│
                                           │ • Math Drift  │ • Full Text   │
                                           │ • Flag Alerts │ • Term Editor │
                                           └───────┬───────┴───────┬───────┘
                                                   │               │
                                                   ▼               ▼
                                           ┌───────────────────────────────┐
                                           │   Action & Export Modals      │
                                           │ • Formal Dispute Letter Draft │
                                           │ • CSV & Lease Text Importer   │
                                           │ • Manual Entry Creator        │
                                           └───────────────────────────────┘
```

- **Data Model & State**:
  - **LeaseAgreement & LeaseClause**: Stores property metadata, monthly base rent, due day, grace period days, maximum late fee cap, authorized utilities/add-ons, and indexed contract clauses with full legal text.
  - **LedgerEntry & Discrepancy**: Represents chronological charges, payments, and credits alongside reported balances, mathematically computed balances, balance drift deltas, mapped clause IDs, and structured discrepancy findings.
- **Interactive Component & State Mapping**:
  - **Dev Server Initialization**: Installing dependencies provisions the local Vite binary and React/Tailwind plugins; restarting the dev server binds the application to port 3000.
  - **Cross-Reference Selection (`handleSelectEntry` / `handleSelectClause`)**: Selecting a ledger row sets `selectedEntryId`, resolves its `mappedClauseId` or `discrepancy.leaseClauseId`, activates the synchronized inspection banner, and smoothly scrolls the right-hand Lease Pane to the target clause card.
  - **Live Parameter & Row Mutation (`handleUpdateLeaseTerms` / `handleAddEntry` / `handleImportLedger`)**: Mutating lease terms or importing CSV rows immediately triggers `runFullAudit`, recomputing all discrepancy totals, category counters, and the formal dispute letter draft.
