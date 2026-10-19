import React from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, DollarSign, Scale, Clock, Calculator } from 'lucide-react';
import { LeaseAgreement, AuditFilterOptions } from '../types';

interface DiscrepancySummaryProps {
  lease: LeaseAgreement;
  totalDiscrepancyAmount: number;
  totalFlaggedCount: number;
  totalTransactionsCount: number;
  discrepanciesByType: Record<string, { count: number; totalAmount: number }>;
  filterOptions: AuditFilterOptions;
  onFilterChange: (filters: AuditFilterOptions) => void;
  mathDiscrepancyFound: boolean;
  totalMathDrift: number;
}

export const DiscrepancySummary: React.FC<DiscrepancySummaryProps> = ({
  lease,
  totalDiscrepancyAmount,
  totalFlaggedCount,
  totalTransactionsCount,
  discrepanciesByType,
  filterOptions,
  onFilterChange,
  mathDiscrepancyFound,
  totalMathDrift
}) => {
  return (
    <div className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Top Info Bar: Property & Contractual Baseline */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="font-semibold text-slate-900">{lease.propertyAddress}</span>
            <span className="text-slate-300">·</span>
            <span>Tenant: <strong className="text-slate-900">{lease.tenantName}</strong></span>
            <span className="text-slate-300">·</span>
            <span>Landlord: <strong className="text-slate-900">{lease.landlordName}</strong></span>
          </div>

          <div className="flex items-center gap-3 text-slate-600">
            <span>Base Rent: <strong className="text-slate-900 font-mono">${lease.monthlyBaseRent.toFixed(2)}/mo</strong></span>
            <span className="text-slate-300">·</span>
            <span>Grace Period: <strong className="text-slate-900">Through {lease.gracePeriodDays}th</strong></span>
            <span className="text-slate-300">·</span>
            <span>Max Late Fee: <strong className="text-slate-900 font-mono">${(lease.lateFeeFlatAmount || 50).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Primary Metric Banner */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Total Disputed Amount Card */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                Disputed Overcharges
              </span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2">
              <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-950">
                ${totalDiscrepancyAmount.toFixed(2)}
              </div>
              <p className="text-xs text-amber-800 mt-1">
                {totalFlaggedCount} of {totalTransactionsCount} ledger lines questioned
              </p>
            </div>
          </div>

          {/* Unauthorized Surcharges */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Unauthorized Fees
              </span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-slate-900">
                ${(discrepanciesByType['UNAUTHORIZED_FEE']?.totalAmount || 0).toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {discrepanciesByType['UNAUTHORIZED_FEE']?.count || 0} tech, admin or portal charges
              </p>
            </div>
          </div>

          {/* Late Fee Violations */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Late Fee Violations
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-slate-900">
                ${((discrepanciesByType['LATE_FEE_TIMING']?.totalAmount || 0) + (discrepanciesByType['LATE_FEE_AMOUNT']?.totalAmount || 0) + (discrepanciesByType['LATE_FEE_ON_PAID']?.totalAmount || 0)).toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Grace period timing or fee cap breaches
              </p>
            </div>
          </div>

          {/* Math & Duplicate Ledger Discrepancies */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Math Drift & Duplicates
              </span>
              <Calculator className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-slate-900">
                ${((discrepanciesByType['MATH_BALANCE_ERROR']?.totalAmount || 0) + (discrepanciesByType['DUPLICATE_CHARGE']?.totalAmount || 0) + (discrepanciesByType['RENT_OVERCHARGE']?.totalAmount || 0)).toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {mathDiscrepancyFound ? `Running balance drift detected (${totalMathDrift > 0 ? `+$${totalMathDrift.toFixed(2)}` : 'verified'})` : 'Math verified line-by-line'}
              </p>
            </div>
          </div>

        </div>

        {/* Interactive Filter Strip & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-medium text-slate-500 mr-1 hidden sm:inline">Filter View:</span>
            
            <button
              onClick={() => onFilterChange({ ...filterOptions, flaggedOnly: false, category: 'all' })}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                !filterOptions.flaggedOnly && filterOptions.category === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Lines ({totalTransactionsCount})
            </button>

            <button
              onClick={() => onFilterChange({ ...filterOptions, flaggedOnly: true, category: 'all' })}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                filterOptions.flaggedOnly && filterOptions.category === 'all'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Flagged Discrepancies ({totalFlaggedCount})</span>
            </button>

            <button
              onClick={() => onFilterChange({ ...filterOptions, flaggedOnly: false, category: 'late_fee' })}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterOptions.category === 'late_fee'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Late Fees
            </button>

            <button
              onClick={() => onFilterChange({ ...filterOptions, flaggedOnly: false, category: 'admin_fee' })}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterOptions.category === 'admin_fee'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Admin & Tech Fees
            </button>

            <button
              onClick={() => onFilterChange({ ...filterOptions, flaggedOnly: false, category: 'rent' })}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition cursor-pointer ${
                filterOptions.category === 'rent'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Base Rent
            </button>
          </div>

          {/* Quick Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search descriptions or dates..."
              value={filterOptions.searchQuery}
              onChange={(e) => onFilterChange({ ...filterOptions, searchQuery: e.target.value })}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
