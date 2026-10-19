import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Split, 
  Columns, 
  Sparkles,
  Link2,
  X
} from 'lucide-react';
import { SAMPLE_CASES } from './data/sampleCases';
import { LeaseAgreement, LedgerEntry, PresetCase, AuditFilterOptions } from './types';
import { runFullAudit, AuditResults } from './utils/auditEngine';
import { exportLedgerToCSV } from './utils/exportUtils';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { DiscrepancySummary } from './components/DiscrepancySummary';
import { LedgerPane } from './components/LedgerPane';
import { LeasePane } from './components/LeasePane';
import { DisputeLetterModal } from './components/DisputeLetterModal';
import { ImportModal } from './components/ImportModal';
import { NewEntryModal } from './components/NewEntryModal';

export default function App() {
  // Navigation mode: 'landing' or 'workspace'
  const [viewMode, setViewMode] = useState<'landing' | 'workspace'>('landing');

  // Current active case
  const [currentCase, setCurrentCase] = useState<PresetCase>(SAMPLE_CASES[0]);
  const [lease, setLease] = useState<LeaseAgreement>(SAMPLE_CASES[0].lease);
  const [rawLedger, setRawLedger] = useState<LedgerEntry[]>(SAMPLE_CASES[0].ledger);
  
  // Cross-reference selection state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  
  // Filters
  const [filterOptions, setFilterOptions] = useState<AuditFilterOptions>({
    category: 'all',
    flaggedOnly: false,
    searchQuery: ''
  });

  // Modals state
  const [isDisputeLetterOpen, setIsDisputeLetterOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  // Layout view mode on smaller screens: 'ledger' | 'lease'
  const [activeMobileTab, setActiveMobileTab] = useState<'ledger' | 'lease'>('ledger');

  // Run audit engine whenever rawLedger or lease changes
  const auditResults: AuditResults = useMemo(() => {
    return runFullAudit(rawLedger, lease);
  }, [rawLedger, lease]);

  // Handle switching preset cases
  const handleSelectCase = (preset: PresetCase) => {
    setCurrentCase(preset);
    setLease(preset.lease);
    setRawLedger(preset.ledger);
    setSelectedEntryId(null);
    setActiveClauseId(null);
    setFilterOptions({ category: 'all', flaggedOnly: false, searchQuery: '' });
  };

  const handleSelectCaseAndOpen = (preset: PresetCase) => {
    handleSelectCase(preset);
    setViewMode('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Re-trigger visual audit spin
  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setIsAuditing(false);
    }, 400);
  };

  // Select ledger entry and cross-link to corresponding lease clause
  const handleSelectEntry = (entry: LedgerEntry) => {
    setSelectedEntryId(entry.id);
    const targetClauseId = entry.discrepancy?.leaseClauseId || entry.mappedClauseId;
    if (targetClauseId) {
      setActiveClauseId(targetClauseId);
      const el = document.getElementById(`clause-${targetClauseId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  // Select lease clause and highlight mapped ledger entries
  const handleSelectClause = (clauseId: string) => {
    setActiveClauseId(clauseId);
    const matching = auditResults.auditedLedger.find(
      e => e.mappedClauseId === clauseId || e.discrepancy?.leaseClauseId === clauseId
    );
    if (matching) {
      setSelectedEntryId(matching.id);
    }
  };

  // Filtered ledger entries
  const filteredLedger = useMemo(() => {
    return auditResults.auditedLedger.filter(entry => {
      if (filterOptions.flaggedOnly && !entry.discrepancy) {
        return false;
      }
      if (filterOptions.category !== 'all' && entry.category !== filterOptions.category) {
        return false;
      }
      if (filterOptions.searchQuery) {
        const query = filterOptions.searchQuery.toLowerCase();
        const matchesDesc = entry.description.toLowerCase().includes(query);
        const matchesDate = entry.date.includes(query);
        const matchesDisc = entry.discrepancy?.title.toLowerCase().includes(query) || entry.discrepancy?.explanation.toLowerCase().includes(query);
        return matchesDesc || matchesDate || matchesDisc;
      }
      return true;
    });
  }, [auditResults.auditedLedger, filterOptions]);

  // Selected entry object
  const selectedEntry = useMemo(() => {
    return auditResults.auditedLedger.find(e => e.id === selectedEntryId) || null;
  }, [auditResults.auditedLedger, selectedEntryId]);

  // Active clause object
  const activeClause = useMemo(() => {
    return lease.clauses.find(c => c.id === activeClauseId) || null;
  }, [lease.clauses, activeClauseId]);

  // Add manual entry
  const handleAddEntry = (entry: LedgerEntry) => {
    setRawLedger(prev => [...prev, entry]);
    setSelectedEntryId(entry.id);
  };

  // Delete entry
  const handleDeleteEntry = (id: string) => {
    setRawLedger(prev => prev.filter(e => e.id !== id));
    if (selectedEntryId === id) {
      setSelectedEntryId(null);
    }
  };

  // Import custom ledger
  const handleImportLedger = (entries: LedgerEntry[]) => {
    setRawLedger(entries);
    setSelectedEntryId(null);
    setViewMode('workspace');
  };

  // Import lease terms
  const handleImportLeaseText = (
    text: string, 
    rent: number, 
    grace: number, 
    lateFee: number
  ) => {
    setLease(prev => ({
      ...prev,
      monthlyBaseRent: rent,
      gracePeriodDays: grace,
      lateFeeFlatAmount: lateFee,
      rawAgreementText: text || prev.rawAgreementText
    }));
    setViewMode('workspace');
  };

  // Update lease terms
  const handleUpdateLeaseTerms = (updated: Partial<LeaseAgreement>) => {
    setLease(prev => ({
      ...prev,
      ...updated
    }));
  };

  // Last balance for new entry helper
  const lastBalance = auditResults.auditedLedger.length > 0 
    ? auditResults.auditedLedger[auditResults.auditedLedger.length - 1].reportedBalance 
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans selection:bg-amber-100 selection:text-amber-900">
      
      {/* 1. Universal Top Header */}
      <Header
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        currentCaseId={currentCase.id}
        onSelectCase={handleSelectCase}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenNewEntry={() => setIsNewEntryOpen(true)}
        onOpenDisputeLetter={() => setIsDisputeLetterOpen(true)}
        onExportCSV={() => exportLedgerToCSV(auditResults.auditedLedger)}
        onRunAudit={handleRunAudit}
        isAuditing={isAuditing}
        totalDiscrepancyAmount={auditResults.totalDiscrepancyAmount}
        totalFlaggedCount={auditResults.totalFlaggedEntries}
      />

      {/* 2. Main Content: Landing Page OR Audit Workspace */}
      {viewMode === 'landing' ? (
        <LandingPage
          onOpenWorkspace={() => {
            setViewMode('workspace');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onSelectCaseAndOpen={handleSelectCaseAndOpen}
          onOpenImport={() => setIsImportOpen(true)}
        />
      ) : (
        <div className="flex-1 flex flex-col">
          
          {/* Summary Banner & Metric Cards */}
          <DiscrepancySummary
            lease={lease}
            totalDiscrepancyAmount={auditResults.totalDiscrepancyAmount}
            totalFlaggedCount={auditResults.totalFlaggedEntries}
            totalTransactionsCount={auditResults.auditedLedger.length}
            discrepanciesByType={auditResults.discrepanciesByType}
            filterOptions={filterOptions}
            onFilterChange={setFilterOptions}
            mathDiscrepancyFound={auditResults.mathDiscrepancyFound}
            totalMathDrift={auditResults.totalMathDrift}
          />

          {/* Cross-Link Active Inspection Ribbon */}
          {(selectedEntry || activeClause) && (
            <div className="bg-slate-900 text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-semibold text-slate-300">Synchronized Cross-Reference:</span>
                
                {selectedEntry && (
                  <span className="text-white font-mono truncate max-w-xs sm:max-w-md">
                    Ledger [{selectedEntry.date} · "{selectedEntry.description}" ${selectedEntry.amount.toFixed(2)}]
                  </span>
                )}

                <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />

                {activeClause ? (
                  <span className="text-emerald-300 font-semibold truncate max-w-xs">
                    Lease [{activeClause.sectionNumber}: {activeClause.title}]
                  </span>
                ) : (
                  <span className="text-rose-400 font-semibold">
                    ⚠️ No authorizing clause found in Lease Agreement!
                  </span>
                )}

                {selectedEntry?.discrepancy && (
                  <span className="ml-2 font-bold font-mono px-2 py-0.5 rounded bg-rose-900 text-rose-200 border border-rose-700">
                    -${selectedEntry.discrepancy.amountDisputed.toFixed(2)} Disputed
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedEntry?.discrepancy && (
                  <button
                    onClick={() => setIsDisputeLetterOpen(true)}
                    className="text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer"
                  >
                    Include in Dispute Letter
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedEntryId(null);
                    setActiveClauseId(null);
                  }}
                  title="Clear active inspection selection"
                  className="text-slate-400 hover:text-white p-1 rounded transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex border-b border-slate-200 bg-white">
            <button
              onClick={() => setActiveMobileTab('ledger')}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${
                activeMobileTab === 'ledger'
                  ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                  : 'border-transparent text-slate-600'
              }`}
            >
              Historical Ledger ({filteredLedger.length})
            </button>
            <button
              onClick={() => setActiveMobileTab('lease')}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${
                activeMobileTab === 'lease'
                  ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                  : 'border-transparent text-slate-600'
              }`}
            >
              Lease Agreement Clauses ({lease.clauses.length})
            </button>
          </div>

          {/* Side-by-Side Comparison Workspace */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-2 min-h-[640px]">
              
              {/* Left Pane: Historical Ledger */}
              <div className={`${activeMobileTab === 'ledger' ? 'block' : 'hidden md:block'} h-full overflow-hidden`}>
                <LedgerPane
                  entries={filteredLedger}
                  selectedEntryId={selectedEntryId}
                  onSelectEntry={handleSelectEntry}
                  onJumpToClause={handleSelectClause}
                  onDeleteEntry={handleDeleteEntry}
                  highlightedClauseId={activeClauseId}
                />
              </div>

              {/* Right Pane: Lease Agreement & Clauses */}
              <div className={`${activeMobileTab === 'lease' ? 'block' : 'hidden md:block'} h-full overflow-hidden`}>
                <LeasePane
                  lease={lease}
                  activeClauseId={activeClauseId}
                  onSelectClause={handleSelectClause}
                  ledgerEntries={auditResults.auditedLedger}
                  onUpdateLeaseTerms={handleUpdateLeaseTerms}
                />
              </div>

            </div>
          </main>

          {/* Quiet Workspace Footer */}
          <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
            <p>
              LedgerFinesse Audit Suite · Not a law firm · For informational and tenant self-advocacy auditing purposes
            </p>
          </footer>

        </div>
      )}

      {/* 3. Global Modals */}
      <DisputeLetterModal
        isOpen={isDisputeLetterOpen}
        onClose={() => setIsDisputeLetterOpen(false)}
        lease={lease}
        flaggedEntries={auditResults.auditedLedger.filter(e => e.discrepancy)}
        totalDisputedAmount={auditResults.totalDiscrepancyAmount}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportLedger={handleImportLedger}
        onImportLeaseText={handleImportLeaseText}
      />

      <NewEntryModal
        isOpen={isNewEntryOpen}
        onClose={() => setIsNewEntryOpen(false)}
        onAddEntry={handleAddEntry}
        lastBalance={lastBalance}
      />

    </div>
  );
}
