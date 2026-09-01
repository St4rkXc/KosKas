/**
 * @module types
 * @description Core domain types, constants, and utility functions for the KosKas
 * pocket-based budgeting system. Defines the Pocket and Transaction interfaces,
 * system pocket identifiers, default configuration, type guards for runtime
 * validation, and formatting helpers.
 */

/** Represents a budget category ("pocket") that holds a monthly allocation. */
export interface Pocket {
    /** Unique identifier (e.g., "pangan", "kos", "pocket_x7k2"). */
    id: string;
    /** Display name shown in the UI. */
    name: string;
    /** Monthly budget allocation in Rupiah. */
    allocation: number;
    /** Tailwind CSS classes for styling (e.g., "bg-[#10B981] text-black"). */
    colorClass: string;
    /** Lucide icon name (e.g., "Utensils", "Home"). */
    icon: string;
    /** Whether this pocket is system-managed and cannot be deleted by the user. */
    isSystem?: boolean;
}

/** Discriminated union for transaction types. */
export type TransactionType = 'expense' | 'transfer';

/** Represents a financial transaction (expense or inter-pocket transfer). */
export interface Transaction {
    /** Unique identifier generated via {@link generateId} or "rollover-YYYY-MM-DD". */
    id: string;
    /** Whether this is an expense or a transfer between pockets. */
    type: TransactionType;
    /** Source pocket ID (present for both expenses and transfers). */
    fromPocketId?: string;
    /** Destination pocket ID (present only for transfers). */
    toPocketId?: string;
    /** Amount in Rupiah (always positive). */
    amount: number;
    /** Unix timestamp in milliseconds, used for sorting and daily grouping. */
    timestamp: number;
    /** Optional user-provided note. */
    note?: string;
    /** True if this is an auto-generated Pangan-to-Leftover rollover. */
    isRollover?: boolean;
    /** Date string "YYYY-MM-DD" used for rollover deduplication. */
    rolloverDate?: string;
}

/**
 * Constant map of system pocket identifiers.
 * All magic-string references to pocket IDs in the store use these constants.
 */
export const POCKET_IDS = {
    PANGAN: 'pangan',
    KOS: 'kos',
    TRANSPORTASI: 'transportasi',
    LIFESTYLE: 'lifestyle',
    DARURAT: 'darurat',
    SAVING: 'saving',
    LEFTOVER: 'leftover',
} as const;

/** Lucide icon names available for custom pocket creation. */
export const AVAILABLE_ICONS = ['Utensils', 'Home', 'Fuel', 'Coffee', 'ShieldAlert', 'PiggyBank', 'Coins', 'ShoppingBag', 'Gamepad2', 'Heart', 'BookOpen', 'Plane', 'Car', 'Gift', 'Sparkles'];

/** Color presets available for custom pocket creation. */
export const AVAILABLE_COLORS = [
    { name: 'Emerald', class: 'bg-[#10B981] text-black' },
    { name: 'Blue', class: 'bg-[#3B82F6] text-white' },
    { name: 'Amber', class: 'bg-[#F59E0B] text-black' },
    { name: 'Red', class: 'bg-[#EF4444] text-white' },
    { name: 'Purple', class: 'bg-[#8B5CF6] text-white' },
    { name: 'Pink', class: 'bg-[#EC4899] text-white' },
    { name: 'Teal', class: 'bg-[#14B8A6] text-white' },
    { name: 'Indigo', class: 'bg-[#6366F1] text-white' },
    { name: 'Orange', class: 'bg-[#F97316] text-black' },
];

/** Default system pockets initialized on first launch. */
export const DEFAULT_POCKETS: Pocket[] = [
    { id: POCKET_IDS.PANGAN, name: 'Pangan', allocation: 1500000, colorClass: 'bg-[#10B981] text-black', icon: 'Utensils', isSystem: true },
    { id: POCKET_IDS.KOS, name: 'Fixed / Kos', allocation: 1000000, colorClass: 'bg-[#3B82F6] text-white', icon: 'Home', isSystem: true },
    { id: POCKET_IDS.TRANSPORTASI, name: 'Transportasi', allocation: 300000, colorClass: 'bg-[#F59E0B] text-black', icon: 'Fuel', isSystem: true },
    { id: POCKET_IDS.LIFESTYLE, name: 'Lifestyle', allocation: 300000, colorClass: 'bg-[#EF4444] text-white', icon: 'Coffee', isSystem: true },
    { id: POCKET_IDS.DARURAT, name: 'Dana Darurat', allocation: 200000, colorClass: 'bg-[#8B5CF6] text-white', icon: 'ShieldAlert', isSystem: true },
    { id: POCKET_IDS.SAVING, name: 'Tabungan', allocation: 0, colorClass: 'bg-[#EC4899] text-white', icon: 'PiggyBank', isSystem: true },
    { id: POCKET_IDS.LEFTOVER, name: 'Sisa Pangan', allocation: 0, colorClass: 'bg-[#14B8A6] text-white', icon: 'Coins', isSystem: true },
];

