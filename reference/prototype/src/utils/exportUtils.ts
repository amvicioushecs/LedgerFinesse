import { LeaseAgreement, LedgerEntry } from '../types';

export function generateDisputeLetter(
  lease: LeaseAgreement,
  flaggedEntries: LedgerEntry[],
  totalDisputedAmount: number
): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const itemizedRows = flaggedEntries
    .filter(e => e.discrepancy)
    .map(e => {
      const disc = e.discrepancy!;
      const clauseRef = disc.leaseClauseTitle || 'Lease Agreement Terms';
      return `• Date: ${e.date} | Description: "${e.description}" | Amount Disputed: $${disc.amountDisputed.toFixed(2)}
  Violation: ${disc.title}
  Authority: ${clauseRef}
  Detail: ${disc.explanation}`;
    })
    .join('\n\n');

  return `NOTICE OF DISPUTED LEDGER CHARGES & DEMAND FOR ACCOUNT RECONCILIATION

DATE: ${today}

TO:
${lease.landlordName}
Management & Accounting Office
Re: Unit ${lease.unitNumber}, ${lease.propertyAddress}

FROM:
${lease.tenantName}
Tenant of Record, Unit ${lease.unitNumber}
${lease.propertyAddress}

SUBJECT: Formal Dispute of Erroneous Ledger Charges and Unlawful Assessments (Total Disputed: $${totalDisputedAmount.toFixed(2)})

Dear Property Management and Accounting Team,

I am writing to formally dispute several inaccurate charges, unauthorized assessments, and accounting discrepancies appearing on my historical tenant ledger for the residential premises located at ${lease.propertyAddress}, Unit ${lease.unitNumber}.

Pursuant to our signed Residential Lease Agreement dated ${lease.leaseStartDate} through ${lease.leaseEndDate}, my obligations and authorized recurring fees are strictly defined. A comprehensive audit comparing my official tenant ledger against the explicit terms and covenants of our lease reveals multiple non-contractual charges, premature penalties, and/or accounting errors totaling $${totalDisputedAmount.toFixed(2)}.

SUMMARY OF CONTRACTUAL STANDARDS:
1. Base Rent: Stipulated at $${lease.monthlyBaseRent.toFixed(2)} per month (due on the ${lease.dueDay}st of each month).
2. Grace Period: Under our lease agreement, payment is timely through the ${lease.gracePeriodDays}th calendar day of each month. Late fees assessed prior to this date violate contractual grace period protections.
3. Maximum Late Fee: Capped at $${(lease.lateFeeFlatAmount || 50).toFixed(2)}.
4. Ancillary & Administrative Fees: The lease agreement contains an integration/entirety clause prohibiting unilateral or uncontracted administrative surcharges, technological convenience fees, or third-party overhead not explicitly agreed upon in writing.

ITEMIZED BREAKDOWN OF DISPUTED LEDGER ENTRIES:

${itemizedRows}

==================================================
TOTAL CHALLENGEABLE OVERCHARGES: $${totalDisputedAmount.toFixed(2)}
==================================================

FORMAL DEMAND FOR RECONCILIATION & RESOLUTION:
Based on the foregoing facts and contractual terms, I hereby formally request:
1. An immediate written adjustment and credit of $${totalDisputedAmount.toFixed(2)} applied to my tenant account balance to restore my ledger to its accurate standing;
2. Removal of all future automated billing for any uncontracted fees; and
3. A corrected, updated ledger statement provided within ten (10) business days of receipt of this notice.

Please note that timely payment of undisputed contractual rent has been maintained in good faith. Under applicable state and local tenant protection statutes, tenants are protected against retaliatory actions, adverse credit reporting, or unlawful notices arising from good-faith disputes of billing inaccuracies.

I look forward to resolving this accounting matter amicably and promptly. Please provide your written confirmation of ledger reconciliation to me at your earliest convenience.

Sincerely,

________________________________________
${lease.tenantName}
Resident, Unit ${lease.unitNumber}
${lease.propertyAddress}
`;
}

export function exportLedgerToCSV(ledger: LedgerEntry[]): void {
  const headers = [
    'Date',
    'Type',
    'Category',
    'Description',
    'Amount',
    'Reported Balance',
    'Computed Balance',
    'Math Drift',
    'Discrepancy Status',
    'Discrepancy Type',
    'Disputed Amount',
    'Lease Clause Ref'
  ];

  const rows = ledger.map(entry => [
    `"${entry.date}"`,
    `"${entry.type}"`,
    `"${entry.category}"`,
    `"${entry.description.replace(/"/g, '""')}"`,
    entry.amount.toFixed(2),
    entry.reportedBalance.toFixed(2),
    entry.computedBalance ? entry.computedBalance.toFixed(2) : '',
    entry.balanceDiscrepancy ? entry.balanceDiscrepancy.toFixed(2) : '0.00',
    entry.discrepancy ? 'FLAGGED' : 'CLEAR',
    entry.discrepancy ? `"${entry.discrepancy.type}"` : '""',
    entry.discrepancy ? entry.discrepancy.amountDisputed.toFixed(2) : '0.00',
    entry.discrepancy?.leaseClauseTitle ? `"${entry.discrepancy.leaseClauseTitle}"` : '""'
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ledgerfinesse_audit_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
