export type DiscrepancyType = 
  | 'UNAUTHORIZED_FEE' 
  | 'LATE_FEE_TIMING' 
  | 'LATE_FEE_AMOUNT' 
  | 'LATE_FEE_ON_PAID'
  | 'RENT_OVERCHARGE' 
  | 'DUPLICATE_CHARGE' 
  | 'MATH_BALANCE_ERROR' 
  | 'UNCREDITED_PAYMENT' 
  | 'UTILITY_MARKUP';

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  title: string;
  severity: 'high' | 'medium' | 'low';
  amountDisputed: number;
  explanation: string;
  leaseClauseId?: string;
  leaseClauseTitle?: string;
  leaseRuleCitation?: string;
  suggestedAction: string;
  status: 'active' | 'resolved' | 'dismissed';
}

export type LedgerCategory = 
  | 'rent' 
  | 'late_fee' 
  | 'utility' 
  | 'parking' 
  | 'pet' 
  | 'admin_fee' 
  | 'deposit' 
  | 'payment' 
  | 'other';

export interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: LedgerCategory;
  type: 'charge' | 'payment' | 'credit';
  amount: number; // positive charge or payment
  reportedBalance: number;
  computedBalance?: number;
  balanceDiscrepancy?: number;
  paymentMethod?: string;
  referenceNumber?: string;
  discrepancy?: Discrepancy;
  mappedClauseId?: string;
  tenantNote?: string;
}

export interface LeaseClause {
  id: string;
  sectionNumber: string; // e.g. "Section 3.1"
  title: string;
  category: 'rent' | 'late_fee' | 'utilities' | 'parking' | 'pets' | 'deposit' | 'general';
  stipulatedAmount?: number;
  calculationType?: 'flat' | 'percentage' | 'actual_cost' | 'none';
  gracePeriodDays?: number; // e.g. 5 days (due on 1st, late on 6th)
  dueDayOfMonth?: number; // 1
  ruleText: string;
  fullLegalText: string;
  isAuthorizedFee: boolean; // whether this explicitly authorizes a fee
}

export interface LeaseAgreement {
  id: string;
  title: string;
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
  unitNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyBaseRent: number;
  dueDay: number;
  gracePeriodDays: number;
  lateFeeType: 'flat' | 'percentage' | 'hybrid';
  lateFeeFlatAmount: number;
  lateFeePercentage?: number;
  maxLateFeeCap?: number;
  authorizedUtilities: { name: string; amount: number; isVariable: boolean }[];
  authorizedAddons: { name: string; amount: number }[];
  clauses: LeaseClause[];
  rawAgreementText?: string;
}

export interface PresetCase {
  id: string;
  name: string;
  tagline: string;
  propertySummary: string;
  totalOverchargeExpected: number;
  lease: LeaseAgreement;
  ledger: LedgerEntry[];
}

export interface AuditFilterOptions {
  category: string;
  flaggedOnly: boolean;
  searchQuery: string;
  startDate?: string;
  endDate?: string;
}
