<script setup lang="ts">
defineProps<{ primary?: boolean; compact?: boolean; iconOnly?: boolean }>();
</script>

<template>
  <button
    class="inline-flex cursor-pointer items-center justify-center rounded border font-medium enabled:hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
    :class="[
      iconOnly ? 'size-8' : compact ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-sm',
      primary
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-300 bg-white text-slate-800',
    ]"
  >
    <slot />
  </button>
</template>
