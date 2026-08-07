<script setup lang="ts">
import { resolveIcon } from "../../iconMap";

defineProps<{
    icon: string;
    colorClass: string;
    size?: number;
}>();
</script>

<template>
    <div :class="['flex items-center justify-center shrink-0', colorClass, size === 6 ? 'w-6 h-6 rounded-md' : 'w-8 h-8 rounded-lg']">
        <component :is="resolveIcon(icon)" :size="size === 6 ? 12 : 14" />
    </div>
</template>
