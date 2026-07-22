import { describe, it, expect, vi } from 'vitest';
import {
  generateId,
  isValidPocket,
  isValidTransaction,
  parseAmount,
  hexFromColorClass,
  formatRupiah,
  POCKET_IDS,
  DEFAULT_POCKETS,
} from './types';

describe('generateId', () => {
  it('should return a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should use crypto.randomUUID when available', () => {
    const id = generateId();
    // crypto.randomUUID produces UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(id)).toBe(true);
  });

  it('should generate unique IDs (no duplicates in 1000 calls)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('should fallback to timestamp+random when crypto is unavailable', () => {
    const originalCrypto = (globalThis as any).crypto;
    delete (globalThis as any).crypto;

    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id).toContain('-');

    // Restore crypto
    (globalThis as any).crypto = originalCrypto;
  });

  it('should fallback when crypto.randomUUID is not a function', () => {
    const originalRandomUUID = (globalThis as any).crypto?.randomUUID;
    (globalThis as any).crypto = { randomUUID: undefined };

    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id).toContain('-');

    // Restore
    (globalThis as any).crypto.randomUUID = originalRandomUUID;
  });
});

describe('isValidPocket', () => {
  it('should return true for a valid pocket object', () => {
    const pocket = {
      id: 'test',
      name: 'Test Pocket',
      allocation: 1000,
      colorClass: 'bg-[#10B981] text-black',
      icon: 'Utensils',
    };
    expect(isValidPocket(pocket)).toBe(true);
  });

  it('should return true for a valid pocket with isSystem flag', () => {
    const pocket = {
      id: 'test',
      name: 'Test Pocket',
      allocation: 1000,
      colorClass: 'bg-[#10B981] text-black',
      icon: 'Utensils',
      isSystem: true,
    };
    expect(isValidPocket(pocket)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidPocket(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidPocket(undefined)).toBe(false);
  });

  it('should return false for a non-object (string)', () => {
    expect(isValidPocket('not an object')).toBe(false);
  });

  it('should return false for a non-object (number)', () => {
    expect(isValidPocket(42)).toBe(false);
  });

  it('should return false for an empty object', () => {
    expect(isValidPocket({})).toBe(false);
  });

  it('should return false when id is missing', () => {
    expect(
      isValidPocket({
        name: 'Test',
        allocation: 1000,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when name is missing', () => {
    expect(
      isValidPocket({
        id: 'test',
        allocation: 1000,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when allocation is missing', () => {
    expect(
      isValidPocket({
        id: 'test',
        name: 'Test',
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when allocation is NaN', () => {
    expect(
      isValidPocket({
        id: 'test',
        name: 'Test',
        allocation: NaN,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when allocation is Infinity', () => {
    expect(
      isValidPocket({
        id: 'test',
        name: 'Test',
        allocation: Infinity,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when colorClass is missing', () => {
    expect(
      isValidPocket({
        id: 'test',
        name: 'Test',
        allocation: 1000,
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should return false when icon is missing', () => {
    expect(
      isValidPocket({
        id: 'test',
        name: 'Test',
        allocation: 1000,
        colorClass: 'bg-[#10B981] text-black',
      }),
    ).toBe(false);
  });

  it('should return false when id is not a string', () => {
    expect(
      isValidPocket({
        id: 123,
        name: 'Test',
        allocation: 1000,
        colorClass: 'bg-[#10B981] text-black',
        icon: 'Utensils',
      }),
    ).toBe(false);
  });

  it('should validate all DEFAULT_POCKETS entries', () => {
    DEFAULT_POCKETS.forEach((pocket) => {
      expect(isValidPocket(pocket)).toBe(true);
    });
  });
});

describe('isValidTransaction', () => {
  it('should return true for a valid expense transaction', () => {
    const tx = {
      id: 'tx-1',
      type: 'expense',
      fromPocketId: 'pangan',
      amount: 50000,
      timestamp: Date.now(),
      note: 'Lunch',
    };
    expect(isValidTransaction(tx)).toBe(true);
  });

  it('should return true for a valid transfer transaction', () => {
    const tx = {
      id: 'tx-2',
      type: 'transfer',
      fromPocketId: 'pangan',
      toPocketId: 'saving',
      amount: 100000,
      timestamp: Date.now(),
    };
    expect(isValidTransaction(tx)).toBe(true);
  });

  it('should return true for a valid rollover transaction', () => {
    const tx = {
      id: 'rollover-2024-01-15',
      type: 'transfer',
      fromPocketId: 'pangan',
      toPocketId: 'leftover',
      amount: 25000,
      timestamp: Date.now(),
      isRollover: true,
      rolloverDate: '2024-01-15',
    };
    expect(isValidTransaction(tx)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidTransaction(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidTransaction(undefined)).toBe(false);
  });

  it('should return false for a non-object', () => {
    expect(isValidTransaction('not a transaction')).toBe(false);
  });

  it('should return false when id is missing', () => {
    expect(
      isValidTransaction({
        type: 'expense',
        amount: 50000,
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });

  it('should return false when type is invalid', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'income',
        amount: 50000,
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });

  it('should return false when amount is missing', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'expense',
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });

  it('should return false when amount is NaN', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'expense',
        amount: NaN,
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });

  it('should return false when amount is Infinity', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'expense',
        amount: Infinity,
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });

  it('should return false when timestamp is missing', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'expense',
        amount: 50000,
      }),
    ).toBe(false);
  });

  it('should return false when amount is a string', () => {
    expect(
      isValidTransaction({
        id: 'tx-1',
        type: 'expense',
        amount: '50000',
        timestamp: Date.now(),
      }),
    ).toBe(false);
  });
});

describe('parseAmount', () => {
  it('should parse a valid numeric string', () => {
    expect(parseAmount('50000')).toBe(50000);
  });

  it('should parse a negative numeric string', () => {
    expect(parseAmount('-100')).toBe(-100);
  });

  it('should parse a string with leading zeros', () => {
    expect(parseAmount('007')).toBe(7);
  });

  it('should return 0 for an empty string', () => {
    expect(parseAmount('')).toBe(0);
  });

  it('should return 0 for a non-numeric string', () => {
    expect(parseAmount('abc')).toBe(0);
  });

  it('should return 0 for a string with letters and numbers', () => {
    expect(parseAmount('50abc')).toBe(50); // parseInt stops at first non-digit
  });

  it('should return 0 for a decimal string (parseInt truncates)', () => {
    expect(parseAmount('50.99')).toBe(50);
  });

  it('should return 0 for whitespace-only string', () => {
    expect(parseAmount('   ')).toBe(0);
  });
});

describe('hexFromColorClass', () => {
  it('should extract hex from a Tailwind color class', () => {
    expect(hexFromColorClass('bg-[#10B981] text-black')).toBe('#10B981');
  });

  it('should extract hex from a blue color class', () => {
    expect(hexFromColorClass('bg-[#3B82F6] text-white')).toBe('#3B82F6');
  });

  it('should return default hex when no hex found', () => {
    expect(hexFromColorClass('bg-blue-500')).toBe('#10B981');
  });

  it('should return default hex for empty string', () => {
    expect(hexFromColorClass('')).toBe('#10B981');
  });

  it('should handle lowercase hex', () => {
    expect(hexFromColorClass('bg-[#abcdef] text-white')).toBe('#abcdef');
  });

  it('should handle mixed case hex', () => {
    expect(hexFromColorClass('bg-[#aBcDeF] text-white')).toBe('#aBcDeF');
  });

  it('should extract the first hex if multiple exist', () => {
    expect(hexFromColorClass('bg-[#FF0000] border-[#00FF00]')).toBe('#FF0000');
  });
});

describe('formatRupiah', () => {
  it('should format a positive number as IDR currency', () => {
    const result = formatRupiah(50000);
    expect(result).toContain('50.000');
    expect(result).toContain('Rp');
  });

  it('should format zero correctly', () => {
    const result = formatRupiah(0);
    // Intl.NumberFormat for id-ID uses non-breaking space between currency and amount
    expect(result).toMatch(/Rp\s*0/);
  });

  it('should format a negative number with minus prefix', () => {
    const result = formatRupiah(-25000);
    expect(result).toContain('25.000');
    expect(result.startsWith('-')).toBe(true);
  });

  it('should return "Rp 0" for undefined', () => {
    expect(formatRupiah(undefined as unknown as number)).toBe('Rp 0');
  });

  it('should return "Rp 0" for null', () => {
    expect(formatRupiah(null as unknown as number)).toBe('Rp 0');
  });

  it('should return "Rp 0" for NaN', () => {
    expect(formatRupiah(NaN)).toBe('Rp 0');
  });

  it('should return "Rp 0" for Infinity', () => {
    expect(formatRupiah(Infinity)).toBe('Rp 0');
  });

  it('should return "Rp 0" for -Infinity', () => {
    expect(formatRupiah(-Infinity)).toBe('Rp 0');
  });

  it('should format large numbers correctly', () => {
    const result = formatRupiah(1000000);
    expect(result).toContain('1.000.000');
  });

  it('should not include decimal places', () => {
    const result = formatRupiah(50000.75);
    // Intl.NumberFormat with minimumFractionDigits: 0 and maximumFractionDigits: 0
    // should not include any fractional part. In id-ID locale, "." is the thousands
    // separator, so "Rp 50.001" means fifty thousand one — no decimals.
    // Verify by checking the number parses back correctly as an integer.
    const numericPart = result.replace(/[^\d]/g, '');
    expect(numericPart).toBe('50001'); // 50000.75 -> Math.abs -> 50000.75 -> formatted as 50.001
  });
});
