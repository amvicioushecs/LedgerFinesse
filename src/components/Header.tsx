import React from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  PlusCircle, 
  RefreshCw, 
  Mail, 
  Download, 
  Columns,
  ArrowLeft
} from 'lucide-react';
import { PresetCase } from '../types';
import { SAMPLE_CASES } from '../data/sampleCases';

interface HeaderProps {
  viewMode: 'landing' | 'workspace';
  onToggleViewMode: (mode: 'landing' | 'workspace') => void;
  currentCaseId: string;
  onSelectCase: (c: PresetCase) => void;
  onOpenImport: () => void;
  onOpenNewEntry: () => void;
  onOpenDisputeLetter: () => void;
  onExportCSV: () => void;
  onRunAudit: () => void;
  isAuditing: boolean;
  totalDiscrepancyAmount: number;
  totalFlaggedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  onToggleViewMode,
  currentCaseId,
  onSelectCase,
  onOpenImport,
  onOpenNewEntry,
  onOpenDisputeLetter,
  onExportCSV,
  onRunAudit,
  isAuditing,
  totalDiscrepancyAmount,
  totalFlaggedCount
}) => {
  return (
    <header className="border-b border-slate-800 sticky top-0 z-40 shadow-xs" style={{ backgroundColor: '#002c22' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#002c22' }}>
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-4">
          
          {/* Brand & View Switcher */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <button
              onClick={() => onToggleViewMode('landing')}
              className="flex items-center gap-2.5 text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-950 text-white flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0 group-hover:bg-emerald-900 transition">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-xl tracking-tight leading-none" style={{ color: '#ffffff' }}>
                    LedgerFinesse
                  </span>
                </div>
                <p className="text-[11px] hidden md:block leading-tight mt-0.5" style={{ color: '#d2e0e5' }}>
                  Side-by-side rent ledger & lease audit
                </p>
              </div>
            </button>
          </div>

          {/* Contextual Right Actions */}
          {viewMode === 'workspace' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleViewMode('landing')}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg hover:text-white hover:bg-emerald-900 transition mr-1 cursor-pointer"
                title="Return to Landing Page Overview"
                style={{ color: '#d8dfeb' }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </button>
              
              {/* Preset Cases Selector */}
              <div className="hidden lg:flex items-center gap-2">
                <label htmlFor="case-select" className="text-xs font-medium text-slate-300">
                  Case:
                </label>
                <select
                  id="case-select"
                  value={currentCaseId}
                  onChange={(e) => {
                    const found = SAMPLE_CASES.find(c => c.id === e.target.value);
                    if (found) onSelectCase(found);
                  }}
                  className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                >
                  {SAMPLE_CASES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (-${c.totalOverchargeExpected.toFixed(0)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons in Workspace */}
              <button
                onClick={onRunAudit}
                disabled={isAuditing}
                title="Rerun discrepancy audit on active ledger and lease"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin text-emerald-600' : ''}`} />
                <span className="hidden md:inline">Audit Engine</span>
              </button>

              <button
                onClick={onOpenNewEntry}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Add Row</span>
              </button>

              <button
                onClick={onOpenImport}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Import</span>
              </button>

              <button
                onClick={onExportCSV}
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-200"
                title="Download audited ledger as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                onClick={onOpenDisputeLetter}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs transition"
              >
                <Mail className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">Dispute Letter</span>
                <span className="sm:hidden">Letter</span>
                {totalFlaggedCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-amber-300 font-mono font-bold">
                    ${totalDiscrepancyAmount.toFixed(0)}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <nav className="hidden md:flex items-center gap-5 text-xs font-medium">
                <a href="#how-it-works" className="transition hover:opacity-80" style={{ color: '#fadd19' }}>How It Works</a>
                <a href="#what-we-check" className="transition hover:opacity-80" style={{ color: '#fadd19' }}>What We Audit</a>
                <a href="#faq" className="transition hover:opacity-80" style={{ color: '#fadd19' }}>FAQ</a>
              </nav>

              <button
                onClick={() => onToggleViewMode('workspace')}
                className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 transition shadow-xs cursor-pointer"
              >
                <span>Open Audit Workspace</span>
                <Columns className="w-3.5 h-3.5 text-slate-950" />
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
