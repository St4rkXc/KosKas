<script setup lang="ts">
import PocketIcon from "../atoms/PocketIcon.vue";
import ProgressBar from "../atoms/ProgressBar.vue";

defineProps<{
    pocket: {
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
    };
    formatRupiah: (amount: number) => string;
}>();
</script>

<template>
    <div class="group">
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2.5">
                <PocketIcon :icon="pocket.icon" :colorClass="pocket.colorClass" />
                <span class="font-medium text-text-primary">{{ pocket.name }}</span>
            </div>
            <div class="flex items-center gap-3">
                <span v-if="pocket.prevSpent > 0" class="text-xs font-mono px-2 py-0.5 rounded" :class="pocket.isBoros ? 'bg-neon-danger/10 text-neon-danger' : 'bg-neon-safe/10 text-neon-safe'">
                    {{ pocket.isBoros ? "Boros" : "Hemat" }} {{ pocket.spendingChange.toFixed(0) }}%
                </span>
                <span class="text-sm font-mono text-text-muted">{{ formatRupiah(pocket.spent) }} / {{ formatRupiah(pocket.allocation) }}</span>
            </div>
        </div>
        <ProgressBar :percentage="pocket.utilization" :colorClass="pocket.colorClass" />
        <div class="flex justify-between mt-1.5 text-xs text-text-muted font-mono">
            <span>{{ pocket.utilization.toFixed(1) }}% terpakai</span>
            <span>{{ pocket.transactionCount }}x transaksi</span>
        </div>
    </div>
</template>
