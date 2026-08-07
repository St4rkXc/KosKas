<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    variant: "safe" | "warn" | "danger";
    size?: "sm" | "md";
}>();

const classes = computed(() => {
    const colorMap = {
        safe: "bg-neon-safe",
        warn: "bg-neon-warn",
        danger: "bg-neon-danger",
    };
    const sizeMap = {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-3 py-1 text-[10px]",
    };
    return `${colorMap[props.variant]} ${sizeMap[props.size || "md"]} text-bg-primary font-bold uppercase rounded-sm`;
});
</script>

<template>
    <span :class="classes">
        <slot />
    </span>
</template>
