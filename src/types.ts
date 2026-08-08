export interface Pocket {
    id: string;
    name: string;
    allocation: number;
    colorClass: string;
    icon: string;
    isSystem?: boolean;
}

export type TransactionType = 'expense' | 'transfer';

export interface Transaction {
    id: string;
    type: TransactionType;
    fromPocketId?: string;
    toPocketId?: string;
    amount: number;
    timestamp: number;
    note?: string;
    isRollover?: boolean;
    rolloverDate?: string;
}

export const POCKET_IDS = {
    PANGAN: 'pangan',
    KOS: 'kos',
    TRANSPORTASI: 'transportasi',
    LIFESTYLE: 'lifestyle',
    DARURAT: 'darurat',
    SAVING: 'saving',
    LEFTOVER: 'leftover',
} as const;

export const AVAILABLE_ICONS = ['Utensils', 'Home', 'Fuel', 'Coffee', 'ShieldAlert', 'PiggyBank', 'Coins', 'ShoppingBag', 'Gamepad2', 'Heart', 'BookOpen', 'Plane', 'Car', 'Gift', 'Sparkles'];

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

export const DEFAULT_POCKETS: Pocket[] = [
    { id: POCKET_IDS.PANGAN, name: 'Pangan', allocation: 1500000, colorClass: 'bg-[#10B981] text-black', icon: 'Utensils', isSystem: true },
    { id: POCKET_IDS.KOS, name: 'Fixed / Kos', allocation: 1000000, colorClass: 'bg-[#3B82F6] text-white', icon: 'Home', isSystem: true },
    { id: POCKET_IDS.TRANSPORTASI, name: 'Transportasi', allocation: 300000, colorClass: 'bg-[#F59E0B] text-black', icon: 'Fuel', isSystem: true },
    { id: POCKET_IDS.LIFESTYLE, name: 'Lifestyle', allocation: 300000, colorClass: 'bg-[#EF4444] text-white', icon: 'Coffee', isSystem: true },
    { id: POCKET_IDS.DARURAT, name: 'Dana Darurat', allocation: 200000, colorClass: 'bg-[#8B5CF6] text-white', icon: 'ShieldAlert', isSystem: true },
    { id: POCKET_IDS.SAVING, name: 'Tabungan', allocation: 0, colorClass: 'bg-[#EC4899] text-white', icon: 'PiggyBank', isSystem: true },
    { id: POCKET_IDS.LEFTOVER, name: 'Sisa Pangan', allocation: 0, colorClass: 'bg-[#14B8A6] text-white', icon: 'Coins', isSystem: true },
];

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

export function isValidTransaction(t: unknown): t is Transaction {
    if (typeof t !== 'object' || t === null) return false;
    const o = t as Record<string, unknown>;
    return typeof o.id === 'string'
        && (o.type === 'expense' || o.type === 'transfer')
        && typeof o.amount === 'number'
        && Number.isFinite(o.amount)
        && typeof o.timestamp === 'number';
}

export const parseAmount = (str: string): number => {
    const n = parseInt(str, 10);
    return Number.isFinite(n) ? n : 0;
};

export const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.debug('vibrate failed:', e);
        }
    }
};

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

export const hexFromColorClass = (colorClass: string): string => {
    const match = colorClass.match(/#[A-Fa-f0-9]{6}/);
    return match ? match[0] : '#10B981';
};
