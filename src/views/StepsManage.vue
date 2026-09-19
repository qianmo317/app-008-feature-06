<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask, saveTask } from '../db';
import { newStepId, stepInUse, duplicateStepName } from '../utils';
import type { MoveTask, UnloadStep } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);
const steps = ref<UnloadStep[]>([]);
const errorMsg = ref('');

async function load() {
  const t = await getTask(route.params.id as string);
  task.value = t;
  if (t) steps.value = [...t.steps].sort((a, b) => a.order - b.order).map((s) => ({ ...s }));
}

function renumber() {
  steps.value.forEach((s, i) => (s.order = i));
}

function addStep() {
  if (!task.value) return;
  const base: UnloadStep = {
    id: newStepId(steps.value),
    name: '',
    order: steps.value.length,
    active: true,
  };
  steps.value.push(base);
}

function removeStep(step: UnloadStep) {
  if (!task.value) return;
  if (stepInUse(task.value, step.id)) {
    alert('该步骤已有箱子使用，不能删除，只能停掉。');
    return;
  }
  steps.value = steps.value.filter((s) => s.id !== step.id);
  renumber();
}

function toggleActive(step: UnloadStep) {
  if (step.active) {
    // 停用后不影响已经停在该步的箱子，只是不再可选
    step.active = false;
    return;
  }
  // 启用无额外限制
  step.active = true;
}

function move(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= steps.value.length) return;
  const list = steps.value;
  [list[index], list[target]] = [list[target], list[index]];
  renumber();
}

function usageCount(stepId: string): number {
  if (!task.value) return 0;
  return task.value.boxes.filter((b) => b.stepId === stepId).length;
}

async function save() {
  if (!task.value) return;
  errorMsg.value = '';

  if (steps.value.length === 0) {
    errorMsg.value = '至少保留一个步骤';
    return;
  }
  for (const s of steps.value) {
    if (!s.name.trim()) {
      errorMsg.value = '步骤名称不能为空';
      return;
    }
  }
  for (const s of steps.value) {
    if (duplicateStepName({ ...task.value, steps: steps.value }, s.name, s.id)) {
      errorMsg.value = `步骤名称重复：${s.name.trim()}`;
      return;
    }
  }
  if (!steps.value.some((s) => s.active)) {
    errorMsg.value = '至少需要保留一个启用中的步骤';
    return;
  }

  renumber();
  task.value.steps = steps.value.map((s) => ({ ...s, name: s.name.trim() }));
  await saveTask(task.value);
  router.push(`/task/${task.value.id}`);
}

onMounted(load);
</script>

<template>
  <div v-if="task">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>卸货步骤</h1>
    </div>
    <div class="page">
      <div class="card" style="font-size:13px;color:var(--text-secondary);">
        按实际卸货流程定义本任务的步骤，名称与先后顺序都可以调整。
        已经被箱子使用过的步骤不能删除，只能停掉；停用后不再出现在扫码页和箱子详情页的选项里。
      </div>

      <div v-for="(s, i) in steps" :key="s.id" class="card step-row">
        <div class="step-main">
          <input v-model="s.name" class="input step-name" :placeholder="`第 ${i + 1} 步名称`" />
          <div class="step-meta">
            <span v-if="usageCount(s.id) > 0" class="step-used">{{ usageCount(s.id) }} 箱在用 · 不可删除</span>
            <span v-else class="step-unused">未被使用</span>
            <span v-if="!s.active" class="step-stopped">已停用</span>
          </div>
        </div>
        <div class="step-actions">
          <button class="btn btn-secondary step-btn" :disabled="i === 0" @click="move(i, -1)" title="上移">↑</button>
          <button class="btn btn-secondary step-btn" :disabled="i === steps.length - 1" @click="move(i, 1)" title="下移">↓</button>
          <button class="btn step-btn" :class="s.active ? 'btn-secondary' : 'btn-success'" @click="toggleActive(s)">
            {{ s.active ? '停掉' : '启用' }}
          </button>
          <button
            class="btn btn-danger step-btn"
            :disabled="usageCount(s.id) > 0"
            :title="usageCount(s.id) > 0 ? '已有箱子使用，不能删除' : '删除步骤'"
            @click="removeStep(s)"
          >删</button>
        </div>
      </div>

      <button class="btn btn-secondary btn-block" @click="addStep">+ 新增步骤</button>

      <div v-if="errorMsg" style="color:var(--danger);margin-top:10px;font-size:14px;">{{ errorMsg }}</div>

      <div class="toolbar" style="margin-top:12px;">
        <button class="btn btn-secondary" @click="router.push(`/task/${task.id}`)">取消</button>
        <button class="btn btn-success" @click="save">保存步骤</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.step-main {
  flex: 1;
  min-width: 0;
}
.step-name {
  padding: 8px 10px;
  font-size: 15px;
}
.step-meta {
  margin-top: 4px;
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.step-used { color: var(--warning); }
.step-unused { color: var(--text-secondary); }
.step-stopped { color: var(--danger); font-weight: 600; }
.step-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.step-btn {
  padding: 8px 10px;
  font-size: 13px;
  min-width: 38px;
  box-shadow: none;
}
.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
