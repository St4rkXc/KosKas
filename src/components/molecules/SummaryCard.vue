<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    label: string;
    amount: string;
    percentage: number;
    variant?: "safe" | "warn" | "danger";
}>();

const barVariant = computed(() => props.variant || "safe");
</script>

<template>
    <div class="bg-bg-surface rounded-lg p-5 border border-bg-surface/50 hover:border-bg-surface transition-colors">
        <div class="text-text-muted text-xs font-medium mb-2">{{ label }}</div>
        <div class="font-mono text-2xl font-bold text-text-primary">{{ amount }}</div>
        <div class="mt-3 h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div
                class="h-full rounded-full transition-all"
                :class="barVariant === 'danger' ? 'bg-neon-danger' : barVariant === 'warn' ? 'bg-neon-warn' : 'bg-neon-safe'"
                :style="{ width: `${Math.min(percentage, 100)}%` }"
            ></div>
        </div>
    </div>
</template>
