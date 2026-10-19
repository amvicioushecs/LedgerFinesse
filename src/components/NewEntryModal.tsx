import React, { useState } from 'react';
import { X, PlusCircle } from 'lucide-react';
import { LedgerCategory, LedgerEntry } from '../types';
import { categorizeEntry } from '../utils/categorization';

interface NewEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEntry: (entry: LedgerEntry) => void;
  lastBalance: number;
}

export const NewEntryModal: React.FC<NewEntryModalProps> = ({
  isOpen,
  onClose,
  onAddEntry,
  lastBalance
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LedgerCategory>('rent');
  const [type, setType] = useState<'charge' | 'payment' | 'credit'>('charge');
  const [amount, setAmount] = useState('');
  const [reportedBalance, setReportedBalance] = useState('');

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    setCategory(categorizeEntry(val, type));
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount) || 0;
    const computedReported = reportedBalance 
      ? parseFloat(reportedBalance) 
      : (type === 'charge' ? lastBalance + amt : lastBalance - amt);

    const newEntry: LedgerEntry = {
      id: `manual-entry-${Date.now()}`,
      date,
      description: description.trim() || 'Manual Ledger Entry',
      category,
      type,
      amount: amt,
      reportedBalance: computedReported,
      computedBalance: computedReported
    };

    onAddEntry(newEntry);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">Add Ledger Entry</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Transaction Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              required
              placeholder="e.g. Monthly Rent, Late Fee, Tech Portal Fee, ACH Payment"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as 'charge' | 'payment' | 'credit';
                  setType(newType);
                  setCategory(categorizeEntry(description, newType));
                }}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="charge">Charge (+)</option>
                <option value="payment">Payment (-)</option>
                <option value="credit">Credit (-)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="rent">Base Rent</option>
                <option value="late_fee">Late Fee</option>
                <option value="utility">Utility / Trash</option>
                <option value="admin_fee">Admin / Tech Fee</option>
                <option value="parking">Parking</option>
                <option value="pet">Pet Fee</option>
                <option value="payment">Payment</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="1850.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reported Balance ($)
                <span className="text-[10px] text-slate-400 ml-1">(Optional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={amount ? (type === 'charge' ? (lastBalance + parseFloat(amount || '0')).toFixed(2) : (lastBalance - parseFloat(amount || '0')).toFixed(2)) : '1850.00'}
                value={reportedBalance}
                onChange={(e) => setReportedBalance(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-xs"
            >
              Add & Audit
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
