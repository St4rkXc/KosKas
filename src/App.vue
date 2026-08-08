<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
    Settings,
    RefreshCw,
    Trash2,
    Plus,
    ArrowLeftRight,
    BarChart3,
    LayoutGrid,
    TrendingUp,
    TrendingDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    LogOut,
} from "lucide-vue-next";
import KeypadModal from "./components/KeypadModal.vue";
import PocketSettingsModal from "./components/PocketSettingsModal.vue";
import TransferModal from "./components/TransferModal.vue";
import { useStore } from "./store";
import { formatRupiah, vibrate, hexFromColorClass, POCKET_IDS } from "./types";
import { resolveIcon } from "./iconMap";
import { useAuth } from "./composables/useAuth";

const store = useStore();
const { user: authUser, loading: authLoading, signIn, signUp, signInWithGoogle, signOut } = useAuth();
const showHistory = ref(false);
const showPerformance = ref(false);
const isKeypadOpen = ref(false);
const isPocketSettingsOpen = ref(false);
const isTransferOpen = ref(false);

const selectedMonth = ref(new Date());
const email = ref('');
const password = ref('');
const authError = ref('');
const isSignUp = ref(false);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleAuth() {
    authError.value = '';
    const trimmedEmail = email.value.trim();
    if (!emailRegex.test(trimmedEmail)) {
        authError.value = 'Please enter a valid email address.';
        return;
    }
    try {
        if (isSignUp.value) {
            await signUp(trimmedEmail, password.value);
        } else {
            await signIn(trimmedEmail, password.value);
        }
    } catch (e: any) {
        const msg = e?.message || 'Authentication failed';
        if (msg.includes('Invalid login credentials')) {
            authError.value = 'Invalid email or password.';
        } else if (msg.includes('User already registered')) {
            authError.value = 'An account with this email already exists.';
        } else if (msg.includes('Email not confirmed')) {
            authError.value = 'Please confirm your email address before signing in.';
        } else {
            authError.value = 'An unexpected error occurred. Please try again.';
            console.error('Auth error:', e);
        }
    }
}

async function handleGoogleAuth() {
    authError.value = '';
    try {
        await signInWithGoogle();
    } catch (e: any) {
        authError.value = e?.message || 'Google sign-in failed.';
    }
}

const pocketMap = computed(() => {
    const map: Record<string, (typeof store.pockets)[number] & { hexColor: string }> = {};
    for (const p of store.pockets) {
        map[p.id] = { ...p, hexColor: hexFromColorClass(p.colorClass) };
    }
    return map;
});

const getPocket = (id: string | undefined) => (id ? pocketMap.value[id] : undefined);

onMounted(() => {
    store.loadFromStorage();
});

const daysRemaining = computed(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return daysInMonth - now.getDate() + 1;
});

const pocketStats = computed(() => {
    const spent: Record<string, number> = {};
    for (const p of store.pockets) spent[p.id] = 0;

    for (const t of store.transactions) {
        if (t.type === "expense" && t.fromPocketId && t.fromPocketId in spent) {
            spent[t.fromPocketId] += t.amount;
        }
    }

    const stats: Record<string, { spent: number; remaining: number; percentage: number; isOver: boolean }> = {};
    for (const pocket of store.pockets) {
        const s = spent[pocket.id];
        const remaining = store.pocketBalances[pocket.id] || 0;
        stats[pocket.id] = {
            spent: s,
            remaining,
            percentage: pocket.allocation > 0 ? Math.min((s / pocket.allocation) * 100, 100) : 0,
            isOver: remaining < 0,
        };
    }
    return stats;
});

