<script setup lang="ts">
import { computed } from "vue";
import { TrendingUp, TrendingDown } from "lucide-vue-next";
import MonthSelector from "../molecules/MonthSelector.vue";
import SummaryCard from "../molecules/SummaryCard.vue";
import PocketAnalysisRow from "../molecules/PocketAnalysisRow.vue";
import PocketIcon from "../atoms/PocketIcon.vue";
import NeonBadge from "../atoms/NeonBadge.vue";

const props = defineProps<{
    selectedMonthName: string;
    isCurrentMonth: boolean;
    monthlyPerformance: {
        pockets: Array<{
            id: string;
            name: string;
            icon: string;
            colorClass: string;
            allocation: number;
            spent: number;
            prevSpent: number;
            remaining: number;
            utilization: number;
            isOver: boolean;
            transactionCount: number;
            spendingChange: number;
            isBoros: boolean;
        }>;
        totalSpent: number;
        prevTotalSpent: number;
        totalAllocation: number;
        overallUtilization: number;
        mostUsedPocket: {
            name: string;
            utilization: number;
            transactionCount: number;
        } | null;
        leastUsedPocket: {
            name: string;
            utilization: number;
            transactionCount: number;
        } | null;
        totalSpendingChange: number;
        isOverallBoros: boolean;
    };
    selectedMonthTransactions: Array<{
        id: string;
        type: "expense" | "transfer";
        fromPocketId?: string;
        toPocketId?: string;
        amount: number;
        timestamp: number;
        note?: string;
        isRollover?: boolean;
        rolloverDate?: string;
    }>;
    formatDateTime: (ts: number) => string;
    formatRupiah: (amount: number) => string;
    pocketMap: Record<string, { name: string; hexColor: string }>;
}>();

const emit = defineEmits<{
    (e: "prev"): void;
    (e: "next"): void;
    (e: "current"): void;
    (e: "dashboard"): void;
}>();

const utilizationVariant = computed(() => {
    if (props.monthlyPerformance.overallUtilization > 80) return "danger";
    if (props.monthlyPerformance.overallUtilization > 50) return "warn";
    return "safe";
});
</script>

<template>
    <div class="flex flex-col gap-8">
        <MonthSelector
            :selectedMonthName="selectedMonthName"
            :isCurrentMonth="isCurrentMonth"
            @prev="$emit('prev')"
            @next="$emit('next')"
            @current="$emit('current')"
            @dashboard="$emit('dashboard')"
        />

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
            <SummaryCard
                label="Total Alokasi"
                :amount="formatRupiah(monthlyPerformance.totalAllocation)"
                :percentage="100"
                variant="safe"
            />
            <SummaryCard
                label="Total Terpakai"
                :amount="formatRupiah(monthlyPerformance.totalSpent)"
                :percentage="monthlyPerformance.overallUtilization"
                :variant="utilizationVariant"
            />
            <SummaryCard
                label="Utilisasi Keseluruhan"
                :amount="`${monthlyPerformance.overallUtilization.toFixed(1)}%`"
                :percentage="monthlyPerformance.overallUtilization"
                :variant="utilizationVariant"
            />
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
                <PocketAnalysisRow
                    v-for="pocket in monthlyPerformance.pockets"
                    :key="pocket.id"
                    :pocket="pocket"
                    :formatRupiah="formatRupiah"
                />
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
                                    <PocketIcon :icon="pocket.icon" :colorClass="pocket.colorClass" :size="6" />
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
                                            backgroundColor: tx.type === 'expense' ? pocketMap[tx.fromPocketId || '']?.hexColor || '#EF4444' : '#F59E0B',
                                        }"
                                    ></div>
                                    <div>
                                        <div class="text-sm font-medium text-text-primary">
                                            <span v-if="tx.type === 'expense'">
                                                {{ pocketMap[tx.fromPocketId || '']?.name || "Pocket" }}
                                            </span>
                                            <span v-else-if="tx.isRollover"> Pangan Rollover </span>
                                            <span v-else> Transfer </span>
                                        </div>
                                        <div class="text-xs text-text-muted font-mono mt-0.5">
                                            <span v-if="tx.type === 'expense'"> Pengeluaran{{ tx.note ? ` (${tx.note})` : "" }} </span>
                                            <span v-else-if="tx.isRollover"> Sisa pangan harian {{ tx.rolloverDate }} </span>
                                            <span v-else>
                                                {{ pocketMap[tx.fromPocketId || '']?.name }} → {{ pocketMap[tx.toPocketId || '']?.name }}
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
</template>
