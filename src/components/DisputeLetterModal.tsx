import React, { useState } from 'react';
import { X, Copy, Check, Printer, Download, Mail, ShieldAlert } from 'lucide-react';
import { LeaseAgreement, LedgerEntry } from '../types';
import { generateDisputeLetter } from '../utils/exportUtils';

interface DisputeLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  lease: LeaseAgreement;
  flaggedEntries: LedgerEntry[];
  totalDisputedAmount: number;
}

export const DisputeLetterModal: React.FC<DisputeLetterModalProps> = ({
  isOpen,
  onClose,
  lease,
  flaggedEntries,
  totalDisputedAmount
}) => {
  const [copied, setCopied] = useState(false);
  const [customLetter, setCustomLetter] = useState<string | null>(null);

  if (!isOpen) return null;

  const letterText = customLetter !== null 
    ? customLetter 
    : generateDisputeLetter(lease, flaggedEntries, totalDisputedAmount);

  const handleCopy = () => {
    navigator.clipboard.writeText(letterText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const blob = new Blob([letterText], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rent_Dispute_Demand_Letter_${lease.unitNumber || 'Unit'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
              <Mail className="w-4 h-4 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Formal Dispute & Reconciliation Demand Letter
              </h2>
              <p className="text-xs text-slate-500">
                Itemizes all {flaggedEntries.length} disputed charges (${totalDisputedAmount.toFixed(2)}) with governing lease citations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Total Demanded:</span>
            <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              ${totalDisputedAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Letter'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download (.txt)</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>

        {/* Letter Text Editor / Viewer */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xs max-w-3xl mx-auto">
            <textarea
              value={letterText}
              onChange={(e) => setCustomLetter(e.target.value)}
              className="w-full h-[500px] text-xs sm:text-sm font-mono text-slate-800 leading-relaxed resize-none focus:outline-none bg-transparent"
              aria-label="Dispute letter draft"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1 text-slate-600">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            Notice: Edit directly above if you want to personalize dates, account numbers, or address details.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
