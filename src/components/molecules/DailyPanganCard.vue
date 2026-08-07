<script setup lang="ts">
import { computed } from "vue";
import ProgressBar from "../atoms/ProgressBar.vue";

const props = defineProps<{
    dailyTarget: number;
    remainingToday: number;
    spentToday: number;
    formatRupiah: (amount: number) => string;
}>();

const statusVariant = computed(() => {
    if (props.remainingToday < 0) return "danger";
    if (props.remainingToday < props.dailyTarget * 0.3) return "warn";
    return "safe";
});

const progressPercentage = computed(() => {
    return (props.spentToday / (props.dailyTarget || 1)) * 100;
});
</script>

<template>
    <div
        :class="[
            'bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between',
            statusVariant === 'danger' ? 'border-neon-danger' : statusVariant === 'warn' ? 'border-neon-warn' : 'border-neon-safe',
        ]"
    >
        <div>
            <div class="flex justify-between items-start mb-2">
                <span class="text-text-muted text-[11px] uppercase font-bold tracking-wider">Pangan Hari Ini</span>
                <span
                    :class="[
                        'font-mono text-xs',
                        statusVariant === 'danger' ? 'text-neon-danger' : statusVariant === 'warn' ? 'text-neon-warn' : 'text-neon-safe',
                    ]"
                >
                    {{ remainingToday < 0 ? "OVER" : "SISA" }}
                </span>
            </div>
            <div :class="['font-mono text-2xl font-bold mb-1', statusVariant === 'danger' ? 'text-neon-danger' : 'text-text-primary']">
                Rp {{ remainingToday.toLocaleString("id-ID") }}
            </div>
            <div class="text-text-muted text-[10px]">Tersedia Hari Ini (Target: {{ formatRupiah(dailyTarget) }}/hari)</div>
        </div>
        <ProgressBar :percentage="progressPercentage" :variant="statusVariant" />
    </div>
</template>
