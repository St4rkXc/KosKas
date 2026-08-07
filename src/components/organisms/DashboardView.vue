<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../../store";
import { hexFromColorClass } from "../../types";
import PocketCard from "../molecules/PocketCard.vue";
import DailyPanganCard from "../molecules/DailyPanganCard.vue";

const props = defineProps<{
    pocketStats: Record<string, { spent: number; remaining: number; percentage: number; isOver: boolean }>;
    dailyPanganStats: { dailyTarget: number; remainingToday: number; spentToday: number };
    formatRupiah: (amount: number) => string;
}>();

const store = useStore();

const pocketMap = computed(() => {
    const map: Record<string, (typeof store.pockets)[number] & { hexColor: string }> = {};
    for (const p of store.pockets) {
        map[p.id] = { ...p, hexColor: hexFromColorClass(p.colorClass) };
    }
    return map;
});
</script>

<template>
    <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DailyPanganCard
            :dailyTarget="dailyPanganStats.dailyTarget"
            :remainingToday="dailyPanganStats.remainingToday"
            :spentToday="dailyPanganStats.spentToday"
            :formatRupiah="formatRupiah"
        />

        <PocketCard
            v-for="pocket in store.pockets"
            :key="pocket.id"
            :pocket="pocketMap[pocket.id]"
            :balance="store.pocketBalances[pocket.id] || 0"
            :stats="pocketStats[pocket.id]"
        />
    </div>
</template>