const monthlyPerformance = computed(() => {
    const txs = selectedMonthTransactions.value;
    const prevTxs = previousMonthTransactions.value;

    const spentMap: Record<string, number> = {};
    const prevSpentMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    const prevCountMap: Record<string, number> = {};

    for (const p of store.pockets) {
        spentMap[p.id] = 0;
        prevSpentMap[p.id] = 0;
        countMap[p.id] = 0;
        prevCountMap[p.id] = 0;
    }

    for (const t of txs) {
        if (t.type === "expense" && t.fromPocketId && t.fromPocketId in spentMap) {
            spentMap[t.fromPocketId] += t.amount;
            countMap[t.fromPocketId]++;
        }
    }
    for (const t of prevTxs) {
        if (t.type === "expense" && t.fromPocketId && t.fromPocketId in prevSpentMap) {
            prevSpentMap[t.fromPocketId] += t.amount;
            prevCountMap[t.fromPocketId]++;
        }
    }

    const performance = store.pockets.map((pocket) => {
        const spent = spentMap[pocket.id];
        const transactionCount = countMap[pocket.id];
        const remaining = pocket.allocation - spent;
        const utilization = pocket.allocation > 0 ? (spent / pocket.allocation) * 100 : 0;
        const isOver = remaining < 0;

        const prevSpent = prevSpentMap[pocket.id];
        const spendingChange = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : spent > 0 ? 100 : 0;
        const isBoros = spent > prevSpent;

        return {
            id: pocket.id,
            name: pocket.name,
            icon: pocket.icon,
            colorClass: pocket.colorClass,
            allocation: pocket.allocation,
            spent,
            prevSpent,
            remaining,
            utilization,
            isOver,
            transactionCount,
            spendingChange: Math.abs(spendingChange),
            isBoros,
        };
    });

    performance.sort((a, b) => b.utilization - a.utilization);

    const totalSpent = performance.reduce((sum, p) => sum + p.spent, 0);
    const totalAllocation = performance.reduce((sum, p) => sum + p.allocation, 0);
    const overallUtilization = totalAllocation > 0 ? (totalSpent / totalAllocation) * 100 : 0;
    const mostUsedPocket = performance[0] || null;
    const leastUsedPocket = performance[performance.length - 1] || null;

    const prevTotalSpent = performance.reduce((sum, p) => sum + p.prevSpent, 0);
    const totalSpendingChange = prevTotalSpent > 0 ? ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100 : totalSpent > 0 ? 100 : 0;
    const isOverallBoros = totalSpent > prevTotalSpent;

    return {
        pockets: performance,
        totalSpent,
        prevTotalSpent,
        totalAllocation,
        overallUtilization,
        mostUsedPocket,
        leastUsedPocket,
        totalSpendingChange: Math.abs(totalSpendingChange),
        isOverallBoros,
    };
});

const dailyPanganStats = computed(() => {
    const panganPocket = store.pockets.find((p) => p.id === POCKET_IDS.PANGAN);
    const panganAllocation = panganPocket ? panganPocket.allocation : 1500000;

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const dailyTarget = Math.floor(panganAllocation / daysInMonth);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let spentToday = 0;
    for (const t of store.transactions) {
        if (t.type === "expense" && t.fromPocketId === POCKET_IDS.PANGAN && t.timestamp >= todayStart) {
            spentToday += t.amount;
        }
    }

    return {
        dailyTarget,
        remainingToday: dailyTarget - spentToday,
        spentToday,
    };
});

function handleAddExpense(pocketId: string, amount: number) {
    store.addExpense(pocketId, amount);
}

function handleReset() {
    if (window.confirm("Yakin ingin reset bulan ini? Semua data pengeluaran dan transfer akan hilang.")) {
        store.resetMonth();
    }
}

function removeTransaction(id: string) {
    vibrate([20, 20]);
    store.removeTransaction(id);
}

const currentDateStr = computed(() => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
});

