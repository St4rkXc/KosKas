<script setup lang="ts">
import { computed } from "vue";
import PocketIcon from "../atoms/PocketIcon.vue";
import ProgressBar from "../atoms/ProgressBar.vue";
import { hexFromColorClass } from "../../types";

const props = defineProps<{
    pocket: {
        id: string;
        name: string;
        icon: string;
        colorClass: string;
        allocation: number;
    };
    balance: number;
    stats: {
        spent: number;
        remaining: number;
        percentage: number;
        isOver: boolean;
    };
}>();

const hexColor = computed(() => hexFromColorClass(props.pocket.colorClass));
</script>

<template>
    <div
        class="bg-bg-surface p-5 rounded-sm border-l-4 flex flex-col justify-between border-l-current"
        :style="{ borderLeftColor: hexColor || '#10B981' }"
    >
        <div>
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <PocketIcon :icon="pocket.icon" :colorClass="pocket.colorClass" :size="6" />
                    <span class="text-text-muted text-[11px] uppercase font-bold tracking-wider">{{ pocket.name }}</span>
                </div>
                <span :class="['font-mono text-xs', stats.isOver ? 'text-neon-danger' : 'text-neon-safe']">
                    {{ stats.isOver ? "OVER" : "AMAN" }}
                </span>
            </div>
            <div :class="['font-mono text-2xl font-bold mb-1', stats.isOver ? 'text-neon-danger' : 'text-text-primary']">
                Rp {{ balance.toLocaleString("id-ID") }}
            </div>
            <div :class="['text-[10px]', stats.isOver ? 'text-neon-danger uppercase font-bold' : 'text-text-muted']">
                {{ stats.isOver ? "Rem Dulu, Bro" : "Sisa Saldo" }}
            </div>
        </div>
        <ProgressBar :percentage="stats.percentage" :colorClass="pocket.colorClass" />
    </div>
</template>
