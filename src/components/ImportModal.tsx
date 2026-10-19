import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { LedgerEntry, LeaseAgreement } from '../types';
import { categorizeEntry } from '../utils/categorization';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportLedger: (entries: LedgerEntry[]) => void;
  onImportLeaseText: (text: string, rent: number, grace: number, lateFee: number) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportLedger,
  onImportLeaseText
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'lease'>('ledger');
  
  // Ledger import state
  const [ledgerRawText, setLedgerRawText] = useState('');
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerSuccessCount, setLedgerSuccessCount] = useState<number | null>(null);

  // Lease import state
  const [leaseText, setLeaseText] = useState('');
  const [baseRent, setBaseRent] = useState('1800');
  const [graceDays, setGraceDays] = useState('5');
  const [lateFee, setLateFee] = useState('50');

  if (!isOpen) return null;

  const sampleCSV = `Date,Description,Amount,ReportedBalance,Type
2024-01-01,Monthly Rent,1800.00,1800.00,charge
2024-01-01,Valet Trash,25.00,1825.00,charge
2024-01-02,ACH Resident Payment,1825.00,0.00,payment
2024-02-01,Monthly Rent,1800.00,1800.00,charge
2024-02-01,Online Tech Portal Fee,20.00,1820.00,charge
2024-02-04,Late Fee Assessment,75.00,1895.00,charge
2024-02-04,ACH Payment,1825.00,70.00,payment`;

  const handleParseLedger = () => {
    setLedgerError('');
    try {
      const lines = ledgerRawText.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setLedgerError('Please paste at least one line of ledger data.');
        return;
      }

      const parsed: LedgerEntry[] = [];
      const hasHeader = lines[0].toLowerCase().includes('date') || lines[0].toLowerCase().includes('description');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        // Split by comma or tab
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        if (parts.length < 3) continue;

        const dateStr = parts[0]?.trim() || new Date().toISOString().slice(0, 10);
        const desc = parts[1]?.trim() || `Charge Line ${i + 1}`;
        const amount = parseFloat(parts[2]?.replace(/[^0-9.-]+/g, '')) || 0;
        const balance = parts[3] ? parseFloat(parts[3]?.replace(/[^0-9.-]+/g, '')) || amount : amount;
        
        const typeRaw = parts[4]?.toLowerCase().trim() || '';
        const isPayment = typeRaw.includes('pay') || desc.toLowerCase().includes('payment') || desc.toLowerCase().includes('ach') || amount < 0;


        parsed.push({
          id: `custom-entry-${Date.now()}-${i}`,
          date: dateStr,
          description: desc,
          category: categorizeEntry(desc, isPayment ? 'payment' : 'charge'),
          type: isPayment ? 'payment' : 'charge',
          amount: Math.abs(amount),
          reportedBalance: balance,
          computedBalance: balance
        });
      }

      if (parsed.length === 0) {
        setLedgerError('Could not recognize ledger columns. Expected: Date, Description, Amount, Reported Balance');
        return;
      }

      setLedgerSuccessCount(parsed.length);
      onImportLedger(parsed);
      setTimeout(() => {
        onClose();
      }, 1000);

    } catch (err: any) {
      setLedgerError(err.message || 'Error parsing ledger text.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setLedgerRawText(content);
    };
    reader.readAsText(file);
  };

  const handleSaveLease = () => {
    onImportLeaseText(
      leaseText,
      parseFloat(baseRent) || 1800,
      parseInt(graceDays, 10) || 5,
      parseFloat(lateFee) || 50
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
              <Upload className="w-4 h-4 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Your Rent Ledger or Lease Terms
              </h2>
              <p className="text-xs text-slate-500">
                Load custom CSV/spreadsheet data or update lease contractual terms
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

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 bg-white">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'ledger'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>1. Import Rent Ledger (CSV / Table)</span>
          </button>
          <button
            onClick={() => setActiveTab('lease')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'lease'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>2. Import Lease Clauses & Rules</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[65vh]">
          {activeTab === 'ledger' ? (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Paste CSV or Tab-Delimited Ledger:</span>
                <button
                  type="button"
                  onClick={() => setLedgerRawText(sampleCSV)}
                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                >
                  Load Sample CSV Template
                </button>
              </div>

              <textarea
                value={ledgerRawText}
                onChange={(e) => setLedgerRawText(e.target.value)}
                placeholder="Date, Description, Amount, ReportedBalance, Type&#10;2024-01-01, Base Rent, 1800.00, 1800.00, charge&#10;2024-01-02, Payment, 1800.00, 0.00, payment"
                className="w-full h-44 p-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {/* File upload option */}
              <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50/50">
                <label className="cursor-pointer block">
                  <span className="font-semibold text-emerald-700 hover:underline">
                    Or choose a CSV / TXT file from your device
                  </span>
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Accepts CSV, TSV, or plain text tables</p>
              </div>

              {ledgerError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{ledgerError}</span>
                </div>
              )}

              {ledgerSuccessCount !== null && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Successfully loaded {ledgerSuccessCount} ledger records! Running audit...</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParseLedger}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-xs"
                >
                  Parse & Run Discrepancy Audit
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monthly Base Rent ($)
                  </label>
                  <input
                    type="number"
                    value={baseRent}
                    onChange={(e) => setBaseRent(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Grace Period Days
                  </label>
                  <input
                    type="number"
                    value={graceDays}
                    onChange={(e) => setGraceDays(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Max Late Fee ($)
                  </label>
                  <input
                    type="number"
                    value={lateFee}
                    onChange={(e) => setLateFee(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Lease Agreement Text (Optional - for Clause Explorer)
                </label>
                <textarea
                  value={leaseText}
                  onChange={(e) => setLeaseText(e.target.value)}
                  placeholder="Paste portions of your lease agreement here (rent clauses, late fee terms, authorized utilities)..."
                  className="w-full h-40 p-3 bg-slate-50 border border-slate-300 rounded-xl font-serif text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLease}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-xs"
                >
                  Save Lease Terms & Update Audit
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