function getMonthStart(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function getMonthEnd(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

function getTransactionsForMonth(date: Date) {
    const start = getMonthStart(date);
    const end = getMonthEnd(date);
    return store.transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
}

function getPreviousMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function getNextMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function isCurrentMonth(date: Date): boolean {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

const selectedMonthName = computed(() => {
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${months[selectedMonth.value.getMonth()]} ${selectedMonth.value.getFullYear()}`;
});

const selectedMonthTransactions = computed(() => getTransactionsForMonth(selectedMonth.value));

const previousMonthTransactions = computed(() => getTransactionsForMonth(getPreviousMonth(selectedMonth.value)));

const nowDate = computed(() => new Date());

function formatDateTime(timestamp: number) {
    const date = new Date(timestamp);
    const now = nowDate.value;

    const isToday = date.getDate() === now.getDate() &&
                    date.getMonth() === now.getMonth() &&
                    date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
                        date.getMonth() === yesterday.getMonth() &&
                        date.getFullYear() === yesterday.getFullYear();

    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    if (isToday) {
        return `Hari ini, ${timeStr}`;
    } else if (isYesterday) {
        return `Kemarin, ${timeStr}`;
    } else {
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${date.getDate()} ${monthsShort[date.getMonth()]}, ${timeStr}`;
    }
}
</script>

<template>
    <div v-if="authLoading" class="min-h-screen bg-bg-primary text-text-primary"></div>

    <div v-else-if="!authUser" class="min-h-screen bg-bg-primary flex items-center justify-center p-4 select-none">
        <div class="bg-bg-surface p-8 rounded-sm w-full max-w-sm space-y-6">
            <h1 class="font-mono text-2xl text-text-primary font-bold text-center">KosKas</h1>
            <p class="text-text-muted text-sm text-center">Sign in to sync your data</p>

            <div class="space-y-3">
                <input
                    v-model="email"
                    type="email"
                    placeholder="Email"
                    autocomplete="email"
                    class="w-full bg-bg-primary border border-[#2A2A2A] rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-neon-safe"
                />
                <input
                    v-model="password"
                    type="password"
                    placeholder="Password"
                    :autocomplete="isSignUp ? 'new-password' : 'current-password'"
                    class="w-full bg-bg-primary border border-[#2A2A2A] rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-neon-safe"
                    @keyup.enter="handleAuth"
                />
                <p v-if="authError" class="text-neon-danger text-xs">{{ authError }}</p>
            </div>

            <div class="flex gap-3">
                <button
                    @click="isSignUp = false; handleAuth()"
                    :class="['flex-1 py-3 rounded-sm font-bold transition-opacity', isSignUp ? 'bg-[#1E1E1E] text-text-muted' : 'bg-neon-safe text-bg-primary hover:opacity-90']"
                >
                    Sign In
                </button>
                <button
                    @click="isSignUp = true; handleAuth()"
                    :class="['flex-1 py-3 rounded-sm font-bold transition-colors', isSignUp ? 'bg-neon-safe text-bg-primary hover:opacity-90' : 'bg-[#1E1E1E] text-text-primary hover:bg-[#2A2A2A]']"
                >
                    Sign Up
                </button>
            </div>

            <div class="relative">
                <div class="absolute inset-0 flex items-center">
                    <div class="w-full border-t border-[#2A2A2A]"></div>
                </div>
                <div class="relative flex justify-center text-xs">
                    <span class="bg-bg-surface px-2 text-text-muted">or</span>
                </div>
            </div>

            <button
                @click="handleGoogleAuth"
                class="w-full flex items-center justify-center gap-3 bg-[#1E1E1E] border border-[#2A2A2A] text-text-primary py-3 rounded-sm font-bold hover:bg-[#2A2A2A] transition-colors"
            >
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
            </button>
        </div>
    </div>

    <div v-else-if="!store.isLoaded" class="min-h-screen bg-bg-primary text-text-primary"></div>

    <div v-else class="w-full min-h-screen bg-bg-primary text-text-primary flex flex-col font-sans p-6 sm:p-10 select-none overflow-x-hidden selection:bg-neon-safe/30 relative">
        <div v-if="store.storageFailed" class="fixed top-0 left-0 right-0 z-50 bg-neon-danger/20 border-b border-neon-danger px-4 py-2 text-center">
            <span class="text-neon-danger text-xs font-mono">⚠ Storage unavailable — data will be lost when you close this tab</span>
        </div>
        <div v-else-if="store.syncFailed" class="fixed top-0 left-0 right-0 z-50 bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 text-center">
            <span class="text-amber-400 text-xs font-mono">⚠ Supabase sync failed — changes saved locally, retrying automatically</span>
        </div>

        <div class="absolute top-4 left-0 w-full px-6 sm:px-10 flex justify-between z-20 pointer-events-none">
            <div class="font-mono text-[10px] text-text-muted">V3.2-TACTICAL • {{ currentDateStr }}</div>
            <div class="font-mono text-[10px] text-text-muted hidden sm:flex gap-2 items-center">
                <span>DISK: 14%</span>
                <span v-if="store.isSyncing" class="text-neon-safe animate-pulse">SYNC: SYNCING...</span>
                <span v-else-if="store.syncFailed" class="text-amber-400">SYNC: OFFLINE</span>
                <span v-else>SYNC: OK</span>
                <span>OLED: ON</span>
                <button @click="signOut" class="pointer-events-auto flex items-center gap-1 text-text-muted hover:text-neon-danger transition-colors ml-2">
                    <LogOut :size="10" /> Sign Out
                </button>
            </div>
        </div>

        <header class="flex-none flex flex-col justify-center items-start border-b border-bg-surface mb-8 pb-8 mt-8 sm:mt-12">
            <div class="w-full flex justify-between items-start">
                <div class="text-text-muted text-xs font-mono uppercase tracking-[0.2em] mb-4">Total Sisa Saldo (Semua Pocket)</div>
                <div class="flex gap-2 z-30">
                    <button @click="showPerformance = !showPerformance; showHistory = false; if (!showPerformance) selectedMonth = new Date()" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showPerformance ? 'Tutup Performance' : 'Tampilkan Performance'">
                        <BarChart3 :size="20" />
                    </button>
                    <button @click="showHistory = !showHistory; showPerformance = false" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showHistory ? 'Tutup Riwayat' : 'Tampilkan Riwayat'">
                        <Clock :size="20" />
                    </button>
                </div>
            </div>

            <div class="flex items-baseline">
                <span class="text-neon-safe font-mono text-xl sm:text-3xl font-bold mr-2 sm:mr-4">Rp</span>
                <h1 class="text-[48px] sm:text-[80px] md:text-[112px] font-mono font-extrabold leading-none tracking-tighter text-white whitespace-nowrap">
                    {{ formatRupiah(store.totalRemaining).replace("Rp", "").trim() }}
                </h1>
            </div>

            <div class="mt-4 flex items-center gap-4">
                <div
                    :class="[
                        'px-3 py-1 text-bg-primary text-[10px] font-bold uppercase rounded-sm',
                        store.totalRemaining < 0 ? 'bg-neon-danger' : store.totalRemaining < store.totalAllocation * 0.2 ? 'bg-neon-warn' : 'bg-neon-safe',
                    ]"
                >
                    {{ store.totalRemaining < 0 ? "Danger" : store.totalRemaining < store.totalAllocation * 0.2 ? "Warning" : "Aman" }}
                </div>
                <span class="text-text-muted font-mono text-sm">{{ daysRemaining }} Hari Menuju Reset</span>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto pb-32 no-scrollbar">
            <Transition name="fade" mode="out-in">
                <div v-if="showHistory" class="flex flex-col gap-2">
                    <div class="flex justify-between items-end mb-4">
                        <h2 class="text-text-muted text-[11px] uppercase font-bold tracking-[0.2em]">Aktivitas Terakhir</h2>
                        <div class="h-px flex-1 mx-4 bg-bg-surface"></div>
                        <div class="flex gap-4 items-center">
                            <button @click="isTransferOpen = true" class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neon-warn hover:text-amber-400">
                                <ArrowLeftRight :size="10" /> Transfer
                            </button>
                            <button @click="isPocketSettingsOpen = true" class="text-[10px] font-mono uppercase tracking-wider text-neon-safe hover:text-[#059669]"> Alokasi </button>
                            <button @click="handleReset" class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-neon-danger hover:text-red-400">
                                <RefreshCw :size="12" /> Reset
                            </button>
                        </div>
                    </div>

                    <div v-if="store.transactions.length === 0" class="text-center text-text-muted py-10 font-mono text-sm"> Belum ada aktivitas transaksi. </div>

                    <TransitionGroup v-else name="list" tag="div" class="space-y-2">
                        <div v-for="tx in store.transactions" :key="tx.id" class="bg-bg-surface p-4 rounded-sm flex items-center justify-between group overflow-hidden relative">
                            <div class="flex items-center gap-4 z-10 pointer-events-none">
                                <div
                                    class="w-2.5 h-2.5 rounded-full shrink-0"
                                    :style="{
                                        backgroundColor: tx.type === 'expense' ? getPocket(tx.fromPocketId)?.hexColor || '#EF4444' : '#F59E0B',
                                    }"
                                ></div>

                                <div>
                                    <div class="text-sm font-semibold text-text-primary">
                                        <span v-if="tx.type === 'expense'">
                                            {{ getPocket(tx.fromPocketId)?.name || "Pocket" }}
                                        </span>
                                        <span v-else-if="tx.isRollover"> Pangan Rollover </span>
                                        <span v-else> Transfer </span>
                                    </div>

                                    <div class="text-[10px] text-text-muted font-mono mt-0.5">
                                        {{ formatDateTime(tx.timestamp) }} •
                                        <span v-if="tx.type === 'expense'"> Pengeluaran{{ tx.note ? ` (${tx.note})` : "" }} </span>
                                        <span v-else-if="tx.isRollover"> Sisa pangan harian {{ tx.rolloverDate }} </span>
                                        <span v-else>
                                            {{ getPocket(tx.fromPocketId)?.name }} → {{ getPocket(tx.toPocketId)?.name }}
                                            {{ tx.note ? ` (${tx.note})` : "" }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div :class="['font-mono text-sm z-10 pointer-events-none', tx.type === 'expense' ? 'text-neon-danger' : 'text-text-muted']">
                                {{ tx.type === "expense" ? "-" : "" }} {{ formatRupiah(tx.amount) }}
                            </div>

                            <button
                                v-if="!tx.isRollover"
                                @click="removeTransaction(tx.id)"
                                class="absolute inset-y-0 right-0 w-16 bg-neon-danger flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity translate-x-full group-hover:translate-x-0 active:bg-red-600"
                                style="-webkit-tap-highlight-color: transparent"
                                :aria-label="`Hapus transaksi ${tx.id}`"
                            >
                                <Trash2 :size="20" class="text-bg-primary" />
                            </button>
                        </div>
                    </TransitionGroup>
                </div>

                <div v-else-if="showPerformance" class="flex flex-col gap-8">
                    <div class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 pb-6 border-b border-bg-surface">
                        <div class="flex items-center gap-3">
                            <button @click="selectedMonth = getPreviousMonth(selectedMonth)" class="text-text-muted hover:text-text-primary transition-colors p-1">
                                <ChevronLeft :size="24" />
                            </button>
                            <div class="flex flex-col">
                                <h2 class="text-text-primary text-2xl font-bold">{{ selectedMonthName }}</h2>
                                <span class="text-text-muted text-xs mt-0.5">Laporan Bulanan</span>
                            </div>
                            <button @click="selectedMonth = getNextMonth(selectedMonth)" :class="['transition-colors p-1', isCurrentMonth(selectedMonth) ? 'text-text-muted/30 cursor-not-allowed' : 'text-text-muted hover:text-text-primary']" :disabled="isCurrentMonth(selectedMonth)">
                                <ChevronRight :size="24" />
                            </button>
                        </div>
                        <div class="flex gap-3 sm:ml-auto">
                            <button v-if="!isCurrentMonth(selectedMonth)" @click="selectedMonth = new Date()" class="px-3 py-1.5 text-xs font-medium text-neon-safe border border-neon-safe/30 rounded hover:bg-neon-safe/10 transition-colors">
                                Bulan Ini
                            </button>
                            <button @click="showPerformance = false; showHistory = false" class="px-3 py-1.5 text-xs font-medium text-text-muted border border-bg-surface rounded hover:text-text-primary transition-colors flex items-center gap-1.5">
                                <LayoutGrid :size="12" /> Dashboard
                            </button>
                        </div>
                    </div>

                    <div class="relative overflow-hidden bg-bg-surface rounded-lg p-6 border-l-4" :class="monthlyPerformance.isOverallBoros ? 'border-neon-danger' : 'border-neon-safe'">
                        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div class="flex items-center gap-4">
                                <div class="p-3 rounded-lg" :class="monthlyPerformance.isOverallBoros ? 'bg-neon-danger/10' : 'bg-neon-safe/10'">
                                    <component :is="monthlyPerformance.isOverallBoros ? TrendingUp : TrendingDown" :size="28" :class="monthlyPerformance.isOverallBoros ? 'text-neon-danger' : 'text-neon-safe'" />
                                </div>
                                <div>
                                    <div class="text-text-muted text-sm font-medium mb-1">
                                        {{ monthlyPerformance.isOverallBoros ? "Lebih Boros" : "Lebih Hemat" }} dari Bulan Lalu
                                    </div>
                                    <div class="font-mono text-4xl font-bold" :class="monthlyPerformance.isOverallBoros ? 'text-neon-danger' : 'text-neon-safe'">
                                        {{ monthlyPerformance.totalSpendingChange.toFixed(1) }}%
                                    </div>
                                </div>
                            </div>
                            <div class="flex gap-6 lg:gap-10">
                                <div>
                                    <div class="text-text-muted text-xs font-medium mb-1">Total Pengeluaran</div>
                                    <div class="font-mono text-2xl font-bold text-text-primary">{{ formatRupiah(monthlyPerformance.totalSpent) }}</div>
                                </div>
                                <div>
                                    <div class="text-text-muted text-xs font-medium mb-1">Bulan Lalu</div>
                                    <div class="font-mono text-2xl font-bold text-text-muted">{{ formatRupiah(monthlyPerformance.prevTotalSpent) }}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="bg-bg-surface rounded-lg p-5 border border-bg-surface/50 hover:border-bg-surface transition-colors">
                            <div class="text-text-muted text-xs font-medium mb-2">Total Alokasi</div>
                            <div class="font-mono text-2xl font-bold text-text-primary">{{ formatRupiah(monthlyPerformance.totalAllocation) }}</div>
                            <div class="mt-3 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                                <div class="h-full bg-neon-safe rounded-full" style="width: 100%"></div>
                            </div>
                        </div>
                        <div class="bg-bg-surface rounded-lg p-5 border border-bg-surface/50 hover:border-bg-surface transition-colors">
                            <div class="text-text-muted text-xs font-medium mb-2">Total Terpakai</div>
                            <div class="font-mono text-2xl font-bold" :class="monthlyPerformance.overallUtilization > 80 ? 'text-neon-danger' : 'text-text-primary'">{{ formatRupiah(monthlyPerformance.totalSpent) }}</div>
                            <div class="mt-3 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all" :class="monthlyPerformance.overallUtilization > 80 ? 'bg-neon-danger' : monthlyPerformance.overallUtilization > 50 ? 'bg-neon-warn' : 'bg-neon-safe'" :style="{ width: `${Math.min(monthlyPerformance.overallUtilization, 100)}%` }"></div>
                            </div>
                        </div>
                        <div class="bg-bg-surface rounded-lg p-5 border border-bg-surface/50 hover:border-bg-surface transition-colors">
                            <div class="text-text-muted text-xs font-medium mb-2">Utilisasi Keseluruhan</div>
                            <div class="font-mono text-2xl font-bold" :class="monthlyPerformance.overallUtilization > 80 ? 'text-neon-danger' : monthlyPerformance.overallUtilization > 50 ? 'text-neon-warn' : 'text-neon-safe'">
                                {{ monthlyPerformance.overallUtilization.toFixed(1) }}%
                            </div>
                            <div class="mt-3 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all" :class="monthlyPerformance.overallUtilization > 80 ? 'bg-neon-danger' : monthlyPerformance.overallUtilization > 50 ? 'bg-neon-warn' : 'bg-neon-safe'" :style="{ width: `${Math.min(monthlyPerformance.overallUtilization, 100)}%` }"></div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-bg-surface rounded-lg p-6">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-text-primary text-lg font-semibold">Analisis Per Pocket</h3>
                            <div class="flex gap-4 text-xs">
                                <span class="flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-neon-safe"></span>
                                    <span class="text-text-muted">Hemat</span>
                                </span>
                                <span class="flex items-center gap-1.5">
                                    <span class="w-2 h-2 rounded-full bg-neon-danger"></span>
                                    <span class="text-text-muted">Boros</span>
                                </span>
                            </div>
                        </div>

                        <div v-if="monthlyPerformance.mostUsedPocket || monthlyPerformance.leastUsedPocket" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-bg-primary/30 rounded-lg">
                            <div v-if="monthlyPerformance.mostUsedPocket" class="flex items-start gap-3">
                                <div class="p-2 rounded bg-neon-danger/10 shrink-0">
                                    <TrendingUp :size="16" class="text-neon-danger" />
                                </div>
                                <div>
                                    <div class="text-text-muted text-xs mb-0.5">Paling Sering</div>
                                    <div class="font-semibold text-text-primary">{{ monthlyPerformance.mostUsedPocket.name }}</div>
                                    <div class="text-neon-danger text-sm font-mono mt-0.5">{{ monthlyPerformance.mostUsedPocket.utilization.toFixed(1) }}% · {{ monthlyPerformance.mostUsedPocket.transactionCount }}x transaksi</div>
                                </div>
                            </div>
                            <div v-if="monthlyPerformance.leastUsedPocket" class="flex items-start gap-3">
                                <div class="p-2 rounded bg-neon-safe/10 shrink-0">
                                    <TrendingDown :size="16" class="text-neon-safe" />
                                </div>
                                <div>
                                    <div class="text-text-muted text-xs mb-0.5">Paling Jarang</div>
                                    <div class="font-semibold text-text-primary">{{ monthlyPerformance.leastUsedPocket.name }}</div>
                                    <div class="text-neon-safe text-sm font-mono mt-0.5">{{ monthlyPerformance.leastUsedPocket.utilization.toFixed(1) }}% · {{ monthlyPerformance.leastUsedPocket.transactionCount }}x transaksi</div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-5">
                            <div v-for="pocket in monthlyPerformance.pockets" :key="pocket.id" class="group">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2.5">
                                        <div :class="['w-8 h-8 rounded-lg flex items-center justify-center shrink-0', pocket.colorClass]">
                                            <component :is="resolveIcon(pocket.icon)" :size="14" />
                                        </div>
                                        <span class="font-medium text-text-primary">{{ pocket.name }}</span>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <span v-if="pocket.prevSpent > 0" class="text-xs font-mono px-2 py-0.5 rounded" :class="pocket.isBoros ? 'bg-neon-danger/10 text-neon-danger' : 'bg-neon-safe/10 text-neon-safe'">
                                            {{ pocket.isBoros ? "Boros" : "Hemat" }} {{ pocket.spendingChange.toFixed(0) }}%
                                        </span>
                                        <span class="text-sm font-mono text-text-muted">{{ formatRupiah(pocket.spent) }} / {{ formatRupiah(pocket.allocation) }}</span>
                                    </div>
                                </div>
                                <div class="h-3 bg-bg-primary rounded-full overflow-hidden">
                                    <div
                                        :class="['h-full rounded-full transition-all duration-300', pocket.colorClass]"
                                        :style="{ width: `${Math.min(pocket.utilization, 100)}%` }"
                                    ></div>
                                </div>
                                <div class="flex justify-between mt-1.5 text-xs text-text-muted font-mono">
                                    <span>{{ pocket.utilization.toFixed(1) }}% terpakai</span>
                                    <span>{{ pocket.transactionCount }}x transaksi</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-bg-surface rounded-lg overflow-hidden">
                        <div class="p-6 pb-4">
                            <h3 class="text-text-primary text-lg font-semibold">Detail Per Pocket</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-t border-b border-bg-surface bg-bg-primary/20">
                                        <th class="text-left text-text-muted text-xs font-semibold py-3 px-4">Pocket</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">Alokasi</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">Terpakai</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">Sisa</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">Utilisasi</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">vs Bulan Lalu</th>
                                        <th class="text-center text-text-muted text-xs font-semibold py-3 px-4">Transaksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="pocket in monthlyPerformance.pockets" :key="pocket.id" class="border-b border-bg-surface/30 hover:bg-bg-primary/20 transition-colors">
                                        <td class="py-3.5 px-4">
                                            <div class="flex items-center gap-2.5">
                                                <div :class="['w-6 h-6 rounded-md flex items-center justify-center', pocket.colorClass]">
                                                    <component :is="resolveIcon(pocket.icon)" :size="12" />
                                                </div>
                                                <span class="font-medium text-text-primary">{{ pocket.name }}</span>
                                            </div>
                                        </td>
                                        <td class="text-right font-mono text-text-primary py-3.5 px-4">{{ formatRupiah(pocket.allocation) }}</td>
                                        <td class="text-right font-mono text-neon-danger py-3.5 px-4">{{ formatRupiah(pocket.spent) }}</td>
                                        <td class="text-right font-mono py-3.5 px-4" :class="pocket.isOver ? 'text-neon-danger' : 'text-neon-safe'">{{ formatRupiah(pocket.remaining) }}</td>
                                        <td class="text-right font-mono py-3.5 px-4">
                                            <span :class="pocket.isOver ? 'text-neon-danger font-semibold' : 'text-text-muted'">{{ pocket.utilization.toFixed(1) }}%</span>
                                        </td>
                                        <td class="text-right font-mono py-3.5 px-4">
                                            <span v-if="pocket.prevSpent > 0" :class="pocket.isBoros ? 'text-neon-danger' : 'text-neon-safe'">
                                                {{ pocket.isBoros ? "+" : "-" }}{{ pocket.spendingChange.toFixed(0) }}%
                                            </span>
                                            <span v-else class="text-text-muted">-</span>
                                        </td>
                                        <td class="text-center font-mono text-text-muted py-3.5 px-4">{{ pocket.transactionCount }}x</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="bg-bg-surface rounded-lg overflow-hidden">
                        <div class="p-6 pb-4">
                            <h3 class="text-text-primary text-lg font-semibold">Riwayat Transaksi - {{ selectedMonthName }}</h3>
                        </div>
                        <div v-if="selectedMonthTransactions.length === 0" class="text-center text-text-muted py-12">
                            <div class="text-4xl mb-2">📭</div>
                            <p class="font-mono text-sm">Tidak ada transaksi pada bulan ini.</p>
                        </div>
                        <div v-else class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-t border-b border-bg-surface bg-bg-primary/20">
                                        <th class="text-left text-text-muted text-xs font-semibold py-3 px-4">Tanggal</th>
                                        <th class="text-left text-text-muted text-xs font-semibold py-3 px-4">Keterangan</th>
                                        <th class="text-right text-text-muted text-xs font-semibold py-3 px-4">Jumlah</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="tx in selectedMonthTransactions" :key="tx.id" class="border-b border-bg-surface/30 hover:bg-bg-primary/20 transition-colors">
                                        <td class="py-3 px-4 font-mono text-text-muted text-xs">{{ formatDateTime(tx.timestamp) }}</td>
                                        <td class="py-3 px-4">
                                            <div class="flex items-center gap-2.5">
                                                <div
                                                    class="w-2.5 h-2.5 rounded-full shrink-0"
                                                    :style="{
                                                        backgroundColor: tx.type === 'expense' ? getPocket(tx.fromPocketId)?.hexColor || '#EF4444' : '#F59E0B',
                                                    }"
                                                ></div>
                                                <div>
                                                    <div class="text-sm font-medium text-text-primary">
                                                        <span v-if="tx.type === 'expense'">
                                                            {{ getPocket(tx.fromPocketId)?.name || "Pocket" }}
                                                        </span>
                                                        <span v-else-if="tx.isRollover"> Pangan Rollover </span>
                                                        <span v-else> Transfer </span>
                                                    </div>
                                                    <div class="text-xs text-text-muted font-mono mt-0.5">
                                                        <span v-if="tx.type === 'expense'"> Pengeluaran{{ tx.note ? ` (${tx.note})` : "" }} </span>
                                                        <span v-else-if="tx.isRollover"> Sisa pangan harian {{ tx.rolloverDate }} </span>
                                                        <span v-else>
                                                            {{ getPocket(tx.fromPocketId)?.name }} → {{ getPocket(tx.toPocketId)?.name }}
                                                            {{ tx.note ? ` (${tx.note})` : "" }}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="text-right font-mono text-sm py-3 px-4" :class="tx.type === 'expense' ? 'text-neon-danger' : 'text-text-muted'">
                                            {{ tx.type === "expense" ? "-" : "" }} {{ formatRupiah(tx.amount) }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div v-else class="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div
                        :class="[
                            'bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between',
                            dailyPanganStats.remainingToday < 0 ? 'border-neon-danger' : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3 ? 'border-neon-warn' : 'border-neon-safe',
                        ]"
                    >
                        <div>
                            <div class="flex justify-between items-start mb-2">
                                <span class="text-text-muted text-[11px] uppercase font-bold tracking-wider">Pangan Hari Ini</span>
                                <span
                                    :class="[
                                        'font-mono text-xs',
                                        dailyPanganStats.remainingToday < 0
                                            ? 'text-neon-danger'
                                            : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3
                                              ? 'text-neon-warn'
                                              : 'text-neon-safe',
                                    ]"
                                >
                                    {{ dailyPanganStats.remainingToday < 0 ? "OVER" : "SISA" }}
                                </span>
                            </div>
                            <div :class="['font-mono text-2xl font-bold mb-1', dailyPanganStats.remainingToday < 0 ? 'text-neon-danger' : 'text-text-primary']">
                                {{ formatRupiah(dailyPanganStats.remainingToday) }}
                            </div>
                            <div class="text-text-muted text-[10px]">Tersedia Hari Ini (Target: {{ formatRupiah(dailyPanganStats.dailyTarget) }}/hari)</div>
                        </div>
                        <div class="w-full h-2 bg-[#1E1E1E] rounded-xs mt-4 overflow-hidden">
                            <div
                                :class="[
                                    'h-full transition-all duration-300 ease-out',
                                    dailyPanganStats.remainingToday < 0 ? 'bg-neon-danger' : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3 ? 'bg-neon-warn' : 'bg-neon-safe',
                                ]"
                                :style="{ width: `${Math.min((dailyPanganStats.spentToday / (dailyPanganStats.dailyTarget || 1)) * 100, 100)}%` }"
                            ></div>
                        </div>
                    </div>

                    <div
                        v-for="pocket in store.pockets"
                        :key="pocket.id"
                        class="bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between border-l-current"
                        :style="{ borderLeftColor: pocketMap[pocket.id]?.hexColor || '#10B981' }"
                    >
                        <div>
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center gap-2">
                                    <div :class="['w-6 h-6 rounded flex items-center justify-center', pocket.colorClass]">
                                        <component :is="resolveIcon(pocket.icon)" :size="12" />
                                    </div>
                                    <span class="text-text-muted text-[11px] uppercase font-bold tracking-wider">{{ pocket.name }}</span>
                                </div>
                                <span :class="['font-mono text-xs', pocketStats[pocket.id]?.isOver ? 'text-neon-danger' : 'text-neon-safe']">
                                    {{ pocketStats[pocket.id]?.isOver ? "OVER" : "AMAN" }}
                                </span>
                            </div>
                            <div :class="['font-mono text-2xl font-bold mb-1', pocketStats[pocket.id]?.isOver ? 'text-neon-danger' : 'text-text-primary']">
                                {{ formatRupiah(store.pocketBalances[pocket.id] || 0) }}
                            </div>
                            <div :class="['text-[10px]', pocketStats[pocket.id]?.isOver ? 'text-neon-danger uppercase font-bold' : 'text-text-muted']">
                                {{ pocketStats[pocket.id]?.isOver ? "Rem Dulu, Bro" : "Sisa Saldo" }}
                            </div>
                        </div>
                        <div class="w-full h-2 bg-[#1E1E1E] rounded-xs mt-4 overflow-hidden">
                            <div :class="['h-full transition-all duration-300 ease-out', pocket.colorClass]" :style="{ width: `${pocketStats[pocket.id]?.percentage || 0}%` }"></div>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>

        <div class="fixed bottom-8 sm:bottom-12 right-8 sm:right-12 z-30 flex gap-4">
            <div v-if="!showHistory" class=" flex gap-4">
                <button
                    @click="isTransferOpen = true"
                    class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-neon-warn hover:text-amber-400 hover:bg-[#2A2A2A] shadow-lg w-fit h-fit"
                >
                    <ArrowLeftRight :size="14" />
                    Transfer
                </button>
                <button
                    @click="isPocketSettingsOpen = true"
                    class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-neon-safe hover:text-[#059669] hover:bg-[#2A2A2A] shadow-lg w-fit h-fit"
                >
                    <Settings :size="14" />
                    Alokasi
                </button>
            </div>

            <div class="">
                <button
                    @click="isKeypadOpen = true"
                    class="w-16 h-16 sm:w-20 sm:h-20 bg-neon-safe text-bg-primary rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-95 active:scale-90 transition-transform"
                    aria-label="Tambah pengeluaran baru"
                >
                    <Plus :size="36" :stroke-width="2.5" />
                </button>
            </div>
        </div>

        <KeypadModal :is-open="isKeypadOpen" @close="isKeypadOpen = false" @save="handleAddExpense" />

        <PocketSettingsModal :is-open="isPocketSettingsOpen" @close="isPocketSettingsOpen = false" />

        <TransferModal :is-open="isTransferOpen" @close="isTransferOpen = false" />
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
}

.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(-30px);
}

.no-scrollbar::-webkit-scrollbar {
    display: none;
}
.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
