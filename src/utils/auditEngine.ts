import { LedgerEntry, LeaseAgreement, Discrepancy } from '../types';

export interface AuditResults {
  auditedLedger: LedgerEntry[];
  totalDiscrepancyAmount: number;
  totalFlaggedEntries: number;
  discrepanciesByType: Record<string, { count: number; totalAmount: number }>;
  mathDiscrepancyFound: boolean;
  totalMathDrift: number;
}

export function runFullAudit(
  rawLedger: LedgerEntry[],
  lease: LeaseAgreement
): AuditResults {
  // Sort chronologically
  const sorted = [...rawLedger].sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    // charges before payments on same day
    if (a.type === 'charge' && b.type !== 'charge') return -1;
    if (a.type !== 'charge' && b.type === 'charge') return 1;
    return 0;
  });

  let runningBalance = 0;
  const auditedLedger: LedgerEntry[] = [];
  const discrepanciesByType: Record<string, { count: number; totalAmount: number }> = {};
  let totalDiscrepancyAmount = 0;
  let totalFlaggedEntries = 0;
  let totalMathDrift = 0;
  let mathDiscrepancyFound = false;

  // Track monthly counts for duplicate detection: e.g. "2024-03_trash" -> count
  const monthlyChargeCounts = new Map<string, number>();

  // Find relevant lease clauses for linking
  const rentClause = lease.clauses.find(c => c.category === 'rent');
  const lateFeeClause = lease.clauses.find(c => c.category === 'late_fee');
  const generalFeeClause = lease.clauses.find(c => !c.isAuthorizedFee) || lease.clauses.find(c => c.category === 'general');

  for (let i = 0; i < sorted.length; i++) {
    const entry = { ...sorted[i] };
    const monthKey = entry.date.slice(0, 7); // YYYY-MM
    const day = parseInt(entry.date.slice(8, 10), 10);

    // 1. Math balance computation
    if (entry.type === 'charge') {
      runningBalance = Math.round((runningBalance + entry.amount) * 100) / 100;
    } else {
      runningBalance = Math.round((runningBalance - entry.amount) * 100) / 100;
    }

    entry.computedBalance = runningBalance;
    const balanceDiff = Math.abs(entry.reportedBalance - runningBalance);

    if (balanceDiff >= 0.05) {
      entry.balanceDiscrepancy = Math.round((entry.reportedBalance - runningBalance) * 100) / 100;
      mathDiscrepancyFound = true;
      totalMathDrift = Math.max(totalMathDrift, Math.abs(entry.balanceDiscrepancy));
    }

    // Existing or computed discrepancy
    let disc: Discrepancy | undefined = entry.discrepancy;

    const descLower = entry.description.toLowerCase();

    // 2. Check Base Rent Overcharge
    if (entry.category === 'rent' || descLower.includes('base rent') || descLower.includes('monthly rent')) {
      if (rentClause) {
        entry.mappedClauseId = rentClause.id;
      }
      if (entry.amount > lease.monthlyBaseRent + 0.01) {
        const overcharge = Math.round((entry.amount - lease.monthlyBaseRent) * 100) / 100;
        disc = {
          id: `disc-rent-${entry.id}`,
          type: 'RENT_OVERCHARGE',
          title: `Base Rent Overcharge (+$${overcharge.toFixed(2)})`,
          severity: 'high',
          amountDisputed: overcharge,
          leaseClauseId: rentClause?.id,
          leaseClauseTitle: rentClause?.sectionNumber ? `${rentClause.sectionNumber}: ${rentClause.title}` : 'Base Rent Clause',
          leaseRuleCitation: `Contractual base rent is $${lease.monthlyBaseRent.toFixed(2)}/month.`,
          explanation: `Billed $${entry.amount.toFixed(2)} which exceeds the contracted monthly rate of $${lease.monthlyBaseRent.toFixed(2)} by $${overcharge.toFixed(2)}.`,
          suggestedAction: `Request credit of $${overcharge.toFixed(2)} back to tenant ledger.`,
          status: 'active'
        };
      }
    }

    // 3. Check Late Fee Violations (Timing & Amount)
    if (entry.category === 'late_fee' || descLower.includes('late fee') || descLower.includes('late charge')) {
      if (lateFeeClause) {
        entry.mappedClauseId = lateFeeClause.id;
      }
      
      const isDuringGracePeriod = day <= lease.gracePeriodDays;
      const exceedsMaxFee = entry.amount > (lease.lateFeeFlatAmount || 50.00);

      if (isDuringGracePeriod || exceedsMaxFee) {
        const maxAllowed = lease.lateFeeFlatAmount || 50.00;
        const excess = Math.max(0, entry.amount - maxAllowed);
        
        let title = '';
        let explanation = '';
        let amountToDispute = entry.amount;

        if (isDuringGracePeriod) {
          title = `Late Fee Assessed During Grace Period ($${entry.amount.toFixed(2)})`;
          explanation = `Assessed on day ${day} of the month, but Lease grants a grace period through day ${lease.gracePeriodDays}. Tenant was not past due.`;
        } else if (exceedsMaxFee) {
          title = `Late Fee Exceeds Contractual Cap (+$${excess.toFixed(2)} Over)`;
          explanation = `Billed $${entry.amount.toFixed(2)}, which exceeds the lease maximum late fee of $${maxAllowed.toFixed(2)}.`;
          amountToDispute = excess;
        }

        disc = {
          id: `disc-late-${entry.id}`,
          type: isDuringGracePeriod ? 'LATE_FEE_TIMING' : 'LATE_FEE_AMOUNT',
          title,
          severity: 'high',
          amountDisputed: amountToDispute,
          leaseClauseId: lateFeeClause?.id,
          leaseClauseTitle: lateFeeClause?.sectionNumber ? `${lateFeeClause.sectionNumber}: ${lateFeeClause.title}` : 'Late Charges',
          leaseRuleCitation: `Grace period runs through day ${lease.gracePeriodDays} of month; maximum fee is $${maxAllowed.toFixed(2)}.`,
          explanation,
          suggestedAction: isDuringGracePeriod ? 'Demand 100% reversal and cancellation of late fee.' : `Demand refund of $${excess.toFixed(2)} overcharge.`,
          status: 'active'
        };
      }
    }

    // 4. Check Unauthorized Fees (Portal, Tech, Admin, Storage, Locker, Concierge)
    const isSuspiciousAdminFee = 
      entry.category === 'admin_fee' ||
      descLower.includes('portal') ||
      descLower.includes('tech') ||
      descLower.includes('admin') ||
      descLower.includes('convenience') ||
      descLower.includes('processing') ||
      descLower.includes('concierge') ||
      descLower.includes('file fee');

    if (isSuspiciousAdminFee && !disc) {
      // Check if explicitly authorized in lease
      const authorizedInLease = lease.clauses.some(c => 
        c.isAuthorizedFee && c.ruleText.toLowerCase().includes(entry.description.toLowerCase().slice(0, 10))
      );

      if (!authorizedInLease) {
        disc = {
          id: `disc-admin-${entry.id}`,
          type: 'UNAUTHORIZED_FEE',
          title: `Unauthorized Fee: ${entry.description} ($${entry.amount.toFixed(2)})`,
          severity: 'high',
          amountDisputed: entry.amount,
          leaseClauseId: generalFeeClause?.id,
          leaseClauseTitle: generalFeeClause?.sectionNumber ? `${generalFeeClause.sectionNumber}: ${generalFeeClause.title}` : 'Prohibition of Unilateral Fees',
          leaseRuleCitation: 'No clause in the lease agreement authorizes this recurring or one-time charge.',
          explanation: `Landlord added "${entry.description}" for $${entry.amount.toFixed(2)}. This charge does not appear anywhere in the signed lease contract.`,
          suggestedAction: `Demand full credit of $${entry.amount.toFixed(2)} and removal of future recurring assessments.`,
          status: 'active'
        };
        if (generalFeeClause) {
          entry.mappedClauseId = generalFeeClause.id;
        }
      }
    }

    // 5. Check Duplicate Charges in same month
    if (entry.type === 'charge' && !disc) {
      const chargeSignature = `${monthKey}_${entry.category}_${entry.amount}`;
      const count = (monthlyChargeCounts.get(chargeSignature) || 0) + 1;
      monthlyChargeCounts.set(chargeSignature, count);

      if (count > 1 && (entry.category === 'utility' || entry.category === 'parking' || entry.category === 'rent')) {
        disc = {
          id: `disc-dup-${entry.id}`,
          type: 'DUPLICATE_CHARGE',
          title: `Duplicate Billing in Same Period: ${entry.description} ($${entry.amount.toFixed(2)})`,
          severity: 'medium',
          amountDisputed: entry.amount,
          explanation: `This service/charge appears ${count} times in ${monthKey}. Contracts generally permit single monthly billing for this category.`,
          suggestedAction: `Credit back duplicate $${entry.amount.toFixed(2)} charge.`,
          status: 'active'
        };
      }
    }

    // 6. Running Math Error Discrepancy
    if (entry.balanceDiscrepancy && Math.abs(entry.balanceDiscrepancy) >= 5 && !disc) {
      disc = {
        id: `disc-math-${entry.id}`,
        type: 'MATH_BALANCE_ERROR',
        title: `Arithmetic Drift in Running Balance ($${Math.abs(entry.balanceDiscrepancy).toFixed(2)})`,
        severity: 'high',
        amountDisputed: Math.abs(entry.balanceDiscrepancy),
        explanation: `Reported balance ($${entry.reportedBalance.toFixed(2)}) does not match mathematical tally ($${runningBalance.toFixed(2)}). An unlisted charge or incorrect carryover altered the total.`,
        suggestedAction: 'Require management accounting reconciliation to restore true mathematical balance.',
        status: 'active'
      };
    }

    if (disc) {
      entry.discrepancy = disc;
      totalDiscrepancyAmount = Math.round((totalDiscrepancyAmount + disc.amountDisputed) * 100) / 100;
      totalFlaggedEntries++;

      const key = disc.type;
      if (!discrepanciesByType[key]) {
        discrepanciesByType[key] = { count: 0, totalAmount: 0 };
      }
      discrepanciesByType[key].count++;
      discrepanciesByType[key].totalAmount = Math.round((discrepanciesByType[key].totalAmount + disc.amountDisputed) * 100) / 100;
    }

    auditedLedger.push(entry);
  }

  return {
    auditedLedger,
    totalDiscrepancyAmount,
    totalFlaggedEntries,
    discrepanciesByType,
    mathDiscrepancyFound,
    totalMathDrift
  };
}
