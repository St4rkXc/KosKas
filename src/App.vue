<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { BarChart3, Clock } from "lucide-vue-next";
import { useStore } from "./store";
import { formatRupiah, vibrate, hexFromColorClass } from "./types";
import { useAnalytics } from "./composables/useAnalytics";
import { useDateUtils } from "./composables/useDateUtils";
import TotalBalanceHeader from "./components/molecules/TotalBalanceHeader.vue";
import DashboardView from "./components/organisms/DashboardView.vue";
import HistoryView from "./components/organisms/HistoryView.vue";
import PerformanceView from "./components/organisms/PerformanceView.vue";
import FloatingActionBar from "./components/organisms/FloatingActionBar.vue";
import KeypadModal from "./components/modals/KeypadModal.vue";
import PocketSettingsModal from "./components/modals/PocketSettingsModal.vue";
import TransferModal from "./components/modals/TransferModal.vue";

const store = useStore();
const showHistory = ref(false);
const showPerformance = ref(false);
const isKeypadOpen = ref(false);
const isPocketSettingsOpen = ref(false);
const isTransferOpen = ref(false);

const selectedMonth = ref(new Date());
const { pocketStats, monthlyPerformance, dailyPanganStats, daysRemaining, selectedMonthName, selectedMonthTransactions, previousMonthTransactions, getPreviousMonth, getNextMonth, isCurrentMonth } = useAnalytics(selectedMonth);
const { currentDateStr, formatDateTime } = useDateUtils();

const pocketMap = computed(() => {
    const map: Record<string, { name: string; hexColor: string }> = {};
    for (const p of store.pockets) {
        map[p.id] = { name: p.name, hexColor: hexFromColorClass(p.colorClass) };
    }
    return map;
});

onMounted(() => {
    store.loadFromStorage();
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
</script>

<template>
    <div v-if="!store.isLoaded" class="min-h-screen bg-bg-primary text-text-primary"></div>

    <div v-else class="w-full min-h-screen bg-bg-primary text-text-primary flex flex-col font-sans p-6 sm:p-10 select-none overflow-x-hidden selection:bg-neon-safe/30 relative">
        <div v-if="store.storageFailed" class="fixed top-0 left-0 right-0 z-50 bg-neon-danger/20 border-b border-neon-danger px-4 py-2 text-center">
            <span class="text-neon-danger text-xs font-mono">⚠ Storage unavailable — data will be lost when you close this tab</span>
        </div>

        <div class="absolute top-4 left-0 w-full px-6 sm:px-10 flex justify-between z-20 pointer-events-none">
            <div class="font-mono text-[10px] text-text-muted">V3.2-TACTICAL • {{ currentDateStr }}</div>
            <div class="font-mono text-[10px] text-text-muted hidden sm:flex gap-2">
                <span>DISK: 14%</span>
                <span>SYNC: OK</span>
                <span>OLED: ON</span>
            </div>
        </div>

        <div class="w-full flex justify-end mb-4 mt-8 sm:mt-12 z-30">
            <div class="flex gap-2">
                <button @click="showPerformance = !showPerformance; showHistory = false; if (!showPerformance) selectedMonth = new Date()" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showPerformance ? 'Tutup Performance' : 'Tampilkan Performance'">
                    <BarChart3 :size="20" />
                </button>
                <button @click="showHistory = !showHistory; showPerformance = false" class="text-text-muted hover:text-text-primary transition-colors" :aria-label="showHistory ? 'Tutup Riwayat' : 'Tampilkan Riwayat'">
                    <Clock :size="20" />
                </button>
            </div>
        </div>

        <TotalBalanceHeader
            :totalRemaining="store.totalRemaining"
            :totalAllocation="store.totalAllocation"
            :daysRemaining="daysRemaining"
            :formatRupiah="formatRupiah"
        />

        <div class="flex-1 overflow-y-auto pb-32 no-scrollbar">
            <Transition name="fade" mode="out-in">
                <DashboardView
                    v-if="!showHistory && !showPerformance"
                    :pocketStats="pocketStats"
                    :dailyPanganStats="dailyPanganStats"
                    :formatRupiah="formatRupiah"
                />
                <HistoryView
                    v-else-if="showHistory"
                    :transactions="store.transactions"
                    :pocketMap="pocketMap"
                    :formatDateTime="formatDateTime"
                    :formatRupiah="formatRupiah"
                    @remove="removeTransaction"
                    @transfer="isTransferOpen = true"
                    @settings="isPocketSettingsOpen = true"
                    @reset="handleReset"
                />
                <PerformanceView
                    v-else
                    :selectedMonthName="selectedMonthName"
                    :isCurrentMonth="isCurrentMonth(selectedMonth)"
                    :monthlyPerformance="monthlyPerformance"
                    :selectedMonthTransactions="selectedMonthTransactions"
                    :formatDateTime="formatDateTime"
                    :formatRupiah="formatRupiah"
                    :pocketMap="pocketMap"
                    @prev="selectedMonth = getPreviousMonth(selectedMonth)"
                    @next="selectedMonth = getNextMonth(selectedMonth)"
                    @current="selectedMonth = new Date()"
                    @dashboard="showPerformance = false; showHistory = false"
                />
            </Transition>
        </div>

        <FloatingActionBar
            :showHistory="showHistory"
            @expense="isKeypadOpen = true"
            @transfer="isTransferOpen = true"
            @settings="isPocketSettingsOpen = true"
        />

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

.no-scrollbar::-webkit-scrollbar {
    display: none;
}
.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
