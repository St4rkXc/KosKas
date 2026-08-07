<script setup lang="ts">
import { computed } from "vue";
import { Trash2 } from "lucide-vue-next";
import { vibrate, hexFromColorClass } from "../../types";

const props = defineProps<{
    transaction: {
        id: string;
        type: "expense" | "transfer";
        fromPocketId?: string;
        toPocketId?: string;
        amount: number;
        timestamp: number;
        note?: string;
        isRollover?: boolean;
        rolloverDate?: string;
    };
    pocketMap: Record<string, { name: string; hexColor: string }>;
    formatDateTime: (ts: number) => string;
    formatRupiah: (amount: number) => string;
}>();

const emit = defineEmits<{
    (e: "remove", id: string): void;
}>();

const dotColor = computed(() => {
    if (props.transaction.type === "expense") {
        return props.pocketMap[props.transaction.fromPocketId || ""]?.hexColor || "#EF4444";
    }
    return "#F59E0B";
});

function handleRemove() {
    vibrate([20, 20]);
    emit("remove", props.transaction.id);
}
</script>

<template>
    <div class="bg-bg-surface p-4 rounded-sm flex items-center justify-between group overflow-hidden relative">
        <div class="flex items-center gap-4 z-10 pointer-events-none">
            <div
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: dotColor }"
            ></div>

            <div>
                <div class="text-sm font-semibold text-text-primary">
                    <span v-if="transaction.type === 'expense'">
                        {{ pocketMap[transaction.fromPocketId || ""]?.name || "Pocket" }}
                    </span>
                    <span v-else-if="transaction.isRollover"> Pangan Rollover </span>
                    <span v-else> Transfer </span>
                </div>

                <div class="text-[10px] text-text-muted font-mono mt-0.5">
                    {{ formatDateTime(transaction.timestamp) }} •
                    <span v-if="transaction.type === 'expense'"> Pengeluaran{{ transaction.note ? ` (${transaction.note})` : "" }} </span>
                    <span v-else-if="transaction.isRollover"> Sisa pangan harian {{ transaction.rolloverDate }} </span>
                    <span v-else>
                        {{ pocketMap[transaction.fromPocketId || ""]?.name }} → {{ pocketMap[transaction.toPocketId || ""]?.name }}
                        {{ transaction.note ? ` (${transaction.note})` : "" }}
                    </span>
                </div>
            </div>
        </div>

        <div :class="['font-mono text-sm z-10 pointer-events-none', transaction.type === 'expense' ? 'text-neon-danger' : 'text-text-muted']">
            {{ transaction.type === "expense" ? "-" : "" }} {{ formatRupiah(transaction.amount) }}
        </div>

        <button
            v-if="!transaction.isRollover"
            @click="handleRemove"
            class="absolute inset-y-0 right-0 w-16 bg-neon-danger flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity translate-x-full group-hover:translate-x-0 active:bg-red-600"
            style="-webkit-tap-highlight-color: transparent"
            :aria-label="`Hapus transaksi ${transaction.id}`"
        >
            <Trash2 :size="20" class="text-bg-primary" />
        </button>
    </div>
</template>
