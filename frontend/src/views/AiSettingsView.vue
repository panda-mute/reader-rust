<template>
  <div class="ai-settings-view">
    <div class="ai-settings-shell">
      <header class="page-header">
        <button class="back-btn" type="button" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <div class="page-title">
          <h1>AI 模型设置</h1>
          <p>AI 资料（角色、关系、地图）和听书语音使用的模型，所有书共用这一套配置。</p>
        </div>
      </header>

      <div v-if="loading" class="page-loading">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else>
        <!-- Personal configuration: stored in this browser only -->
        <section class="settings-section">
          <div class="section-head">
            <h2>我的配置</h2>
            <p>只保存在当前浏览器，换设备或清除浏览器数据后需要重新填写。</p>
          </div>

          <h3 class="group-title">AI 资料</h3>
          <article class="settings-card">
            <div class="settings-card-head">
              <h4>模型来源</h4>
              <span class="status-tag" :class="{ active: canUseServerModel }">
                {{ canUseServerModel ? '可使用后端配置' : '未开通后端配置' }}
              </span>
            </div>
            <div class="source-options">
              <button
                type="button"
                class="source-option"
                :class="{ active: personalAi.modelSource === 'server' }"
                :disabled="!canUseServerModel"
                @click="personalAi.modelSource = 'server'"
              >
                使用后端配置
              </button>
              <button
                type="button"
                class="source-option"
                :class="{ active: personalAi.modelSource === 'browser' }"
                @click="personalAi.modelSource = 'browser'"
              >
                自己配置
              </button>
            </div>
            <p class="settings-hint">
              <template v-if="personalAi.modelSource === 'server'">
                使用管理员保存在服务器上的模型，无需填写地址和 Key。
              </template>
              <template v-else-if="canUseServerModel">
                使用你自己的模型服务。也可以切换到「使用后端配置」，直接使用管理员配置好的模型。
              </template>
              <template v-else>
                使用你自己的模型服务。如需使用服务器上的模型，请让管理员在「用户管理」中为你开启「AI 模型」权限。
              </template>
            </p>
          </article>

          <div v-if="personalAi.modelSource === 'server'" class="settings-cards">
            <article class="settings-card">
              <div class="settings-card-head">
                <h4>文本模型</h4>
                <span class="status-tag" :class="{ active: serverReady.text }">{{ serverReady.text ? '已启用' : '未配置' }}</span>
              </div>
              <p class="summary-line">{{ serverConfig?.text.model || '管理员尚未配置文本模型' }}</p>
              <ModelTestButton v-if="serverReady.text" :runner="testServerText" />
            </article>
            <article class="settings-card">
              <div class="settings-card-head">
                <h4>图片模型</h4>
                <span class="status-tag" :class="{ active: serverReady.image }">{{ serverReady.image ? '已启用' : '未配置' }}</span>
              </div>
              <p class="summary-line">
                {{ serverConfig?.image.model || '管理员尚未配置图片模型' }}
                <template v-if="serverConfig?.image.model"> · {{ serverConfig.image.imageSize || '1024x1024' }}</template>
              </p>
              <ModelTestButton v-if="serverReady.image" :runner="testServerImage" label="测试生成" :confirm-text="IMAGE_TEST_CONFIRM" />
            </article>
          </div>

          <template v-else>
            <div class="settings-cards">
              <article class="settings-card">
                <div class="settings-card-head">
                  <h4>文本模型</h4>
                  <span class="card-note">用于生成角色、关系、地点资料</span>
                </div>
                <div class="settings-grid">
                  <label class="field span-2">
                    <span>Base URL</span>
                    <input v-model="personalAi.textBaseUrl" type="url" placeholder="https://api.openai.com" />
                    <small class="field-note">{{ requestUrlNote(personalAi.textBaseUrl, personalAi.textUseFullUrl, '/v1/chat/completions') }}</small>
                  </label>
                  <label class="field">
                    <span>模型</span>
                    <input v-model="personalAi.textModel" placeholder="gpt-4o-mini" />
                  </label>
                  <label class="field">
                    <span>API Key</span>
                    <input v-model="personalAi.textApiKey" type="password" autocomplete="off" placeholder="sk-..." />
                  </label>
                </div>
                <div class="card-foot">
                  <label class="switch-line compact" title="开启后按 Base URL 原样请求，不再自动拼接 /v1/... 路径">
                    <input v-model="personalAi.textUseFullUrl" type="checkbox" />
                    <span class="switch-ui"></span>
                    <span>Base URL 是完整接口地址</span>
                  </label>
                  <ModelTestButton :runner="testPersonalText" :watch-key="personalTextKey" />
                </div>
              </article>

              <article class="settings-card">
                <div class="settings-card-head">
                  <h4>图片模型</h4>
                  <span class="card-note">用于绘制世界地图，可不填</span>
                </div>
                <div class="settings-grid">
                  <label class="field span-2">
                    <span>Base URL</span>
                    <input v-model="personalAi.imageBaseUrl" type="url" placeholder="https://api.openai.com" />
                    <small class="field-note">{{ requestUrlNote(personalAi.imageBaseUrl, personalAi.imageUseFullUrl, '/v1/images/generations') }}</small>
                  </label>
                  <label class="field">
                    <span>模型</span>
                    <input v-model="personalAi.imageModel" placeholder="gpt-image-1" />
                  </label>
                  <label class="field">
                    <span>尺寸</span>
                    <select v-model="personalAi.imageSize">
                      <option v-for="size in IMAGE_SIZES" :key="size" :value="size">{{ size }}</option>
                    </select>
                  </label>
                  <label class="field span-2">
                    <span>API Key</span>
                    <input v-model="personalAi.imageApiKey" type="password" autocomplete="off" placeholder="sk-..." />
                  </label>
                </div>
                <div class="card-foot">
                  <label class="switch-line compact" title="开启后按 Base URL 原样请求，不再自动拼接 /v1/... 路径">
                    <input v-model="personalAi.imageUseFullUrl" type="checkbox" />
                    <span class="switch-ui"></span>
                    <span>Base URL 是完整接口地址</span>
                  </label>
                  <ModelTestButton
                    :runner="testPersonalImage"
                    :watch-key="personalImageKey"
                    label="测试生成"
                    :confirm-text="IMAGE_TEST_CONFIRM"
                  />
                </div>
              </article>
            </div>

            <article class="settings-card">
              <label class="switch-line">
                <input v-model="personalAi.useBackendProxy" type="checkbox" />
                <span class="switch-ui"></span>
                <span>通过阅读服务器转发请求</span>
              </label>
              <p class="settings-hint">
                浏览器直接请求模型服务时，可能被跨域限制拦截（测试时会提示「无法连接」）。开启后由阅读服务器代为请求，API Key 只用于转发，不会保存在服务器上。
              </p>
            </article>
          </template>

          <h3 id="speech-settings" class="group-title">听书语音</h3>
          <p class="group-hint">
            这里配置语音服务的地址和音色。朗读时用哪个引擎、语速和请求模式，在阅读页的「设置 → 朗读」里选择。
          </p>
          <div class="settings-cards">
            <article v-for="engine in SPEECH_ENGINES" :key="engine.key" class="settings-card">
              <div class="settings-card-head">
                <h4>{{ engine.label }}</h4>
                <span v-if="speechSource(engine.key) === 'server'" class="status-tag" :class="{ active: serverReady.speech }">
                  {{ serverReady.speech ? '使用后端配置' : '后端未配置' }}
                </span>
              </div>
              <div class="source-options">
                <button
                  type="button"
                  class="source-option"
                  :class="{ active: speechSource(engine.key) === 'server' }"
                  :disabled="!canUseServerModel"
                  @click="setSpeechSource(engine.key, 'server')"
                >
                  使用后端配置
                </button>
                <button
                  type="button"
                  class="source-option"
                  :class="{ active: speechSource(engine.key) === 'browser' }"
                  @click="setSpeechSource(engine.key, 'browser')"
                >
                  自己配置
                </button>
              </div>

              <template v-if="speechSource(engine.key) === 'server'">
                <p class="settings-hint">
                  朗读时使用管理员配置的语音服务（当前：{{ serverSpeechSummary }}）。
                </p>
                <div v-if="serverReady.speech" class="card-foot end">
                  <ModelTestButton :runner="testServerSpeech" label="试听" />
                </div>
              </template>

              <template v-else-if="engine.key === 'openai'">
                <div class="settings-grid spaced">
                  <label class="field span-2">
                    <span>服务地址</span>
                    <input v-model="personalSpeech.openaiBaseUrl" type="url" placeholder="https://api.openai.com" />
                    <small class="field-note">{{ requestUrlNote(personalSpeech.openaiBaseUrl, false, '/v1/audio/speech') }}</small>
                  </label>
                  <label class="field span-2">
                    <span>API Key</span>
                    <input v-model="personalSpeech.openaiApiKey" type="password" autocomplete="off" placeholder="sk-..." />
                  </label>
                  <label class="field">
                    <span>模型</span>
                    <input v-model="personalSpeech.openaiModel" placeholder="gpt-4o-mini-tts" />
                  </label>
                  <label class="field">
                    <span>音色</span>
                    <input v-model="personalSpeech.openaiVoice" placeholder="alloy" />
                  </label>
                  <label class="field">
                    <span>音频格式</span>
                    <select v-model="personalSpeech.openaiFormat">
                      <option v-for="format in OPENAI_FORMATS" :key="format" :value="format">{{ format }}</option>
                    </select>
                  </label>
                </div>
                <div class="card-foot end">
                  <ModelTestButton :runner="testPersonalOpenAISpeech" :watch-key="personalOpenAIKey" label="试听" />
                </div>
              </template>

              <template v-else>
                <div class="settings-grid spaced">
                  <label class="field span-2">
                    <span>服务地址</span>
                    <input v-model="personalSpeech.mimoBaseUrl" type="url" placeholder="https://api.xiaomimimo.com" />
                    <small class="field-note">请求地址：{{ mimoRequestUrl }}</small>
                  </label>
                  <label class="field span-2">
                    <span>API Key</span>
                    <input v-model="personalSpeech.mimoApiKey" type="password" autocomplete="off" placeholder="sk-..." />
                  </label>
                  <label class="field">
                    <span>模型</span>
                    <select v-model="personalSpeech.mimoModel">
                      <option v-for="model in MIMO_MODELS" :key="model" :value="model">{{ model }}</option>
                    </select>
                  </label>
                  <label v-if="!personalSpeech.mimoModel.includes('voicedesign')" class="field">
                    <span>音色</span>
                    <select v-model="personalSpeech.mimoVoice">
                      <option v-for="voice in MIMO_PRESET_VOICES" :key="voice.value" :value="voice.value">{{ voice.label }}</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>音频格式</span>
                    <select v-model="personalSpeech.mimoFormat">
                      <option value="wav">wav（推荐）</option>
                      <option value="mp3">mp3</option>
                    </select>
                  </label>
                  <label class="field span-2">
                    <span>语气描述</span>
                    <input v-model="personalSpeech.mimoPrompt" placeholder="例如：温柔坚定、稍慢、带点疲惫" />
                    <small class="field-note">MiMo 根据这段描述调整语气；朗读语速也会自动加进描述里。</small>
                  </label>
                </div>
                <div class="card-foot end">
                  <ModelTestButton :runner="testPersonalMimoSpeech" :watch-key="personalMimoKey" label="试听" />
                </div>
              </template>
            </article>
          </div>
        </section>

        <!-- Server configuration: admins only -->
        <section v-if="isAdmin" class="settings-section">
          <div class="section-head">
            <h2>后端模型配置 <span class="admin-tag">管理员</span></h2>
            <p>保存在服务器上。开启了「AI 模型」权限的账号选择「使用后端配置」时会用到，API Key 不会发给普通用户。</p>
          </div>

          <div class="settings-cards">
            <article class="settings-card">
              <div class="settings-card-head">
                <h4>文本模型</h4>
                <label class="switch-line compact">
                  <input v-model="serverDraft.text.enabled" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>启用</span>
                </label>
              </div>
              <div class="settings-grid" :class="{ muted: !serverDraft.text.enabled }">
                <label class="field span-2">
                  <span>Base URL</span>
                  <input v-model="serverDraft.text.baseUrl" type="url" placeholder="https://api.openai.com" />
                  <small class="field-note">{{ requestUrlNote(serverDraft.text.baseUrl, serverDraft.text.useFullUrl, '/v1/chat/completions') }}</small>
                </label>
                <label class="field">
                  <span>模型</span>
                  <input v-model="serverDraft.text.model" placeholder="gpt-4o-mini" />
                </label>
                <label class="field">
                  <span>API Key</span>
                  <input v-model="serverDraft.text.apiKey" type="password" autocomplete="off" placeholder="sk-..." />
                </label>
              </div>
              <div class="card-foot">
                <label class="switch-line compact" title="开启后按 Base URL 原样请求，不再自动拼接 /v1/... 路径">
                  <input v-model="serverDraft.text.useFullUrl" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>Base URL 是完整接口地址</span>
                </label>
                <ModelTestButton :runner="testDraftText" :watch-key="serverTextKey" />
              </div>
            </article>

            <article class="settings-card">
              <div class="settings-card-head">
                <h4>图片模型</h4>
                <label class="switch-line compact">
                  <input v-model="serverDraft.image.enabled" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>启用</span>
                </label>
              </div>
              <div class="settings-grid" :class="{ muted: !serverDraft.image.enabled }">
                <label class="field span-2">
                  <span>Base URL</span>
                  <input v-model="serverDraft.image.baseUrl" type="url" placeholder="https://api.openai.com" />
                  <small class="field-note">{{ requestUrlNote(serverDraft.image.baseUrl, serverDraft.image.useFullUrl, '/v1/images/generations') }}</small>
                </label>
                <label class="field">
                  <span>模型</span>
                  <input v-model="serverDraft.image.model" placeholder="gpt-image-1" />
                </label>
                <label class="field">
                  <span>尺寸</span>
                  <select v-model="serverDraft.image.imageSize">
                    <option v-for="size in IMAGE_SIZES" :key="size" :value="size">{{ size }}</option>
                  </select>
                </label>
                <label class="field span-2">
                  <span>API Key</span>
                  <input v-model="serverDraft.image.apiKey" type="password" autocomplete="off" placeholder="sk-..." />
                </label>
              </div>
              <div class="card-foot">
                <label class="switch-line compact" title="开启后按 Base URL 原样请求，不再自动拼接 /v1/... 路径">
                  <input v-model="serverDraft.image.useFullUrl" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>Base URL 是完整接口地址</span>
                </label>
                <ModelTestButton :runner="testDraftImage" :watch-key="serverImageKey" label="测试生成" :confirm-text="IMAGE_TEST_CONFIRM" />
              </div>
            </article>

            <article class="settings-card span-all">
              <div class="settings-card-head">
                <h4>语音合成</h4>
                <label class="switch-line compact">
                  <input v-model="serverDraft.speech.enabled" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>启用</span>
                </label>
              </div>
              <div class="settings-grid three" :class="{ muted: !serverDraft.speech.enabled }">
                <label class="field">
                  <span>服务引擎</span>
                  <select v-model="serverDraft.speech.provider" @change="handleServerSpeechProviderChange">
                    <option value="openai">OpenAI Speech</option>
                    <option value="mimo">小米 MiMo</option>
                  </select>
                </label>
                <label class="field span-2">
                  <span>Base URL</span>
                  <input
                    v-model="serverDraft.speech.baseUrl"
                    type="url"
                    :placeholder="serverDraft.speech.provider === 'mimo' ? 'https://api.xiaomimimo.com' : 'https://api.openai.com'"
                  />
                  <small class="field-note">{{ serverSpeechUrlNote }}</small>
                </label>
                <label class="field">
                  <span>模型</span>
                  <select v-if="serverDraft.speech.provider === 'mimo'" v-model="serverDraft.speech.model">
                    <option v-for="model in MIMO_MODELS" :key="model" :value="model">{{ model }}</option>
                  </select>
                  <input v-else v-model="serverDraft.speech.model" placeholder="gpt-4o-mini-tts" />
                </label>
                <label class="field">
                  <span>音色</span>
                  <select v-if="serverDraft.speech.provider === 'mimo'" v-model="serverDraft.speech.voice">
                    <option v-for="voice in MIMO_PRESET_VOICES" :key="voice.value" :value="voice.value">{{ voice.label }}</option>
                  </select>
                  <input v-else v-model="serverDraft.speech.voice" placeholder="alloy" />
                </label>
                <label class="field">
                  <span>音频格式</span>
                  <select v-model="serverDraft.speech.responseFormat">
                    <option v-for="format in serverSpeechFormats" :key="format" :value="format">{{ format }}</option>
                  </select>
                </label>
                <label class="field span-2">
                  <span>API Key</span>
                  <input v-model="serverDraft.speech.apiKey" type="password" autocomplete="off" placeholder="sk-..." />
                </label>
                <label v-if="serverDraft.speech.provider === 'mimo'" class="field">
                  <span>语气描述</span>
                  <input v-model="serverDraft.speech.prompt" placeholder="例如：温柔坚定、稍慢" />
                </label>
              </div>
              <div class="card-foot">
                <label class="switch-line compact" title="开启后按 Base URL 原样请求，不再自动拼接 /v1/... 路径">
                  <input v-model="serverDraft.speech.useFullUrl" type="checkbox" />
                  <span class="switch-ui"></span>
                  <span>Base URL 是完整接口地址</span>
                </label>
                <ModelTestButton :runner="testDraftSpeech" :watch-key="serverSpeechKey" label="试听" />
              </div>
            </article>
          </div>
          <p class="settings-hint">测试使用当前填写的内容，不需要先保存。</p>
        </section>
      </template>
    </div>

    <Transition name="save-bar">
      <div v-if="!loading && (personalDirty || serverDirty)" class="save-bar" role="region" aria-label="未保存的修改">
        <span class="save-bar-text">有未保存的修改</span>
        <div class="save-bar-actions">
          <button class="secondary-btn" type="button" @click="discardChanges">撤销修改</button>
          <button v-if="personalDirty" class="primary-btn" type="button" @click="savePersonal">保存我的配置</button>
          <button v-if="serverDirty" class="primary-btn" type="button" :disabled="savingServer" @click="saveServer">
            {{ savingServer ? '保存中...' : '保存后端配置' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ModelTestButton from '../components/ai/ModelTestButton.vue'
import { saveAiModelConfig } from '../api/aiModel'
import { useAiBookStore } from '../stores/aiBook'
import { useAppStore } from '../stores/app'
import { useReaderStore, type MimoSpeechFormat, type OpenAISpeechFormat, type OpenAISpeechSource } from '../stores/reader'
import type { AiBookConfig, AiServerModelConfig } from '../types'
import {
  describeModelRequestUrl,
  testImageModel,
  testSpeechModel,
  testTextModel,
  type ModelEndpoint,
} from '../utils/aiModelTest'
import { buildMimoChatUrl, DEFAULT_MIMO_BASE_URL, MIMO_MODELS, MIMO_PRESET_VOICES } from '../utils/mimoSpeech'

interface SpeechDraft {
  openaiSource: OpenAISpeechSource
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  openaiVoice: string
  openaiFormat: OpenAISpeechFormat
  mimoSource: OpenAISpeechSource
  mimoBaseUrl: string
  mimoApiKey: string
  mimoModel: string
  mimoVoice: string
  mimoFormat: MimoSpeechFormat
  mimoPrompt: string
}

type SpeechEngine = 'openai' | 'mimo'

const IMAGE_SIZES = ['1024x1024', '1792x1024', '1024x1792']
const OPENAI_FORMATS: OpenAISpeechFormat[] = ['mp3', 'wav', 'opus', 'flac', 'pcm']
const SPEECH_ENGINES: Array<{ key: SpeechEngine; label: string }> = [
  { key: 'openai', label: 'OpenAI Speech' },
  { key: 'mimo', label: '小米 MiMo' },
]
const IMAGE_TEST_CONFIRM = '测试会实际生成一张图片，可能产生费用。继续吗？'
const EMPTY_ENDPOINT: ModelEndpoint = { baseUrl: '', apiKey: '', model: '', fullUrl: false }

const route = useRoute()
const router = useRouter()
const aiStore = useAiBookStore()
const appStore = useAppStore()
const readerStore = useReaderStore()

const loading = ref(true)
const savingServer = ref(false)
const personalAi = reactive<AiBookConfig>({ ...aiStore.config })
const personalSpeech = reactive<SpeechDraft>(pickSpeechDraft())
const serverDraft = reactive<AiServerModelConfig>(createEmptyServerConfig())
const personalSnapshot = ref('')
const serverSnapshot = ref('')

const canUseServerModel = computed(() => aiStore.canUseServerModel || aiStore.isServerModelAdmin)
const isAdmin = computed(() => aiStore.isServerModelAdmin)
const serverConfig = computed(() => aiStore.serverModelConfig?.config || null)
const serverReady = computed(() => ({
  text: Boolean(serverConfig.value?.text.enabled && serverConfig.value.text.baseUrl && serverConfig.value.text.model),
  image: Boolean(serverConfig.value?.image.enabled && serverConfig.value.image.baseUrl && serverConfig.value.image.model),
  speech: Boolean(serverConfig.value?.speech.enabled && serverConfig.value.speech.baseUrl && serverConfig.value.speech.model),
}))
const serverSpeechEngine = computed<SpeechEngine>(() => readerStore.serverSpeechProvider)
const serverSpeechSummary = computed(() => {
  const speech = serverConfig.value?.speech
  if (!serverReady.value.speech || !speech) return '管理员尚未配置'
  const engine = serverSpeechEngine.value === 'mimo' ? '小米 MiMo' : 'OpenAI Speech'
  return [engine, speech.model, speech.voice].filter(Boolean).join(' · ')
})

const personalDirty = computed(() => personalSnapshot.value !== snapshotPersonal())
const serverDirty = computed(() => isAdmin.value && serverSnapshot.value !== JSON.stringify(serverDraft))

const mimoRequestUrl = computed(() => buildMimoChatUrl(personalSpeech.mimoBaseUrl || DEFAULT_MIMO_BASE_URL))
const serverSpeechFormats = computed(() => serverDraft.speech.provider === 'mimo'
  ? ['wav', 'mp3']
  : OPENAI_FORMATS)
const serverSpeechUrlNote = computed(() => {
  const { baseUrl, useFullUrl, provider } = serverDraft.speech
  if (provider === 'mimo' && baseUrl.trim() && !useFullUrl) return `请求地址：${buildMimoChatUrl(baseUrl)}`
  return requestUrlNote(baseUrl, useFullUrl, '/v1/audio/speech')
})

// Keys that clear a stale test result when the related fields change.
const personalTextKey = computed(() => JSON.stringify([personalAi.textBaseUrl, personalAi.textApiKey, personalAi.textModel, personalAi.textUseFullUrl, personalAi.useBackendProxy]))
const personalImageKey = computed(() => JSON.stringify([personalAi.imageBaseUrl, personalAi.imageApiKey, personalAi.imageModel, personalAi.imageSize, personalAi.imageUseFullUrl, personalAi.useBackendProxy]))
const personalOpenAIKey = computed(() => JSON.stringify([personalSpeech.openaiBaseUrl, personalSpeech.openaiApiKey, personalSpeech.openaiModel, personalSpeech.openaiVoice, personalSpeech.openaiFormat]))
const personalMimoKey = computed(() => JSON.stringify([personalSpeech.mimoBaseUrl, personalSpeech.mimoApiKey, personalSpeech.mimoModel, personalSpeech.mimoVoice, personalSpeech.mimoFormat, personalSpeech.mimoPrompt]))
const serverTextKey = computed(() => JSON.stringify(serverDraft.text))
const serverImageKey = computed(() => JSON.stringify(serverDraft.image))
const serverSpeechKey = computed(() => JSON.stringify(serverDraft.speech))

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  await appStore.fetchUserInfo()
  await aiStore.loadServerModelConfig({ force: true })
  resetPersonalDraft()
  resetServerDraft()
  loading.value = false
  if (route.query.section === 'speech') {
    await nextTick()
    document.getElementById('speech-settings')?.scrollIntoView({ block: 'start' })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (!personalDirty.value && !serverDirty.value) return true
  return window.confirm('有未保存的修改，离开后会丢失。确定离开吗？')
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!personalDirty.value && !serverDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function goBack() {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}

function pickSpeechDraft(): SpeechDraft {
  const c = readerStore.speechConfig
  return {
    openaiSource: c.openaiSource,
    openaiBaseUrl: c.openaiBaseUrl,
    openaiApiKey: c.openaiApiKey,
    openaiModel: c.openaiModel,
    openaiVoice: c.openaiVoice,
    openaiFormat: c.openaiFormat,
    mimoSource: c.mimoSource,
    mimoBaseUrl: c.mimoBaseUrl,
    mimoApiKey: c.mimoApiKey,
    mimoModel: c.mimoModel,
    mimoVoice: c.mimoVoice,
    mimoFormat: c.mimoFormat,
    mimoPrompt: c.mimoPrompt,
  }
}

function snapshotPersonal() {
  return JSON.stringify({ ai: personalAi, speech: personalSpeech })
}

function resetPersonalDraft() {
  Object.assign(personalAi, aiStore.refreshConfig())
  Object.assign(personalSpeech, pickSpeechDraft())
  // Without permission a saved "server" choice cannot work; show the user's own settings instead.
  if (!canUseServerModel.value) {
    if (personalAi.modelSource === 'server') personalAi.modelSource = 'browser'
    if (personalSpeech.openaiSource === 'server') personalSpeech.openaiSource = 'browser'
    if (personalSpeech.mimoSource === 'server') personalSpeech.mimoSource = 'browser'
  }
  personalSnapshot.value = snapshotPersonal()
}

function resetServerDraft() {
  if (serverConfig.value) {
    Object.assign(serverDraft, cloneServerConfig(serverConfig.value))
  }
  serverSnapshot.value = JSON.stringify(serverDraft)
}

function discardChanges() {
  resetPersonalDraft()
  resetServerDraft()
}

function savePersonal() {
  aiStore.persistConfig({ ...personalAi })
  readerStore.applySpeechModelConfig({ ...personalSpeech })
  resetPersonalDraft()
  appStore.showToast('我的配置已保存', 'success')
}

async function saveServer() {
  if (!isAdmin.value) return
  savingServer.value = true
  try {
    const saved = await saveAiModelConfig(cloneServerConfig(serverDraft))
    aiStore.serverModelConfig = saved
    resetServerDraft()
    appStore.showToast('后端模型配置已保存', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || '后端模型配置保存失败', 'error')
  } finally {
    savingServer.value = false
  }
}

function speechSource(engine: SpeechEngine) {
  return engine === 'mimo' ? personalSpeech.mimoSource : personalSpeech.openaiSource
}

function setSpeechSource(engine: SpeechEngine, source: OpenAISpeechSource) {
  if (engine === 'mimo') personalSpeech.mimoSource = source
  else personalSpeech.openaiSource = source
}

function requestUrlNote(baseUrl: string, fullUrl: boolean, path: string) {
  const url = describeModelRequestUrl(baseUrl, fullUrl, path)
  if (!url) return `会在地址后自动加上 ${path}`
  return fullUrl ? `按原样请求：${url}` : `请求地址：${url}`
}

/* ─── Tests ─── */
function personalRoute() {
  return personalAi.useBackendProxy ? 'proxy' as const : 'direct' as const
}

function testPersonalText() {
  return testTextModel(personalRoute(), {
    baseUrl: personalAi.textBaseUrl,
    apiKey: personalAi.textApiKey,
    model: personalAi.textModel,
    fullUrl: personalAi.textUseFullUrl,
  })
}

function testPersonalImage() {
  return testImageModel(personalRoute(), {
    baseUrl: personalAi.imageBaseUrl,
    apiKey: personalAi.imageApiKey,
    model: personalAi.imageModel,
    fullUrl: personalAi.imageUseFullUrl,
    size: personalAi.imageSize,
  })
}

function testServerText() {
  return testTextModel('server', EMPTY_ENDPOINT)
}

function testServerImage() {
  return testImageModel('server', { ...EMPTY_ENDPOINT, size: serverConfig.value?.image.imageSize || '1024x1024' })
}

function testServerSpeech() {
  return testSpeechModel('server', { ...EMPTY_ENDPOINT, engine: serverSpeechEngine.value, voice: '', format: '' })
}

function testPersonalOpenAISpeech() {
  return testSpeechModel('direct', {
    engine: 'openai',
    baseUrl: personalSpeech.openaiBaseUrl,
    apiKey: personalSpeech.openaiApiKey,
    model: personalSpeech.openaiModel,
    voice: personalSpeech.openaiVoice,
    format: personalSpeech.openaiFormat,
    fullUrl: false,
  })
}

function testPersonalMimoSpeech() {
  return testSpeechModel('direct', {
    engine: 'mimo',
    baseUrl: personalSpeech.mimoBaseUrl || DEFAULT_MIMO_BASE_URL,
    apiKey: personalSpeech.mimoApiKey,
    model: personalSpeech.mimoModel,
    voice: personalSpeech.mimoVoice,
    format: personalSpeech.mimoFormat,
    prompt: personalSpeech.mimoPrompt,
    fullUrl: false,
  })
}

// Admin tests run the unsaved draft through the reader server.
function testDraftText() {
  const { baseUrl, apiKey, model, useFullUrl } = serverDraft.text
  return testTextModel('proxy', { baseUrl, apiKey, model, fullUrl: useFullUrl })
}

function testDraftImage() {
  const { baseUrl, apiKey, model, useFullUrl, imageSize } = serverDraft.image
  return testImageModel('proxy', { baseUrl, apiKey, model, fullUrl: useFullUrl, size: imageSize })
}

function testDraftSpeech() {
  const speech = serverDraft.speech
  return testSpeechModel('proxy', {
    engine: speech.provider === 'mimo' ? 'mimo' : 'openai',
    baseUrl: speech.baseUrl,
    apiKey: speech.apiKey,
    model: speech.model,
    voice: speech.voice,
    format: speech.responseFormat,
    prompt: speech.prompt,
    fullUrl: speech.useFullUrl,
  })
}

/* ─── Server config helpers ─── */
function handleServerSpeechProviderChange() {
  const speech = serverDraft.speech
  if (speech.provider === 'mimo') {
    if (!speech.baseUrl || speech.baseUrl.includes('openai.com')) speech.baseUrl = 'https://api.xiaomimimo.com'
    if (!speech.model || !speech.model.startsWith('mimo-')) speech.model = 'mimo-v2.5-tts'
    if (!speech.voice || speech.voice === 'alloy') speech.voice = 'mimo_default'
    if (speech.responseFormat !== 'wav' && speech.responseFormat !== 'mp3') speech.responseFormat = 'wav'
  } else {
    if (!speech.baseUrl || speech.baseUrl.includes('xiaomimimo.com')) speech.baseUrl = 'https://api.openai.com'
    if (!speech.model || speech.model.startsWith('mimo-')) speech.model = 'gpt-4o-mini-tts'
    if (!speech.voice || speech.voice === 'mimo_default' || !/^[a-z]+$/i.test(speech.voice)) speech.voice = 'alloy'
  }
}

function createEmptyServerConfig(): AiServerModelConfig {
  return {
    text: { enabled: false, baseUrl: '', apiKey: '', model: 'gpt-4o-mini', useFullUrl: false },
    image: { enabled: false, baseUrl: '', apiKey: '', model: 'gpt-image-1', useFullUrl: false, imageSize: '1024x1024' },
    speech: {
      enabled: false,
      provider: 'openai',
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini-tts',
      useFullUrl: false,
      voice: 'alloy',
      responseFormat: 'mp3',
      prompt: '',
    },
  }
}

function cloneServerConfig(config: AiServerModelConfig): AiServerModelConfig {
  return JSON.parse(JSON.stringify(config)) as AiServerModelConfig
}
</script>

<style scoped>
.ai-settings-view {
  position: relative;
  height: 100%;
  overflow-y: auto;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-overflow-scrolling: touch;
}

.ai-settings-shell {
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px 28px 32px;
  box-sizing: border-box;
  display: grid;
  gap: 22px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border-light);
}

.page-title h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
}

.page-title p {
  margin: 6px 0 0;
  color: var(--color-text-tertiary);
  font-size: 13px;
  line-height: 1.6;
}

.page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--color-text-secondary);
}

