<script setup lang="ts">
defineProps<{
    isOpen: boolean;
}>();

defineEmits<{
    (e: "close"): void;
}>();
</script>

<template>
    <Transition name="fade">
        <div v-if="isOpen" class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>
    </Transition>

    <Transition name="slide-up">
        <div v-if="isOpen" class="fixed bottom-0 left-0 right-0 z-50">
            <slot />
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

.slide-up-enter-active {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-leave-active {
    transition: transform 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(100%);
}
</style>
