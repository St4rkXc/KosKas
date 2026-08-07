<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    percentage: number;
    colorClass?: string;
    variant?: "safe" | "warn" | "danger";
}>();

const barClasses = computed(() => {
    if (props.colorClass) return props.colorClass;
    const variantMap = {
        safe: "bg-neon-safe",
        warn: "bg-neon-warn",
        danger: "bg-neon-danger",
    };
    return variantMap[props.variant || "safe"];
});
</script>

<template>
    <div class="w-full h-2 bg-[#1E1E1E] rounded-xs overflow-hidden">
        <div
            :class="['h-full rounded-full transition-all duration-300 ease-out', barClasses]"
            :style="{ width: `${Math.min(percentage, 100)}%` }"
        ></div>
    </div>
</template>