.settings-section {
  display: grid;
  gap: 14px;
}

.settings-section + .settings-section {
  padding-top: 22px;
  border-top: 1px solid var(--color-border-light);
}

.section-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
}

.section-head p,
.group-hint {
  margin: 4px 0 0;
  color: var(--color-text-tertiary);
  font-size: 13px;
  line-height: 1.6;
}

.group-hint {
  margin-top: -8px;
}

.admin-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-bg, rgba(212, 129, 42, 0.12));
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}

.group-title {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--color-text-secondary);
  scroll-margin-top: 16px;
}

.back-btn,
.secondary-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  background: var(--color-bg-elevated);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.back-btn {
  flex: 0 0 auto;
  background: transparent;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.primary-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.settings-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.settings-card {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-xs);
  min-width: 0;
}

.settings-card.span-all {
  grid-column: 1 / -1;
}

.settings-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-card h4 {
  margin: 0;
  font-size: 15px;
}

.card-note {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.status-tag {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-tag.active {
  color: var(--color-primary);
}

.summary-line {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  word-break: break-all;
}

.source-options {
  display: inline-flex;
  justify-self: start;
  gap: 6px;
  padding: 4px;
  border-radius: 8px;
  background: var(--color-bg-sunken);
}

.source-option {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 7px;
  color: var(--color-text-secondary);
  font-weight: 700;
  cursor: pointer;
}

.source-option.active {
  background: var(--color-bg-elevated);
  color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.source-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.settings-grid.spaced {
  margin-top: 2px;
}

.settings-grid.muted {
  opacity: 0.6;
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.field.span-2 {
  grid-column: span 2;
}

.field input,
.field select {
  min-height: 40px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  padding: 0 11px;
  font-size: 14px;
  outline: none;
}

.field input:focus,
.field select:focus {
  border-color: var(--color-primary-border, var(--color-primary));
  box-shadow: 0 0 0 3px rgba(212, 129, 42, 0.1);
}

.field-note {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 400;
  word-break: break-all;
}

.card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 16px;
  padding-top: 4px;
}

.card-foot.end {
  justify-content: flex-end;
}

/* Button stays on the right; a long result wraps onto its own full-width line. */
.card-foot :deep(.model-test) {
  flex: 1 1 auto;
  justify-items: end;
  min-width: 0;
}

.switch-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.switch-line.compact {
  font-size: 12px;
}

.switch-line input {
  display: none;
}

.switch-ui {
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border);
  position: relative;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}

.switch-ui::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  top: 2px;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-xs);
  transition: transform var(--duration-fast);
}

.switch-line input:checked + .switch-ui {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.switch-line input:checked + .switch-ui::after {
  transform: translateX(16px);
}

.save-bar {
  position: sticky;
  bottom: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(1024px, calc(100% - 32px));
  margin: 0 auto 12px;
  padding: 10px 12px 10px 16px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--color-primary-border, var(--color-border));
  background: var(--color-bg-elevated);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}

.save-bar-text {
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
}

.save-bar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.save-bar-enter-active,
.save-bar-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.save-bar-enter-from,
.save-bar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 768px) {
  .ai-settings-shell {
    padding: 14px 16px 24px;
    gap: 18px;
  }

  .page-header {
    flex-direction: column;
    gap: 10px;
  }

  .page-title h1 {
    font-size: 21px;
  }

  .settings-cards,
  .settings-grid,
  .settings-grid.three {
    grid-template-columns: 1fr;
  }

  .field.span-2 {
    grid-column: auto;
  }

  .card-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .card-foot :deep(.model-test) {
    justify-items: start;
  }

  .save-bar {
    width: calc(100% - 24px);
    flex-direction: column;
    align-items: stretch;
  }

  .save-bar-actions {
    justify-content: stretch;
  }

  .save-bar-actions button {
    flex: 1;
  }
}
</style>
