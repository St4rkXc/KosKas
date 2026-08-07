<script setup lang="ts">
import { ArrowLeftRight, RefreshCw } from "lucide-vue-next";
import TransactionRow from "../molecules/TransactionRow.vue";

const props = defineProps<{
    transactions: Array<{
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
    pocketMap: Record<string, { name: string; hexColor: string }>;
    formatDateTime: (ts: number) => string;
    formatRupiah: (amount: number) => string;
}>();

const emit = defineEmits<{
    (e: "remove", id: string): void;
    (e: "transfer"): void;
    (e: "settings"): void;
    (e: "reset"): void;
}>();
</script>

<template>
    <div class="flex flex-col gap-2">
        <div class="flex justify-between items-end mb-4">
            <h2 class="text-text-muted text-[11px] uppercase font-bold tracking-[0.2em]">Aktivitas Terakhir</h2>
            <div class="h-px flex-1 mx-4 bg-bg-surface"></div>
            <div class="flex gap-4 items-center">
                <button @click="$emit('transfer')" class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neon-warn hover:text-amber-400">
                    <ArrowLeftRight :size="10" /> Transfer
                </button>
                <button @click="$emit('settings')" class="text-[10px] font-mono uppercase tracking-wider text-neon-safe hover:text-[#059669]"> Alokasi </button>
                <button @click="$emit('reset')" class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-neon-danger hover:text-red-400">
                    <RefreshCw :size="12" /> Reset
                </button>
            </div>
        </div>

        <div v-if="transactions.length === 0" class="text-center text-text-muted py-10 font-mono text-sm"> Belum ada aktivitas transaksi. </div>

        <TransitionGroup v-else name="list" tag="div" class="space-y-2">
            <TransactionRow
                v-for="tx in transactions"
                :key="tx.id"
                :transaction="tx"
                :pocketMap="pocketMap"
                :formatDateTime="formatDateTime"
                :formatRupiah="formatRupiah"
                @remove="$emit('remove', $event)"
            />
        </TransitionGroup>
    </div>
</template>

<style scoped>
.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateX(-30px);
}
</style>
