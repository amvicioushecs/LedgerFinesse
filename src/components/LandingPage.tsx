import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileText, 
  Scale, 
  Sparkles, 
  ExternalLink, 
  Clock, 
  Calculator, 
  Building2, 
  ChevronRight,
  Upload,
  Download,
  Mail
} from 'lucide-react';
import { PresetCase } from '../types';
import { SAMPLE_CASES } from '../data/sampleCases';

interface LandingPageProps {
  onOpenWorkspace: () => void;
  onSelectCaseAndOpen: (preset: PresetCase) => void;
  onOpenImport: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenWorkspace,
  onSelectCaseAndOpen,
  onOpenImport
}) => {
  // Interactive sample highlight state in hero
  const [activeSampleIndex, setActiveSampleIndex] = useState<number>(0);

  const sampleCharges = [
    {
      title: 'Resident Tech Portal Fee',
      date: 'Jan 1 · Recurring',
      amount: '$18.00',
      status: 'Questionable',
      clauseRef: 'Section 8.4: Prohibition of Non-Contractual Fees',
      explanation: 'No portal fee authorized anywhere in lease agreement. Potential overcharge: $18.00/mo ($216/yr).'
    },
    {
      title: 'Late Fee Assessment',
      date: 'March 3 · Billed on 3rd',
      amount: '$75.00',
      status: 'Grace Period Breach',
      clauseRef: 'Section 3.2: Grace Period & Late Charges',
      explanation: 'Lease grants 5-day grace period through 11:59 PM on 5th. Fee was assessed on 3rd ($25 over $50 cap).'
    },
    {
      title: 'Utility Admin Surcharge',
      date: 'Feb 1 · Submeter billing',
      amount: '$12.00',
      status: 'Lease Violation',
      clauseRef: 'Section 4.1: Utilities & Services',
      explanation: 'Section 4.1 explicitly bans administrative handling fees or markups passed through to tenant.'
    }
  ];

  return (
    <div className="bg-white text-slate-900 selection:bg-amber-100 selection:text-amber-900 font-sans">
      
      {/* Top Gradient Stripe */}
      <div className="h-1 bg-gradient-to-r from-amber-500 via-emerald-700 to-emerald-950 w-full" />

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 border-b border-slate-200 overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-[radial-gradient(#164b3b_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Hero Copy (Left 7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Forensic Rent Ledger & Lease Audit Suite</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-emerald-950 leading-[1.05]">
                Find out if your landlord <span className="text-emerald-800 italic">overcharged</span> you.
              </h1>

              <p className="text-base sm:text-xl text-slate-600 leading-relaxed max-w-2xl">
                Visualize your historical rental ledger side-by-side with your lease agreement. We inspect every line for unauthorized fees, unlawful late charges, and math errors — then generate the formal demand letter to get your money back.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onOpenWorkspace}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm sm:text-base shadow-sm hover:shadow-md transition cursor-pointer"
                >
                  <span>Launch Side-by-Side Workspace</span>
                  <ArrowRight className="w-4 h-4 text-slate-900" />
                </button>

                <button
                  onClick={onOpenImport}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white font-semibold text-sm sm:text-base shadow-sm transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-300" />
                  <span>Upload My Ledger / CSV</span>
                </button>
              </div>

              {/* Trust line */}
              <div className="flex items-start gap-2.5 text-xs text-slate-500 pt-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                <span>
                  Born from a real ledger audit that uncovered $560 in challengeable fees. Private, client-side analysis.
                </span>
              </div>

            </div>

            {/* Hero Interactive Sheet Preview (Right 5 cols) */}
            <div className="lg:col-span-5 relative">
              <div className="relative">
                {/* Background offset layer */}
                <div className="absolute -inset-2 sm:-inset-3 bg-amber-400 rounded-2xl transform -rotate-2 opacity-90 shadow-lg" />
                
                {/* Main Ledger Sheet Card */}
                <div className="relative bg-white rounded-xl border border-slate-300 shadow-2xl p-6 transform rotate-1 space-y-4">
                  
                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Sample Scan</span>
                      <h3 className="font-serif font-bold text-lg text-emerald-950">Rent Account Ledger</h3>
                    </div>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Side-by-Side Cross-Check
                    </span>
                  </div>

                  {/* Standard Compliant Row */}
                  <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">Monthly Base Rent</div>
                      <div className="text-[11px] text-slate-500 font-mono">2024-01-01 · Agreed in Lease</div>
                    </div>
                    <div className="font-mono font-bold text-slate-900">$1,850.00</div>
                  </div>

                  {/* Clickable Questionable Rows */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Flagged Discrepancies (Click to inspect clause):
                    </div>

                    {sampleCharges.map((item, idx) => {
                      const isSelected = activeSampleIndex === idx;
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveSampleIndex(idx)}
                          className={`p-3 rounded-lg border transition cursor-pointer text-xs ${
                            isSelected
                              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{item.title}</span>
                            <span className="font-mono font-bold text-rose-700">+{item.amount}</span>
                          </div>
                          
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span className="text-slate-500 font-mono">{item.date}</span>
                            <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded text-[10px]">
                              {item.status}
                            </span>
                          </div>

                          {isSelected && (
                            <div className="mt-2.5 pt-2 border-t border-amber-200/80 text-[11px] space-y-1">
                              <div className="font-semibold text-emerald-900 flex items-center gap-1">
                                <Scale className="w-3 h-3 text-emerald-700 flex-shrink-0" />
                                <span>{item.clauseRef}</span>
                              </div>
                              <p className="text-slate-600 leading-snug">
                                {item.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Overcharge Summary */}
                  <div className="bg-emerald-950 text-white rounded-lg p-3.5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-300 uppercase tracking-wider block">
                        Challengeable in this sample
                      </span>
                      <strong className="font-serif text-2xl text-amber-400">$105.00</strong>
                    </div>
                    <button
                      onClick={onOpenWorkspace}
                      className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                    >
                      <span>Explore Case</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3 Step Process: How It Works */}
      <section id="how-it-works" className="py-16 sm:py-24 border-b border-slate-200" style={{ backgroundColor: '#d6d8d8' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-2xl mb-12">
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-emerald-950 tracking-tight">
              How LedgerFinesse works
            </h2>
            <p className="text-slate-600 text-base sm:text-lg mt-3">
              Most renters never compare their monthly portal ledgers against the exact clauses in their lease. We make it effortless.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Step 1 */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs relative flex flex-col justify-between">
              <div>
                <div className="font-serif text-4xl sm:text-5xl font-bold text-amber-500 mb-4">
                  01
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Upload or paste your documents
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Import your transaction ledger (CSV, portal export, or paste rows) and your lease agreement terms. Clear phone photos or text clips work seamlessly.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-emerald-800 flex items-center gap-1">
                <span>Supports all major resident portals</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs relative flex flex-col justify-between">
              <div>
                <div className="font-serif text-4xl sm:text-5xl font-bold text-amber-500 mb-4">
                  02
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Side-by-side audit engine
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Every charge is cross-referenced with your contract. We flag fees with no lease basis, early late fees assessed during grace periods, and arithmetic balance drift.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-emerald-800 flex items-center gap-1">
                <span>Instant interactive cross-linking</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs relative flex flex-col justify-between">
              <div>
                <div className="font-serif text-4xl sm:text-5xl font-bold text-amber-500 mb-4">
                  03
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  Generate your demand letter
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Get a complete audit summary and a professional, ready-to-send dispute letter citing specific dates, clause numbers, and statutory anti-retaliation protections.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-emerald-800 flex items-center gap-1">
                <span>1-click export to print, PDF, or CSV</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* What We Check Section */}
      <section id="what-we-check" className="py-16 sm:py-24 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Forensic Verification
              </span>
              <h2 className="font-serif text-3xl sm:text-5xl font-bold text-emerald-950 tracking-tight leading-tight">
                What LedgerFinesse audits
              </h2>
              <p className="text-slate-600 text-base leading-relaxed">
                Landlord accounting software frequently generates automated fees that violate lease agreements. Our engine scrutinizes every transaction against binding contract standards.
              </p>
              <div className="pt-2">
                <button
                  onClick={onOpenWorkspace}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold text-sm shadow-xs transition cursor-pointer"
                >
                  <span>Test with Pre-loaded Cases</span>
                  <ArrowRight className="w-4 h-4 text-emerald-300" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
                
                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Uncontracted "Junk" Fees</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Portal convenience fees ($15–$25/mo), resident technology fees, administrative overhead charges, and locker surcharges not explicitly agreed upon in your signed lease.
                    </p>
                  </div>
                </div>

                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Grace Period Violations</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Late charges applied on the 2nd, 3rd, or 4th when your lease stipulates rent is timely through the 5th, or assessing late penalties on payments already submitted on time.
                    </p>
                  </div>
                </div>

                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Running Balance Arithmetic Errors</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Phantom carryover balances where the landlord's reported total balance does not equal previous balance + charges - payments.
                    </p>
                  </div>
                </div>

                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Excessive Late Fee Caps</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Compound daily fees or charges that exceed your contractual maximum flat fee or statutory state limits (e.g. Colorado Rev. Stat. § 38-12-105).
                    </p>
                  </div>
                </div>

                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Duplicate Ancillary Billings</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Double-billed valet trash fees, pest control charges, or utility administrative charges billed multiple times in the same calendar month.
                    </p>
                  </div>
                </div>

                <div className="py-5 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Premature Rent Hikes</h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Base rent increased 1–2 months prior to the expiration of your fixed 12-month lease without a signed lease addendum.
                    </p>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Real World Evidence Banner */}
      <section className="bg-emerald-950 text-white py-16 sm:py-20 border-b border-emerald-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              The Reality of US Rental Billing
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight mt-2 text-white">
              Junk fees and accounting discrepancies are systemic.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 divide-y sm:divide-y-0 sm:divide-x divide-emerald-800">
            
            <div className="pt-6 sm:pt-0 sm:px-6 first:pl-0">
              <strong className="block font-serif text-4xl sm:text-5xl font-bold text-amber-400">
                46.4M
              </strong>
              <span className="block text-sm text-emerald-100 font-medium mt-2">
                US renter households in 2026
              </span>
              <p className="text-xs text-emerald-300/70 mt-1">
                US Census Bureau Quarterly Housing Survey
              </p>
            </div>

            <div className="pt-6 sm:pt-0 sm:px-6">
              <strong className="block font-serif text-4xl sm:text-5xl font-bold text-amber-400">
                89%
              </strong>
              <span className="block text-sm text-emerald-100 font-medium mt-2">
                Pay non-rent ancillary fees
              </span>
              <p className="text-xs text-emerald-300/70 mt-1">
                National Consumer Law Center (NCLC) renter survey
              </p>
            </div>

            <div className="pt-6 sm:pt-0 sm:px-6">
              <strong className="block font-serif text-4xl sm:text-5xl font-bold text-amber-400">
                $48M
              </strong>
              <span className="block text-sm text-emerald-100 font-medium mt-2">
                FTC Invitation Homes Settlement
              </span>
              <p className="text-xs text-emerald-300/70 mt-1">
                FTC enforcement regarding mandatory uncontracted fees
              </p>
            </div>

            <div className="pt-6 sm:pt-0 sm:px-6 last:pr-0">
              <strong className="block font-serif text-4xl sm:text-5xl font-bold text-amber-400">
                $23M+
              </strong>
              <span className="block text-sm text-emerald-100 font-medium mt-2">
                FTC & State Greystar Settlement
              </span>
              <p className="text-xs text-emerald-300/70 mt-1">
                Settlement resolving hidden fee & advertised rent violations
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* Interactive Case Studies Section */}
      <section className="py-16 sm:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Pre-loaded Scenarios
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-emerald-950 tracking-tight mt-1">
              Explore real-world audit cases
            </h2>
            <p className="text-slate-600 text-base mt-2">
              Click any case to launch the interactive side-by-side workspace and test how our discrepancy engine detects unauthorized charges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SAMPLE_CASES.map((preset) => (
              <div
                key={preset.id}
                onClick={() => onSelectCaseAndOpen(preset)}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md hover:border-emerald-600 transition cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="font-mono font-semibold">{preset.tagline}</span>
                    <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      -${preset.totalOverchargeExpected.toFixed(0)} found
                    </span>
                  </div>

                  <h3 className="font-serif font-bold text-xl text-slate-900 group-hover:text-emerald-900 transition">
                    {preset.name}
                  </h3>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {preset.propertySummary}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-800 group-hover:text-emerald-950">
                  <span>Open in Side-by-Side Workspace</span>
                  <ArrowRight className="w-4 h-4 transition transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 sm:py-24 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-emerald-950 tracking-tight">
              Questions, answered plainly
            </h2>
            <p className="text-slate-600 text-sm mt-2">
              Everything you need to know about auditing your rent ledger and disputing invalid charges.
            </p>
          </div>

          <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
            
            <details className="group py-5">
              <summary className="font-bold text-base text-slate-900 cursor-pointer list-none flex items-center justify-between">
                <span>Is LedgerFinesse a law firm?</span>
                <span className="text-emerald-700 text-xl font-normal group-open:rotate-45 transition transform">+</span>
              </summary>
              <p className="text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed">
                No. LedgerFinesse is a mathematical and contract-comparison audit tool designed for tenant self-advocacy. We verify ledger arithmetic against your signed lease terms and draft dispute letters. We do not provide legal representation.
              </p>
            </details>

            <details className="group py-5">
              <summary className="font-bold text-base text-slate-900 cursor-pointer list-none flex items-center justify-between">
                <span>Can my landlord retaliate if I dispute questionable fees?</span>
                <span className="text-emerald-700 text-xl font-normal group-open:rotate-45 transition transform">+</span>
              </summary>
              <p className="text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed">
                Most states have statutory tenant protections prohibiting landlord retaliation (e.g. California Civil Code § 1942.5, Texas Property Code § 92.331) for requesting ledger reconciliations or asserting contractual rights in good faith. Our generated dispute letters include standard statutory anti-retaliation notices.
              </p>
            </details>

            <details className="group py-5">
              <summary className="font-bold text-base text-slate-900 cursor-pointer list-none flex items-center justify-between">
                <span>What file formats can I upload?</span>
                <span className="text-emerald-700 text-xl font-normal group-open:rotate-45 transition transform">+</span>
              </summary>
              <p className="text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed">
                You can upload CSV exports, tab-delimited text, or paste rows copied directly from resident portals (such as AppFolio, RealPage, Yardi, RentCafe, or Buildium). You can also paste your lease text or use our Key Terms Editor to specify base rent, grace days, and late fee caps.
              </p>
            </details>

            <details className="group py-5">
              <summary className="font-bold text-base text-slate-900 cursor-pointer list-none flex items-center justify-between">
                <span>How does the side-by-side comparison work?</span>
                <span className="text-emerald-700 text-xl font-normal group-open:rotate-45 transition transform">+</span>
              </summary>
              <p className="text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed">
                When you click any transaction in your ledger, LedgerFinesse automatically highlights and scrolls to the exact lease clause that authorizes or disputes the charge. Clicking a lease clause highlights all corresponding ledger entries and calculates compliance statistics.
              </p>
            </details>

          </div>

        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-16 sm:py-20" style={{ backgroundColor: '#ffb900', color: '#105f0b' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight" style={{ color: '#006045' }}>
            Stop paying fees your lease doesn't authorize.
          </h2>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: '#105f0b' }}>
            Open the side-by-side workspace right now to audit a pre-loaded sample case or paste your own ledger in seconds.
          </p>
          <div className="pt-2">
            <button
              onClick={onOpenWorkspace}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base shadow-lg transition cursor-pointer text-white"
              style={{ backgroundColor: '#1a621a' }}
            >
              <span>Open Side-by-Side Audit Workspace</span>
              <ArrowRight className="w-5 h-5 text-emerald-100" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 sm:px-6 lg:px-8 text-xs" style={{ backgroundColor: '#002c22', color: '#ffffff' }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-base">LedgerFinesse</span>
            <span>· Side-by-side rent ledger & lease audit suite</span>
          </div>
          <div>
            <p>© 2026 LedgerFinesse. Not a law firm and does not provide legal advice.</p>
          </div>
        </div>
      </footer>

    </div>
  );
};
