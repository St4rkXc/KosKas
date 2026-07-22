<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
    Settings,
    RefreshCw,
    Trash2,
    Plus,
    ArrowLeftRight,
    Utensils,
    Home,
    Fuel,
    Coffee,
    ShieldAlert,
    PiggyBank,
    Coins,
    ShoppingBag,
    Gamepad2,
    Heart,
    BookOpen,
    Plane,
    Car,
    Gift,
    Sparkles,
    BarChart3,
    LayoutGrid,
    TrendingUp,
    TrendingDown,
} from "lucide-vue-next";
import KeypadModal from "./components/KeypadModal.vue";
import PocketSettingsModal from "./components/PocketSettingsModal.vue";
import TransferModal from "./components/TransferModal.vue";
import { useStore } from "./store";
import { formatRupiah, vibrate } from "./types";

const store = useStore();
const showHistory = ref(false);
const showPerformance = ref(false);
const isKeypadOpen = ref(false);
const isPocketSettingsOpen = ref(false);
const isTransferOpen = ref(false);

// Map icon strings to Lucide Icon components
const iconMap: Record<string, any> = {
    Utensils,
    Home,
    Fuel,
    Coffee,
    ShieldAlert,
    PiggyBank,
    Coins,
    ShoppingBag,
    Gamepad2,
    Heart,
    BookOpen,
    Plane,
    Car,
    Gift,
    Sparkles,
};

// Resolve icon component safely -> falls back to Sparkles if name is unknown.
// Avoids silent blank rendering when a pocket icon string is missing/typo'd.
const resolveIcon = (name: string) => iconMap[name] || Sparkles;

// Memoize pocket lookup as a map to avoid O(N*M) find() in transaction v-for loops.
const pocketMap = computed(() => {
    const map: Record<string, (typeof store.pockets)[number]> = {};
    store.pockets.forEach((p) => (map[p.id] = p));
    return map;
});

// Safe lookup helper: tx.fromPocketId / toPocketId are `string | undefined`,
// so indexing pocketMap directly fails TS. Falls back to undefined cleanly.
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
    const stats: Record<string, { spent: number; remaining: number; percentage: number; isOver: boolean }> = {};
    store.pockets.forEach((pocket) => {
        const remaining = store.pocketBalances[pocket.id] || 0;
        const spent = store.transactions.filter((t) => t.type === "expense" && t.fromPocketId === pocket.id).reduce((sum, t) => sum + t.amount, 0);

        const percentage = pocket.allocation > 0 ? Math.min((spent / pocket.allocation) * 100, 100) : 0;
        stats[pocket.id] = {
            spent,
            remaining,
            percentage,
            isOver: remaining < 0,
        };
    });
    return stats;
});

const monthlyPerformance = computed(() => {
    const performance = store.pockets.map((pocket) => {
        const expenses = store.transactions.filter((t) => t.type === "expense" && t.fromPocketId === pocket.id);
        const spent = expenses.reduce((sum, t) => sum + t.amount, 0);
        const transactionCount = expenses.length;
        const remaining = store.pocketBalances[pocket.id] || 0;
        const utilization = pocket.allocation > 0 ? (spent / pocket.allocation) * 100 : 0;
        const isOver = remaining < 0;

        return {
            id: pocket.id,
            name: pocket.name,
            icon: pocket.icon,
            colorClass: pocket.colorClass,
            allocation: pocket.allocation,
            spent,
            remaining,
            utilization,
            isOver,
            transactionCount,
        };
    });

    performance.sort((a, b) => b.utilization - a.utilization);

    const totalSpent = performance.reduce((sum, p) => sum + p.spent, 0);
    const totalAllocation = performance.reduce((sum, p) => sum + p.allocation, 0);
    const overallUtilization = totalAllocation > 0 ? (totalSpent / totalAllocation) * 100 : 0;
    const mostUsedPocket = performance[0] || null;
    const leastUsedPocket = performance[performance.length - 1] || null;

    return {
        pockets: performance,
        totalSpent,
        totalAllocation,
        overallUtilization,
        mostUsedPocket,
        leastUsedPocket,
    };
});

