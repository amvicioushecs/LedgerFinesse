import React from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight, 
  Trash2, 
  Edit3, 
  Info,
  DollarSign,
  TrendingDown,
  ShieldAlert
} from 'lucide-react';
import { LedgerEntry } from '../types';

interface LedgerPaneProps {
  entries: LedgerEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entry: LedgerEntry) => void;
  onJumpToClause: (clauseId: string) => void;
  onDeleteEntry: (id: string) => void;
  highlightedClauseId: string | null;
}

export const LedgerPane: React.FC<LedgerPaneProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
  onJumpToClause,
  onDeleteEntry,
  highlightedClauseId
}) => {
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      
      {/* Pane Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Historical Rent Ledger</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
              {entries.length} records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any row to inspect audit flags & cross-reference corresponding lease clauses
          </p>
        </div>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-600 font-medium">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            Discrepancy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            Compliant
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
            Payment
          </span>
        </div>
      </div>

      {/* Ledger Table Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No ledger entries match the active filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const isSelected = selectedEntryId === entry.id;
              const hasDiscrepancy = !!entry.discrepancy;
              const isMappedToHighlightedClause = 
                highlightedClauseId && (entry.mappedClauseId === highlightedClauseId || entry.discrepancy?.leaseClauseId === highlightedClauseId);

              return (
                <div
                  key={entry.id}
                  onClick={() => onSelectEntry(entry)}
                  className={`p-3.5 transition cursor-pointer select-none text-xs ${
                    isSelected
                      ? 'bg-amber-50/90 border-l-4 border-amber-500 pl-2.5'
                      : isMappedToHighlightedClause
                      ? 'bg-emerald-50/70 border-l-4 border-emerald-500 pl-2.5'
                      : hasDiscrepancy
                      ? 'hover:bg-rose-50/40 bg-rose-50/20'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    
                    {/* Left: Date & Description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-600 text-[11px]">
                          {entry.date}
                        </span>
                        
                        {/* Transaction Type Tag */}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                          entry.type === 'payment'
                            ? 'bg-blue-100 text-blue-800'
                            : entry.type === 'credit'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {entry.type.toUpperCase()}
                        </span>

                        {/* Math Drift Alert */}
                        {entry.balanceDiscrepancy && Math.abs(entry.balanceDiscrepancy) >= 0.05 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 flex items-center gap-1">
                            Math Drift: {entry.balanceDiscrepancy > 0 ? `+$${entry.balanceDiscrepancy.toFixed(2)}` : `-$${Math.abs(entry.balanceDiscrepancy).toFixed(2)}`}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 font-semibold text-slate-900 text-sm truncate">
                        {entry.description}
                      </div>

                      {/* Discrepancy Alert Banner if flagged */}
                      {hasDiscrepancy && (
                        <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                          <div className="flex items-center justify-between font-bold text-xs">
                            <span className="flex items-center gap-1.5 text-rose-800">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                              {entry.discrepancy?.title}
                            </span>
                            <span className="font-mono text-rose-950 font-bold bg-rose-200/80 px-1.5 py-0.5 rounded">
                              -${entry.discrepancy?.amountDisputed.toFixed(2)}
                            </span>
                          </div>
                          
                          <p className="mt-1 text-[11px] text-rose-700 leading-relaxed">
                            {entry.discrepancy?.explanation}
                          </p>

                          {entry.discrepancy?.leaseClauseId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onJumpToClause(entry.discrepancy!.leaseClauseId!);
                              }}
                              className="mt-1.5 text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Inspect {entry.discrepancy?.leaseClauseTitle || 'Lease Clause'}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Mapped Clause quick reference for compliant lines */}
                      {!hasDiscrepancy && entry.mappedClauseId && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Compliant with {entry.mappedClauseId}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Financial Columns */}
                    <div className="text-right flex-shrink-0 min-w-[120px]">
                      {entry.type === 'charge' ? (
                        <div className="font-mono font-bold text-sm text-slate-900">
                          +${entry.amount.toFixed(2)}
                        </div>
                      ) : (
                        <div className="font-mono font-bold text-sm text-blue-700">
                          -${entry.amount.toFixed(2)}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500 mt-1">
                        Bal: <span className="font-mono font-semibold text-slate-800">${entry.reportedBalance.toFixed(2)}</span>
                      </div>

                      {entry.computedBalance !== undefined && entry.computedBalance !== entry.reportedBalance && (
                        <div className="text-[10px] text-amber-700 font-mono">
                          (Math: ${entry.computedBalance.toFixed(2)})
                        </div>
                      )}

                      {/* Delete action button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove entry "${entry.description}"?`)) {
                            onDeleteEntry(entry.id);
                          }
                        }}
                        title="Delete ledger entry"
                        className="mt-2 text-slate-400 hover:text-rose-600 p-1 rounded transition opacity-0 hover:opacity-100 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pane Footer summary */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Displaying {entries.length} transactions</span>
        <span>Green highlight indicates active lease cross-link</span>
      </div>

    </div>
  );
};
