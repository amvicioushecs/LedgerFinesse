import { LedgerCategory } from '../types';

export function categorizeEntry(description: string, type: 'charge' | 'payment' | 'credit'): LedgerCategory {
  const desc = description.toLowerCase();

  if (type === 'payment' || type === 'credit' || desc.includes('payment') || desc.includes('ach') || desc.includes('check')) {
    return 'payment';
  }

  if (desc.includes('rent') || desc.includes('base rent')) {
    return 'rent';
  }

  if (desc.includes('late')) {
    return 'late_fee';
  }

  if (desc.includes('trash') || desc.includes('water') || desc.includes('sewer') || desc.includes('utility') || desc.includes('electric') || desc.includes('gas')) {
    return 'utility';
  }

  if (desc.includes('parking') || desc.includes('carport') || desc.includes('garage')) {
    return 'parking';
  }

  if (desc.includes('pet')) {
    return 'pet';
  }

  if (desc.includes('deposit') || desc.includes('security')) {
    return 'deposit';
  }

  if (desc.includes('admin') || desc.includes('tech') || desc.includes('portal') || desc.includes('convenience') || desc.includes('processing') || desc.includes('fee')) {
    return 'admin_fee';
  }

  return 'other';
}
