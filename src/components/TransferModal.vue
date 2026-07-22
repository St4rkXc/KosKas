<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Utensils, Home, Fuel, Coffee, ShieldAlert, PiggyBank, Coins, ShoppingBag, Gamepad2, Heart, BookOpen, Plane, Car, Gift, Sparkles, ArrowLeftRight } from "lucide-vue-next";
import { formatRupiah, vibrate } from "../types";
import { useStore } from "../store";

const props = defineProps<{
    isOpen: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const store = useStore();

const fromPocketId = ref("");
const toPocketId = ref("");
const amountStr = ref("0");
const transferNote = ref("");

// Map icon names to Lucide Icon components
const iconMap: Record<string, any> = {
    Utensils,
    Home,
    Fuel,
    Coffee,
    ShieldAlert,
    PiggyBank,
    Coins,
    ShoppingBag,
    Gamepad2,
    Heart,
    BookOpen,
    Plane,
    Car,
    Gift,
    Sparkles,
};

watch(
    () => props.isOpen,
    (newVal) => {
        if (newVal) {
            fromPocketId.value = store.pockets[0]?.id || "";
            toPocketId.value = store.pockets.find((p) => p.id !== fromPocketId.value)?.id || "";
            amountStr.value = "0";
            transferNote.value = "";
            vibrate(10);
        }
    },
);

const amount = computed(() => parseInt(amountStr.value, 10));

const fromPocket = computed(() => {
    return store.pockets.find((p) => p.id === fromPocketId.value);
});

const toPocket = computed(() => {
    return store.pockets.find((p) => p.id === toPocketId.value);
});

const fromPocketBalance = computed(() => {
    if (!fromPocketId.value) return 0;
    return store.pocketBalances[fromPocketId.value] || 0;
});

// Validation
const isTransferValid = computed(() => {
    return fromPocketId.value && toPocketId.value && fromPocketId.value !== toPocketId.value && amount.value > 0 && amount.value <= fromPocketBalance.value;
});

function handleKeyPress(key: string) {
    vibrate(10);
    if (key === "DEL") {
        amountStr.value = amountStr.value.length > 1 ? amountStr.value.slice(0, -1) : "0";
    } else if (key === "000") {
        amountStr.value = amountStr.value === "0" ? "0" : amountStr.value + "000";
    } else {
        amountStr.value = amountStr.value === "0" ? key : amountStr.value + key;
    }
}

function handleSave() {
    if (isTransferValid.value) {
        vibrate([30, 50, 30]);
        store.addTransfer(fromPocketId.value, toPocketId.value, amount.value, transferNote.value.trim() || undefined);
        emit("close");
    }
}

function selectFromPocket(id: string) {
    vibrate(10);
    fromPocketId.value = id;
    if (toPocketId.value === id) {
        toPocketId.value = store.pockets.find((p) => p.id !== id)?.id || "";
    }
}

function selectToPocket(id: string) {
    vibrate(10);
    toPocketId.value = id;
}
</script>

<template>
    <Transition name="fade">
        <div v-if="isOpen" class="fixed inset-0 bg-black bg-opacity-60 z-40" @click="$emit('close')"></div>
    </Transition>

    <Transition name="slide-up">
        <div v-if="isOpen" class="fixed bottom-0 left-0 right-0 bg-bg-surface z-50 flex flex-col border-t border-[#1E1E1E]" style="padding-bottom: env(safe-area-inset-bottom); height: 90vh">
            <!-- Header -->
            <div class="p-6 flex justify-between items-center border-b border-white/5">
                <h2 class="text-white font-sans font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                    <ArrowLeftRight :size="16" class="text-neon-safe" />
                    Transfer Antar Pocket
                </h2>
                <button @click="$emit('close')" class="text-text-muted hover:text-white transition-colors">Batal</button>
            </div>

            <!-- Display -->
            <div class="p-6 flex flex-col items-end border-b border-white/5 bg-[#0A0A0A]">
                <div class="text-text-muted text-xs mb-1 uppercase tracking-wider font-sans"> Jumlah Transfer </div>
                <div class="text-4xl font-mono font-bold tracking-tight text-white overflow-hidden text-ellipsis whitespace-nowrap w-full text-right">
                    {{ amount > 0 ? formatRupiah(amount).replace("Rp", "").trim() : "0" }}
                </div>
                <div class="text-[10px] font-mono mt-1" :class="amount > fromPocketBalance ? 'text-neon-danger' : 'text-text-muted'"> Saldo Pengirim: {{ formatRupiah(fromPocketBalance) }} </div>
            </div>

            <!-- Scrollable Options -->
            <div class="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
                <!-- From Pocket Selector -->
                <div>
                    <label class="text-text-muted text-[10px] uppercase font-bold block mb-2">Dari Pocket (Sumber)</label>
                    <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        <button
                            v-for="pocket in store.pockets"
                            :key="`from-${pocket.id}`"
                            @click="selectFromPocket(pocket.id)"
                            :class="[
                                'px-3.5 py-2.5 rounded font-sans text-xs whitespace-nowrap transition-colors flex items-center gap-2 border',
                                fromPocketId === pocket.id ? `${pocket.colorClass} border-transparent` : 'bg-[#1E1E1E] text-text-muted border-[#1E1E1E]',
                            ]"
                        >
                            <component :is="iconMap[pocket.icon]" :size="12" />
                            <span>{{ pocket.name }} ({{ formatRupiah(store.pocketBalances[pocket.id] || 0) }})</span>
                        </button>
                    </div>
                </div>

                <!-- To Pocket Selector -->
                <div>
                    <label class="text-text-muted text-[10px] uppercase font-bold block mb-2">Ke Pocket (Tujuan)</label>
                    <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        <button
                            v-for="pocket in store.pockets.filter((p) => p.id !== fromPocketId)"
                            :key="`to-${pocket.id}`"
                            @click="selectToPocket(pocket.id)"
                            :class="[
                                'px-3.5 py-2.5 rounded font-sans text-xs whitespace-nowrap transition-colors flex items-center gap-2 border',
                                toPocketId === pocket.id ? `${pocket.colorClass} border-transparent` : 'bg-[#1E1E1E] text-text-muted border-[#1E1E1E]',
                            ]"
                        >
                            <component :is="iconMap[pocket.icon]" :size="12" />
                            <span>{{ pocket.name }} ({{ formatRupiah(store.pocketBalances[pocket.id] || 0) }})</span>
                        </button>
                    </div>
                </div>

                <!-- Optional Note -->
                <div>
                    <label class="text-text-muted text-[10px] uppercase font-bold block mb-2">Catatan (Optional)</label>
                    <input
                        v-model="transferNote"
                        type="text"
                        placeholder="e.g. Alokasi lebih pangan, Tambahan kos"
                        class="w-full bg-[#1E1E1E] border border-white/5 px-3 py-2 text-white text-sm rounded focus:outline-none focus:border-neon-safe"
                    />
                </div>
            </div>

            <!-- Custom Keypad -->
            <div class="grid grid-cols-3 gap-1 p-1 bg-black shrink-0">
                <button
                    v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'DEL']"
                    :key="key"
                    @click="handleKeyPress(key)"
                    class="bg-bg-surface h-12 flex items-center justify-center text-xl font-mono font-bold active:bg-white active:text-black transition-colors text-white"
                >
                    <template v-if="key === 'DEL'">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
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
                :disabled="!isTransferValid"
                :class="[
                    'h-16 w-full font-sans font-bold text-base uppercase tracking-wider transition-colors',
                    isTransferValid ? 'bg-neon-safe text-black active:bg-[#059669]' : 'bg-[#1E1E1E] text-text-muted cursor-not-allowed',
                ]"
            >
                Lakukan Transfer
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
