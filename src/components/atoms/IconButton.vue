<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    variant?: 'default' | 'safe' | 'warn' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    iconSize?: number;
}>();

const classes = computed(() => {
    const base = 'flex items-center justify-center transition-colors';
    const variantMap = {
        default: 'text-text-muted hover:text-text-primary',
        safe: 'text-neon-safe hover:text-[#059669]',
        warn: 'text-neon-warn hover:text-amber-400',
        danger: 'text-neon-danger hover:text-red-400',
    };
    const sizeMap = {
        sm: 'p-1',
        md: 'p-2',
        lg: 'p-3',
    };
    return `${base} ${variantMap[props.variant || 'default']} ${sizeMap[props.size || 'md']}`;
});
</script>

<template>
    <button :class="classes" :aria-label="$attrs['aria-label'] || 'button'">
        <slot />
    </button>
</template>
