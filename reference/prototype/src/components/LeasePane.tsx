import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  BookOpen, 
  Sliders, 
  ShieldCheck,
  Search,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { LeaseAgreement, LeaseClause, LedgerEntry } from '../types';

interface LeasePaneProps {
  lease: LeaseAgreement;
  activeClauseId: string | null;
  onSelectClause: (clauseId: string) => void;
  ledgerEntries: LedgerEntry[];
  onUpdateLeaseTerms: (updated: Partial<LeaseAgreement>) => void;
}

export const LeasePane: React.FC<LeasePaneProps> = ({
  lease,
  activeClauseId,
  onSelectClause,
  ledgerEntries,
  onUpdateLeaseTerms
}) => {
  const [tab, setTab] = useState<'clauses' | 'fulltext' | 'specs'>('clauses');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate compliance statistics per clause
  const getClauseStats = (clauseId: string) => {
    const related = ledgerEntries.filter(
      e => e.mappedClauseId === clauseId || e.discrepancy?.leaseClauseId === clauseId
    );
    const flagged = related.filter(e => e.discrepancy);
    const totalDisputed = flagged.reduce((sum, e) => sum + (e.discrepancy?.amountDisputed || 0), 0);

    return {
      totalRelated: related.length,
      flaggedCount: flagged.length,
      compliantCount: related.length - flagged.length,
      totalDisputed
    };
  };

  const filteredClauses = lease.clauses.filter(c => 
    searchTerm === '' ||
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.ruleText.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.sectionNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      
      {/* Pane Header with View Tabs */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Lease Agreement</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Binding Contract
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {lease.title} · {lease.tenantName}
            </p>
          </div>

          {/* Segmented Control Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              onClick={() => setTab('clauses')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                tab === 'clauses' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clause Explorer
            </button>
            <button
              onClick={() => setTab('fulltext')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                tab === 'fulltext' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Agreement
            </button>
            <button
              onClick={() => setTab('specs')}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                tab === 'specs' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Key Terms Editor
            </button>
          </div>
        </div>

        {/* Search bar when exploring clauses */}
        {tab === 'clauses' && (
          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search lease sections, clauses, utilities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>
        )}
      </div>

      {/* Pane Content based on active tab */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        
        {/* Tab 1: Clause Explorer */}
        {tab === 'clauses' && (
          <div className="space-y-3">
            {filteredClauses.map((clause) => {
              const isSelected = activeClauseId === clause.id;
              const stats = getClauseStats(clause.id);

              return (
                <div
                  key={clause.id}
                  id={`clause-${clause.id}`}
                  onClick={() => onSelectClause(clause.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer bg-white ${
                    isSelected
                      ? 'border-emerald-600 ring-2 ring-emerald-500/20 shadow-sm'
                      : stats.flaggedCount > 0
                      ? 'border-amber-300 hover:border-amber-400'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                          {clause.sectionNumber}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          {clause.title}
                        </h3>
                      </div>

                      {/* Rule Summary */}
                      <p className="mt-2 text-xs font-medium text-slate-800 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {clause.ruleText}
                      </p>

                      {/* Full Legal Text Expander */}
                      <div className="mt-2 text-[11px] text-slate-600 font-serif leading-relaxed italic border-l-2 border-slate-300 pl-2.5">
                        "{clause.fullLegalText}"
                      </div>
                    </div>

                    {/* Stipulated Amount Tag */}
                    {clause.stipulatedAmount !== undefined && (
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                          ${clause.stipulatedAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Cross-Link Status Meter */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {stats.flaggedCount > 0 ? (
                        <span className="text-amber-700 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          {stats.flaggedCount} disputed charges (-${stats.totalDisputed.toFixed(2)})
                        </span>
                      ) : stats.compliantCount > 0 ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          {stats.compliantCount} compliant charges
                        </span>
                      ) : (
                        <span className="text-slate-400">No ledger charges mapped</span>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-0.5">
                      Highlight on ledger
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Full Agreement Contract Viewer */}
        {tab === 'fulltext' && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs font-serif text-slate-800 text-xs sm:text-sm leading-relaxed space-y-4 whitespace-pre-wrap selection:bg-emerald-100">
            <div className="text-center border-b border-slate-200 pb-4 not-italic font-sans">
              <h3 className="font-bold text-slate-900 text-base">{lease.title}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Property: {lease.propertyAddress} · Term: {lease.leaseStartDate} to {lease.leaseEndDate}
              </p>
            </div>

            <div className="text-slate-700 font-serif leading-relaxed">
              {lease.rawAgreementText || lease.clauses.map(c => `${c.sectionNumber} - ${c.title}\n${c.fullLegalText}\n`).join('\n\n')}
            </div>
          </div>
        )}

        {/* Tab 3: Key Terms Editor (Adjust contract numbers to simulate audits) */}
        {tab === 'specs' && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Contractual Baseline Parameters</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Adjusting these parameters will immediately trigger the discrepancy engine to re-audit every ledger row.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monthly Base Rent ($)
                </label>
                <input
                  type="number"
                  value={lease.monthlyBaseRent}
                  onChange={(e) => onUpdateLeaseTerms({ monthlyBaseRent: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Due Day of Month
                </label>
                <input
                  type="number"
                  value={lease.dueDay}
                  onChange={(e) => onUpdateLeaseTerms({ dueDay: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Grace Period Days (e.g. 5 days)
                </label>
                <input
                  type="number"
                  value={lease.gracePeriodDays}
                  onChange={(e) => onUpdateLeaseTerms({ gracePeriodDays: parseInt(e.target.value, 10) || 5 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Maximum Late Fee Cap ($)
                </label>
                <input
                  type="number"
                  value={lease.lateFeeFlatAmount}
                  onChange={(e) => onUpdateLeaseTerms({ lateFeeFlatAmount: parseFloat(e.target.value) || 50 })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Authorized Recurring Utilities & Add-ons
                </label>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  {lease.authorizedUtilities.map((u, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-700">
                      <span>• {u.name}</span>
                      <span className="font-mono font-semibold">${u.amount.toFixed(2)}/mo</span>
                    </div>
                  ))}
                  {lease.authorizedAddons.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-700">
                      <span>• {a.name}</span>
                      <span className="font-mono font-semibold">${a.amount.toFixed(2)}/mo</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Pane Footer */}
      <div className="p-3 border-t border-slate-200 bg-white text-[11px] text-slate-500 flex items-center justify-between">
        <span>{lease.clauses.length} explicit contractual clauses indexed</span>
        <span className="text-emerald-700 font-medium">Automatic discrepancy linkage active</span>
      </div>

    </div>
  );
};
