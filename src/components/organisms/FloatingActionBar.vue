<script setup lang="ts">
import { Plus, ArrowLeftRight, Settings } from "lucide-vue-next";

defineProps<{
    showHistory: boolean;
}>();

defineEmits<{
    (e: "expense"): void;
    (e: "transfer"): void;
    (e: "settings"): void;
}>();
</script>

<template>
    <div class="fixed bottom-8 sm:bottom-12 right-8 sm:right-12 z-30 flex gap-4">
        <div v-if="!showHistory" class="flex gap-4">
            <button
                @click="$emit('transfer')"
                class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-neon-warn hover:text-amber-400 hover:bg-[#2A2A2A] shadow-lg w-fit h-fit"
            >
                <ArrowLeftRight :size="14" />
                Transfer
            </button>
            <button
                @click="$emit('settings')"
                class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-neon-safe hover:text-[#059669] hover:bg-[#2A2A2A] shadow-lg w-fit h-fit"
            >
                <Settings :size="14" />
                Alokasi
            </button>
        </div>

        <div>
            <button
                @click="$emit('expense')"
                class="w-16 h-16 sm:w-20 sm:h-20 bg-neon-safe text-bg-primary rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-95 active:scale-90 transition-transform"
                aria-label="Tambah pengeluaran baru"
            >
                <Plus :size="36" :stroke-width="2.5" />
            </button>
        </div>
    </div>
</template>
