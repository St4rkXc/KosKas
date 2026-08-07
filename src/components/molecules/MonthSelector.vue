<script setup lang="ts">
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-vue-next";

defineProps<{
    selectedMonthName: string;
    isCurrentMonth: boolean;
}>();

defineEmits<{
    (e: "prev"): void;
    (e: "next"): void;
    (e: "current"): void;
    (e: "dashboard"): void;
}>();
</script>

<template>
    <div class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 pb-6 border-b border-bg-surface">
        <div class="flex items-center gap-3">
            <button @click="$emit('prev')" class="text-text-muted hover:text-text-primary transition-colors p-1">
                <ChevronLeft :size="24" />
            </button>
            <div class="flex flex-col">
                <h2 class="text-text-primary text-2xl font-bold">{{ selectedMonthName }}</h2>
                <span class="text-text-muted text-xs mt-0.5">Laporan Bulanan</span>
            </div>
            <button
                @click="$emit('next')"
                :class="['transition-colors p-1', isCurrentMonth ? 'text-text-muted/30 cursor-not-allowed' : 'text-text-muted hover:text-text-primary']"
                :disabled="isCurrentMonth"
            >
                <ChevronRight :size="24" />
            </button>
        </div>
        <div class="flex gap-3 sm:ml-auto">
            <button v-if="!isCurrentMonth" @click="$emit('current')" class="px-3 py-1.5 text-xs font-medium text-neon-safe border border-neon-safe/30 rounded hover:bg-neon-safe/10 transition-colors">
                Bulan Ini
            </button>
            <button @click="$emit('dashboard')" class="px-3 py-1.5 text-xs font-medium text-text-muted border border-bg-surface rounded hover:text-text-primary transition-colors flex items-center gap-1.5">
                <LayoutGrid :size="12" /> Dashboard
            </button>
        </div>
    </div>
</template>
