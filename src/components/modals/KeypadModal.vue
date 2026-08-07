<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { formatRupiah, vibrate, parseAmount } from "../../types";
import { useStore } from "../../store";

const props = defineProps<{
    isOpen: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "save", pocketId: string, amount: number): void;
}>();

const store = useStore();

const amountStr = ref("0");
const selectedPocketId = ref("pangan");

watch(
    () => props.isOpen,
    (newVal) => {
        if (newVal) {
            amountStr.value = "0";
            // Default to 'pangan' or the first available pocket
            const availablePockets = store.pockets.filter((p) => p.id !== "saving" && p.id !== "leftover");
            selectedPocketId.value = availablePockets.find((p) => p.id === "pangan")?.id || availablePockets[0]?.id || "";
            vibrate(10);
        }
    },
);

const amount = computed(() => parseAmount(amountStr.value));

function handleKeyPress(key: string) {
    vibrate(10);
    if (key === "DEL") {
        amountStr.value = amountStr.value.length > 1 ? amountStr.value.slice(0, -1) : "0";
    } else if (key === "000") {
        if (amountStr.value === "0") return;
        if (amountStr.value.length + 3 > 15) return;
        amountStr.value += "000";
    } else {
        if (amountStr.value.length >= 15) return;
        amountStr.value = amountStr.value === "0" ? key : amountStr.value + key;
    }
}

function handleSave() {
    if (amount.value > 0 && selectedPocketId.value) {
        vibrate([30, 50, 30]);
        emit("save", selectedPocketId.value, amount.value);
        emit("close");
    }
}

function handlePocketSelect(id: string) {
    vibrate(10);
    selectedPocketId.value = id;
}
</script>

<template>
    <Transition name="fade">
        <div v-if="isOpen" class="fixed inset-0 bg-black bg-opacity-60 z-40" @click="$emit('close')"></div>
    </Transition>

    <Transition name="slide-up">
        <div v-if="isOpen" class="fixed bottom-0 left-0 right-0 bg-bg-surface z-50 flex flex-col" style="padding-bottom: env(safe-area-inset-bottom)">
            <!-- Display -->
            <div class="p-6 flex flex-col items-end border-b border-white/5">
                <div class="text-text-muted text-sm mb-1 uppercase tracking-wider font-sans"> Pengeluaran </div>
                <div class="text-5xl font-mono font-bold tracking-tight text-white overflow-hidden text-ellipsis whitespace-nowrap w-full text-right">
                    {{ amount > 0 ? formatRupiah(amount).replace("Rp", "").trim() : "0" }}
                </div>
            </div>

            <!-- Pocket Selector -->
            <div class="flex overflow-x-auto gap-2 p-4 no-scrollbar border-b border-white/5 bg-[#0A0A0A]">
                <button
                    v-for="pocket in store.pockets.filter((p) => p.id !== 'saving' && p.id !== 'leftover')"
                    :key="pocket.id"
                    @click="handlePocketSelect(pocket.id)"
                    :class="[
                        'px-4 py-2 rounded font-sans text-sm whitespace-nowrap transition-colors border',
                        selectedPocketId === pocket.id ? `${pocket.colorClass} border-transparent` : 'bg-[#1E1E1E] text-text-muted border-[#1E1E1E]',
                    ]"
                >
                    {{ pocket.name }}
                </button>
            </div>

            <!-- Keypad -->
            <div class="grid grid-cols-3 gap-1 p-1 bg-black">
                <button
                    v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'DEL']"
                    :key="key"
                    @click="handleKeyPress(key)"
                    class="bg-bg-surface h-16 sm:h-20 flex items-center justify-center text-2xl font-mono font-bold active:bg-white active:text-black transition-colors text-white"
                >
                    <template v-if="key === 'DEL'">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
                            <line x1="18" y1="9" x2="12" y2="15" />
                            <line x1="12" y1="9" x2="18" y2="15" />
                        </svg>
                    </template>
                    <template v-else>
                        {{ key }}
                    </template>
                </button>
            </div>

            <!-- Save Button -->
            <button
                @click="handleSave"
                :disabled="amount === 0 || !selectedPocketId"
                :class="[
                    'h-16 w-full font-sans font-bold text-lg uppercase tracking-wider transition-colors',
                    amount > 0 && selectedPocketId ? 'bg-neon-safe text-black active:bg-[#059669]' : 'bg-[#1E1E1E] text-text-muted cursor-not-allowed',
                ]"
            >
                Simpan
            </button>
        </div>
    </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}

.no-scrollbar::-webkit-scrollbar {
    display: none;
}
.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
