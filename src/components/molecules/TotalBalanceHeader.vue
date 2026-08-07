<script setup lang="ts">
import { computed } from "vue";
import NeonBadge from "../atoms/NeonBadge.vue";

const props = defineProps<{
    totalRemaining: number;
    totalAllocation: number;
    daysRemaining: number;
    formatRupiah: (amount: number) => string;
}>();

const statusVariant = computed(() => {
    if (props.totalRemaining < 0) return "danger";
    if (props.totalRemaining < props.totalAllocation * 0.2) return "warn";
    return "safe";
});

const statusLabel = computed(() => {
    if (props.totalRemaining < 0) return "Danger";
    if (props.totalRemaining < props.totalAllocation * 0.2) return "Warning";
    return "Aman";
});
</script>

<template>
    <header class="flex-none flex flex-col justify-center items-start border-b border-bg-surface mb-8 pb-8 mt-8 sm:mt-12">
        <div class="w-full flex justify-between items-start">
            <div class="text-text-muted text-xs font-mono uppercase tracking-[0.2em] mb-4">Total Sisa Saldo (Semua Pocket)</div>
        </div>

        <div class="flex items-baseline">
            <span class="text-neon-safe font-mono text-xl sm:text-3xl font-bold mr-2 sm:mr-4">Rp</span>
            <h1 class="text-[48px] sm:text-[80px] md:text-[112px] font-mono font-extrabold leading-none tracking-tighter text-white whitespace-nowrap">
                {{ formatRupiah(totalRemaining).replace("Rp", "").trim() }}
            </h1>
        </div>

        <div class="mt-4 flex items-center gap-4">
            <NeonBadge :variant="statusVariant">{{ statusLabel }}</NeonBadge>
            <span class="text-text-muted font-mono text-sm">{{ daysRemaining }} Hari Menuju Reset</span>
        </div>
    </header>
</template>
