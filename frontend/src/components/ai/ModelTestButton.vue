<template>
  <div class="model-test">
    <div class="test-actions">
      <button class="test-btn" type="button" :disabled="running" @click="run">
        <span v-if="running" class="test-spinner" aria-hidden="true"></span>
        {{ running ? '测试中...' : label }}
      </button>
      <button v-if="running" class="cancel-btn" type="button" @click="cancelRunning">取消</button>
    </div>
    <p v-if="result" class="test-result" :class="result.ok ? 'ok' : 'fail'" role="status">
      <strong>{{ result.ok ? '成功' : '失败' }}</strong>
      <span>{{ result.message }}</span>
      <small v-if="result.ok && result.elapsedMs">{{ (result.elapsedMs / 1000).toFixed(1) }} 秒</small>
    </p>
    <audio v-if="audioUrl" class="test-audio" :src="audioUrl" controls autoplay></audio>
    <img v-if="imageUrl" class="test-image" :src="imageUrl" alt="测试生成的图片" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { ModelTestResult } from '../../utils/aiModelTest'

const props = withDefaults(defineProps<{
  runner: (signal?: AbortSignal) => Promise<ModelTestResult>
  label?: string
  // Asked before running, e.g. when the test costs money.
  confirmText?: string
  // Any change to this value clears the last result, so it never describes stale settings.
  watchKey?: string
}>(), {
  label: '测试连接',
  confirmText: '',
  watchKey: '',
})

const running = ref(false)
const result = ref<{ ok: boolean; message: string; elapsedMs: number } | null>(null)
const audioUrl = ref('')
const imageUrl = ref('')
let activeController: AbortController | null = null
let runSequence = 0

watch(() => props.watchKey, () => {
  abortActive()
  clearResult()
})

function abortActive() {
  if (activeController) {
    activeController.abort()
    activeController = null
  }
}

function cancelRunning() {
  runSequence += 1
  abortActive()
  running.value = false
  result.value = null
}

async function run() {
  if (props.confirmText && !window.confirm(props.confirmText)) return
  abortActive()
  clearResult()
  const seq = ++runSequence
  const controller = new AbortController()
  activeController = controller
  running.value = true
  try {
    const outcome = await props.runner(controller.signal)
    if (seq !== runSequence || controller.signal.aborted) return
    result.value = { ok: true, message: outcome.message, elapsedMs: outcome.elapsedMs }
    if (outcome.audio) audioUrl.value = URL.createObjectURL(outcome.audio)
    if (outcome.imageUrl) imageUrl.value = outcome.imageUrl
  } catch (error) {
    if (seq !== runSequence || controller.signal.aborted) return
    result.value = { ok: false, message: (error as Error).message || '测试失败', elapsedMs: 0 }
  } finally {
    if (activeController === controller) {
      activeController = null
    }
    if (seq === runSequence) {
      running.value = false
    }
  }
}

function clearResult() {
  result.value = null
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = ''
  imageUrl.value = ''
}

onBeforeUnmount(() => {
  runSequence += 1
  abortActive()
  clearResult()
})
</script>

<style scoped>
.model-test {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.test-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cancel-btn {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.cancel-btn:hover {
  color: var(--color-danger, #d14b4b);
  border-color: rgba(209, 75, 75, 0.35);
}

.test-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.test-btn:hover:not(:disabled) {
  border-color: var(--color-primary-border, var(--color-primary));
  color: var(--color-primary);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.test-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: test-spin 0.8s linear infinite;
}

@keyframes test-spin {
  to { transform: rotate(360deg); }
}

.test-result {
  justify-self: stretch;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.test-result.ok {
  color: var(--color-success, #2f8f5b);
  background: rgba(47, 143, 91, 0.08);
}

.test-result.fail {
  color: var(--color-danger, #d14b4b);
  background: rgba(209, 75, 75, 0.08);
}

.test-result small {
  color: var(--color-text-tertiary);
}

.test-audio {
  width: 100%;
  max-width: 320px;
  height: 36px;
}

.test-image {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
}
</style>
