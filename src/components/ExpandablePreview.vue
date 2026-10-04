<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  threshold: {
    type: String,
    default: '25vh'
  }
})

const element = ref(null)

function updatePreviewMode() {
  if (!element.value) return

  const wasExpanded = element.value.classList.contains('expanded')
  element.value.classList.remove('expanded')
  const maxHeight = Number.parseFloat(globalThis.getComputedStyle(element.value).maxHeight)
  const isTallerThanThreshold = Number.isFinite(maxHeight) && element.value.scrollHeight > maxHeight
  element.value.classList.toggle('preview-mode', isTallerThanThreshold)
  element.value.classList.toggle('expanded', isTallerThanThreshold && wasExpanded)
}

function toggleExpanded() {
  if (element.value?.classList.contains('preview-mode')) element.value.classList.toggle('expanded')
}

onMounted(async () => {
  await nextTick()
  updatePreviewMode()
  window.addEventListener('resize', updatePreviewMode)
})

onUnmounted(() => window.removeEventListener('resize', updatePreviewMode))
</script>

<template>
  <div
    ref="element"
    class="expandable-preview"
    :style="{ '--expandable-preview-threshold': props.threshold }"
    @click="toggleExpanded"
  >
    <slot />
  </div>
</template>

<style scoped>
.expandable-preview {
  max-height: var(--expandable-preview-threshold);
  overflow-y: hidden;
  position: relative;
  transition: max-height 500ms ease-in-out;
}

.expandable-preview.preview-mode.expanded {
  max-height: 1000px;
  height: fit-content;
}

.expandable-preview.preview-mode.expanded::after {
  opacity: 0;
}

.expandable-preview.preview-mode:hover {
  cursor: pointer;
}

.expandable-preview.preview-mode:not(.expanded)::before {
  content: 'click to expand';
  display: flex;
  align-items: end;
  justify-content: center;
  text-align: center;
  color: black;
  position: absolute;
  inset: 0;
  opacity: 0;
  border: solid 2px var(--bs-border-color);
  background-color: var(--bs-body-bg);
  backdrop-filter: blur(2px);
  width: 100%;
  height: 100%;
  font-size: 1.5rem;
  font-style: italic;
  transition: opacity 250ms ease;
  z-index: 1;
}

.expandable-preview.preview-mode:not(.expanded):hover::before {
  opacity: 0.5;
}

.expandable-preview.preview-mode::after {
  content: ' ';
  position: absolute;
  width: 100%;
  left: 0;
  right: 0;
  bottom: 0;
  height: 25%;
  background: linear-gradient(to top, var(--bs-body-bg) 25%, transparent 100%);
}
</style>