/**
 * Generate a collision-resistant unique identifier.
 * Uses `crypto.randomUUID()` when available, falls back to `crypto.getRandomValues()`,
 * then to a `Date.now()` + `Math.random()` combination.
 * @returns A unique string ID suitable for transactions and pockets.
 * @example
 * const id = generateId(); // "a1b2c3d4-..."
 */
export function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Runtime type guard that validates whether an unknown value conforms to the {@link Pocket} interface.
 * Used to sanitize data loaded from localStorage or remote sync before use.
 * @param p - The value to validate.
 * @returns `true` if the value is a valid Pocket object.
 * @example
 * const data = JSON.parse(raw);
 * if (isValidPocket(data)) { /* data is typed as Pocket *\/ }
 */
export function isValidPocket(p: unknown): p is Pocket {
    if (typeof p !== 'object' || p === null) return false;
    const o = p as Record<string, unknown>;
    return typeof o.id === 'string'
        && typeof o.name === 'string'
        && typeof o.allocation === 'number'
        && Number.isFinite(o.allocation)
        && typeof o.colorClass === 'string'
        && typeof o.icon === 'string';
}

/**
 * Runtime type guard that validates whether an unknown value conforms to the {@link Transaction} interface.
 * @param t - The value to validate.
 * @returns `true` if the value is a valid Transaction object.
 */
export function isValidTransaction(t: unknown): t is Transaction {
    if (typeof t !== 'object' || t === null) return false;
    const o = t as Record<string, unknown>;
    return typeof o.id === 'string'
        && (o.type === 'expense' || o.type === 'transfer')
        && typeof o.amount === 'number'
        && Number.isFinite(o.amount)
        && typeof o.timestamp === 'number';
}

/**
 * Parse a string into an integer amount. Returns 0 if the string is not a valid number.
 * @param str - The string to parse (typically from keypad input).
 * @returns The parsed integer, or 0 if parsing fails.
 * @example
 * parseAmount("150000") // 150000
 * parseAmount("abc")    // 0
 */
export const parseAmount = (str: string): number => {
    const n = parseInt(str, 10);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Trigger haptic feedback on supported mobile devices.
 * Silently fails on unsupported browsers or environments.
 * @param pattern - Vibration pattern: a single duration (ms) or an array of on/off durations.
 * @example
 * vibrate(10);          // Short buzz
 * vibrate([30, 50, 30]); // Double buzz pattern
 */
export const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.debug('vibrate failed:', e);
        }
    }
};

/**
 * Format a number as Indonesian Rupiah currency string using `Intl.NumberFormat`.
 * Handles negative amounts by prepending a minus sign.
 * @param amount - The numeric amount to format.
 * @returns Formatted string like "Rp 1.500.000" or "-Rp 50.000".
 * @example
 * formatRupiah(1500000)  // "Rp 1.500.000"
 * formatRupiah(-50000)   // "-Rp 50.000"
 * formatRupiah(NaN)      // "Rp 0"
 */
export const formatRupiah = (amount: number) => {
    if (amount === undefined || amount === null || !Number.isFinite(amount)) return 'Rp 0';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(absAmount);
    return isNegative ? `-${formatted}` : formatted;
};

/**
 * Extract a hex color code from a Tailwind CSS class string.
 * Falls back to "#10B981" (emerald) if no hex code is found.
 * @param colorClass - A Tailwind class string like "bg-[#10B981] text-black".
 * @returns The extracted hex color (e.g., "#10B981") or the fallback "#10B981".
 * @example
 * hexFromColorClass("bg-[#EF4444] text-white") // "#EF4444"
 * hexFromColorClass("no-color-here")            // "#10B981"
 */
export const hexFromColorClass = (colorClass: string): string => {
    const match = colorClass.match(/#[A-Fa-f0-9]{6}/);
    return match ? match[0] : '#10B981';
};