const dailyPanganStats = computed(() => {
    const panganPocket = store.pockets.find((p) => p.id === "pangan");
    const panganAllocation = panganPocket ? panganPocket.allocation : 1500000;

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    const dailyTarget = Math.floor(panganAllocation / daysInMonth);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const spentToday = store.transactions.filter((t) => t.type === "expense" && t.fromPocketId === "pangan" && t.timestamp >= todayStart).reduce((sum, t) => sum + t.amount, 0);

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

function formatDateTime(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    
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
    <div v-if="!store.isLoaded" class="min-h-screen bg-bg-primary text-text-primary"></div>

    <div v-else class="w-full min-h-screen bg-bg-primary text-text-primary flex flex-col font-sans p-6 sm:p-10 select-none overflow-x-hidden selection:bg-neon-safe/30 relative">
        <!-- Status Bar Visual Hack -->
        <div class="absolute top-4 left-0 w-full px-6 sm:px-10 flex justify-between z-20 pointer-events-none">
            <div class="font-mono text-[10px] text-text-muted">V3.2-TACTICAL • {{ currentDateStr }}</div>
            <div class="font-mono text-[10px] text-text-muted hidden sm:flex gap-2">
                <span>DISK: 14%</span>
                <span>SYNC: OK</span>
                <span>OLED: ON</span>
            </div>
        </div>

        <!-- Header Space -->
        <header class="flex-none flex flex-col justify-center items-start border-b border-bg-surface mb-8 pb-8 mt-8 sm:mt-12">
            <div class="w-full flex justify-between items-start">
                <div class="text-text-muted text-xs font-mono uppercase tracking-[0.2em] mb-4">Total Sisa Saldo (Semua Pocket)</div>
                <div class="flex gap-2 z-30">
                    <button @click="showPerformance = !showPerformance; showHistory = false" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showPerformance ? 'Tutup Performance' : 'Tampilkan Performance'">
                        <BarChart3 :size="20" />
                    </button>
                    <button @click="showHistory = !showHistory; showPerformance = false" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showHistory ? 'Tutup Riwayat' : 'Tampilkan Riwayat'">
                        <Settings :size="20" />
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
                <!-- History / Transactions List -->
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
                                <!-- Dot with pocket color -->
                                <div
                                    class="w-2.5 h-2.5 rounded-full shrink-0"
                                    :style="{
                                        backgroundColor: tx.type === 'expense' ? getPocket(tx.fromPocketId)?.colorClass.match(/#[A-Fa-f0-9]+/)?.[0] || '#EF4444' : '#F59E0B',
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

                <div v-else-if="showPerformance" class="flex flex-col gap-6">
                    <!-- Performance Header -->
                    <div class="flex justify-between items-end mb-2">
                        <h2 class="text-text-muted text-[11px] uppercase font-bold tracking-[0.2em]">Performa Bulanan</h2>
                        <div class="h-px flex-1 mx-4 bg-bg-surface"></div>
                        <div class="flex gap-4 items-center">
                            <button @click="showPerformance = false; showHistory = false" class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neon-safe hover:text-[#059669]">
                                <LayoutGrid :size="10" /> Dashboard
                            </button>
                        </div>
                    </div>

                    <!-- Summary Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="bg-bg-surface p-4 rounded-sm border-l-4 border-neon-safe">
                            <div class="text-text-muted text-[10px] uppercase font-bold tracking-wider mb-1">Total Alokasi</div>
                            <div class="font-mono text-xl font-bold text-text-primary">{{ formatRupiah(monthlyPerformance.totalAllocation) }}</div>
                        </div>
                        <div class="bg-bg-surface p-4 rounded-sm border-l-4 border-neon-danger">
                            <div class="text-text-muted text-[10px] uppercase font-bold tracking-wider mb-1">Total Terpakai</div>
                            <div class="font-mono text-xl font-bold text-neon-danger">{{ formatRupiah(monthlyPerformance.totalSpent) }}</div>
                        </div>
                        <div class="bg-bg-surface p-4 rounded-sm border-l-4" :class="monthlyPerformance.overallUtilization > 80 ? 'border-neon-danger' : monthlyPerformance.overallUtilization > 50 ? 'border-neon-warn' : 'border-neon-safe'">
                            <div class="text-text-muted text-[10px] uppercase font-bold tracking-wider mb-1">Utilisasi Keseluruhan</div>
                            <div class="font-mono text-xl font-bold" :class="monthlyPerformance.overallUtilization > 80 ? 'text-neon-danger' : monthlyPerformance.overallUtilization > 50 ? 'text-neon-warn' : 'text-neon-safe'">
                                {{ monthlyPerformance.overallUtilization.toFixed(1) }}%
                            </div>
                        </div>
                    </div>

                    <!-- Most/Least Used -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div v-if="monthlyPerformance.mostUsedPocket" class="bg-bg-surface p-4 rounded-sm border-l-4 border-neon-danger">
                            <div class="flex items-center gap-2 mb-2">
                                <TrendingUp :size="14" class="text-neon-danger" />
                                <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Paling Sering Dipakai</span>
                            </div>
                            <div class="font-mono text-lg font-bold text-text-primary">{{ monthlyPerformance.mostUsedPocket.name }}</div>
                            <div class="text-neon-danger font-mono text-sm">{{ monthlyPerformance.mostUsedPocket.utilization.toFixed(1) }}% terpakai</div>
                            <div class="text-text-muted text-[10px] mt-1">{{ monthlyPerformance.mostUsedPocket.transactionCount }} transaksi</div>
                        </div>
                        <div v-if="monthlyPerformance.leastUsedPocket" class="bg-bg-surface p-4 rounded-sm border-l-4 border-neon-safe">
                            <div class="flex items-center gap-2 mb-2">
                                <TrendingDown :size="14" class="text-neon-safe" />
                                <span class="text-text-muted text-[10px] uppercase font-bold tracking-wider">Paling Jarang Dipakai</span>
                            </div>
                            <div class="font-mono text-lg font-bold text-text-primary">{{ monthlyPerformance.leastUsedPocket.name }}</div>
                            <div class="text-neon-safe font-mono text-sm">{{ monthlyPerformance.leastUsedPocket.utilization.toFixed(1) }}% terpakai</div>
                            <div class="text-text-muted text-[10px] mt-1">{{ monthlyPerformance.leastUsedPocket.transactionCount }} transaksi</div>
                        </div>
                    </div>

                    <!-- Bar Chart Comparison -->
                    <div class="bg-bg-surface p-5 rounded-sm">
                        <h3 class="text-text-muted text-[11px] uppercase font-bold tracking-[0.2em] mb-4">Perbandingan Penggunaan Dana</h3>
                        <div class="space-y-3">
                            <div v-for="pocket in monthlyPerformance.pockets" :key="pocket.id" class="flex items-center gap-3">
                                <div :class="['w-6 h-6 rounded flex items-center justify-center shrink-0', pocket.colorClass]">
                                    <component :is="resolveIcon(pocket.icon)" :size="12" />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-text-primary text-sm font-semibold truncate">{{ pocket.name }}</span>
                                        <span class="font-mono text-xs" :class="pocket.isOver ? 'text-neon-danger' : 'text-text-muted'">
                                            {{ formatRupiah(pocket.spent) }} / {{ formatRupiah(pocket.allocation) }}
                                        </span>
                                    </div>
                                    <div class="w-full h-3 bg-[#1E1E1E] rounded-xs overflow-hidden">
                                        <div
                                            :class="['h-full transition-all duration-300', pocket.colorClass]"
                                            :style="{ width: `${Math.min(pocket.utilization, 100)}%` }"
                                        ></div>
                                    </div>
                                    <div class="flex justify-between items-center mt-1">
                                        <span class="text-[10px] text-text-muted font-mono">{{ pocket.utilization.toFixed(1) }}% terpakai</span>
                                        <span class="text-[10px] text-text-muted font-mono">{{ pocket.transactionCount }}x transaksi</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Detailed Table -->
                    <div class="bg-bg-surface p-5 rounded-sm overflow-x-auto">
                        <h3 class="text-text-muted text-[11px] uppercase font-bold tracking-[0.2em] mb-4">Detail Per Pocket</h3>
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-bg-surface">
                                    <th class="text-left text-text-muted text-[10px] uppercase font-bold tracking-wider py-2 pr-4">Pocket</th>
                                    <th class="text-right text-text-muted text-[10px] uppercase font-bold tracking-wider py-2 pr-4">Alokasi</th>
                                    <th class="text-right text-text-muted text-[10px] uppercase font-bold tracking-wider py-2 pr-4">Terpakai</th>
                                    <th class="text-right text-text-muted text-[10px] uppercase font-bold tracking-wider py-2 pr-4">Sisa</th>
                                    <th class="text-right text-text-muted text-[10px] uppercase font-bold tracking-wider py-2 pr-4">Utilisasi</th>
                                    <th class="text-center text-text-muted text-[10px] uppercase font-bold tracking-wider py-2">Transaksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="pocket in monthlyPerformance.pockets" :key="pocket.id" class="border-b border-bg-surface/50">
                                    <td class="py-3 pr-4">
                                        <div class="flex items-center gap-2">
                                            <div :class="['w-5 h-5 rounded flex items-center justify-center', pocket.colorClass]">
                                                <component :is="resolveIcon(pocket.icon)" :size="10" />
                                            </div>
                                            <span class="text-text-primary font-semibold">{{ pocket.name }}</span>
                                        </div>
                                    </td>
                                    <td class="text-right font-mono text-text-primary py-3 pr-4">{{ formatRupiah(pocket.allocation) }}</td>
                                    <td class="text-right font-mono text-neon-danger py-3 pr-4">{{ formatRupiah(pocket.spent) }}</td>
                                    <td class="text-right font-mono py-3 pr-4" :class="pocket.isOver ? 'text-neon-danger' : 'text-neon-safe'">{{ formatRupiah(pocket.remaining) }}</td>
                                    <td class="text-right font-mono py-3 pr-4" :class="pocket.isOver ? 'text-neon-danger' : 'text-text-muted'">{{ pocket.utilization.toFixed(1) }}%</td>
                                    <td class="text-center font-mono text-text-muted py-3">{{ pocket.transactionCount }}x</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Dashboard / Cards Grid -->
                <div v-else class="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <!-- Daily Pangan Target Card -->
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

                    <!-- Dynamic Pockets Grid -->
                    <div
                        v-for="pocket in store.pockets"
                        :key="pocket.id"
                        class="bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between border-l-current"
                        :style="{ borderLeftColor: pocket.colorClass.match(/#[A-Fa-f0-9]+/)?.[0] || '#10B981' }"
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
            <!-- Pockets transfer / settings panel launchers when not showing history -->
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

            <!-- The Signature Add Expense FAB -->
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

        <!-- Modals -->
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
