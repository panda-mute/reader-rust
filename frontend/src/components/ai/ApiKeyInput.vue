<template>
  <div class="api-key-input">
    <input
      :value="modelValue"
      :type="revealed ? 'text' : 'password'"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      class="icon-action"
      type="button"
      :title="revealed ? '隐藏 API Key' : '显示 API Key'"
      :aria-label="revealed ? '隐藏 API Key' : '显示 API Key'"
      @click="revealed = !revealed"
    >
      <svg v-if="revealed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="m1 1 22 22" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: 'sk-...',
})

defineEmits<{
  'update:modelValue': [value: string]
}>()

const revealed = ref(false)
</script>

<style scoped>
.api-key-input {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.api-key-input input {
  min-height: 40px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  padding: 0 38px 0 11px;
  font-size: 14px;
  outline: none;
}

.api-key-input input:focus {
  border-color: var(--color-primary-border, var(--color-primary));
  box-shadow: 0 0 0 3px rgba(212, 129, 42, 0.1);
}

.icon-action {
  position: absolute;
  right: 4px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.icon-action:hover {
  color: var(--color-text);
  background: var(--color-bg-hover);
}

.icon-action svg {
  width: 16px;
  height: 16px;
}
</style>
