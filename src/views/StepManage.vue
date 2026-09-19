<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  getTask,
  addStep,
  renameStep,
  setStepActive,
  deleteStep,
  reorderSteps,
  isStepInUse,
} from '../db';
import type { MoveTask } from '../types';

const route = useRoute();
const task = ref<MoveTask | null>(null);
const newName = ref('');
const editingId = ref<string | null>(null);
const editingName = ref('');
const saving = ref(false);

const usedCount = computed(() => {
  const map: Record<string, number> = {};
  if (task.value) {
    for (const b of task.value.boxes) map[b.status] = (map[b.status] ?? 0) + 1;
  }
  return map;
});

const activeCount = computed(() => task.value?.steps.filter((s) => s.active).length ?? 0);

function canDelete(stepId: string): boolean {
  return !task.value?.steps.find((s) => s.id === stepId)?.used && !(usedCount.value[stepId] > 0);
}

async function load() {
  task.value = await getTask(route.params.id as string);
}

async function handleAdd() {
  if (!task.value || saving.value) return;
  const name = newName.value.trim();
  if (!name) return;
  saving.value = true;
  try {
    task.value = await addStep(task.value.id, name);
    newName.value = '';
  } catch (e) {
    alert((e as Error).message);
  } finally {
    saving.value = false;
  }
}

function startEdit(id: string, name: string) {
  editingId.value = id;
  editingName.value = name;
}

function cancelEdit() {
  editingId.value = null;
  editingName.value = '';
}

async function saveEdit(id: string) {
  if (!task.value) return;
  try {
    task.value = await renameStep(task.value.id, id, editingName.value);
    cancelEdit();
  } catch (e) {
    alert((e as Error).message);
  }
}

async function toggleActive(id: string, active: boolean) {
  if (!task.value) return;
  if (active === false && activeCount.value <= 1) {
    alert('至少要保留一个启用的步骤');
    return;
  }
  task.value = await setStepActive(task.value.id, id, active);
}

async function remove(id: string) {
  if (!task.value) return;
  const step = task.value.steps.find((s) => s.id === id);
  if (step?.used || isStepInUse(task.value, id)) {
    alert('该步骤已有箱子使用，不能删除，只能停用');
    return;
  }
  if (!confirm('确定删除这个步骤？删除后不可恢复。')) return;
  try {
    task.value = await deleteStep(task.value.id, id);
  } catch (e) {
    alert((e as Error).message);
  }
}

async function move(index: number, delta: number) {
  if (!task.value) return;
  const target = index + delta;
  const steps = [...task.value.steps];
  if (target < 0 || target >= steps.length) return;
  const [item] = steps.splice(index, 1);
  steps.splice(target, 0, item);
  task.value = await reorderSteps(task.value.id, steps);
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
        步骤按从上到下的顺序进行。已有箱子使用过的步骤不能删除，只能停用；停用后不会再出现在扫码页和箱子详情页里。
      </div>

      <div class="card">
        <label class="label">新增步骤</label>
        <div style="display:flex;gap:8px;">
          <input
            v-model="newName"
            class="input"
            placeholder="例如：当天入库 / 次日拆包"
            @keyup.enter="handleAdd"
          />
          <button class="btn" style="padding:12px 18px;flex-shrink:0;" @click="handleAdd">添加</button>
        </div>
      </div>

      <div v-for="(s, idx) in task.steps" :key="s.id" class="card step-row" :class="{inactive: !s.active}">
        <div class="step-order">
          <button class="mini" :disabled="idx === 0" @click="move(idx, -1)">↑</button>
          <span class="step-index">{{ idx + 1 }}</span>
          <button class="mini" :disabled="idx === task.steps.length - 1" @click="move(idx, 1)">↓</button>
        </div>

        <div class="step-main">
          <template v-if="editingId === s.id">
            <div style="display:flex;gap:6px;">
              <input
                v-model="editingName"
                class="input"
                style="padding:8px 10px;font-size:14px;"
                @keyup.enter="saveEdit(s.id)"
              />
              <button class="mini" @click="saveEdit(s.id)">✓</button>
              <button class="mini" @click="cancelEdit">✕</button>
            </div>
          </template>
          <template v-else>
            <div class="step-name" @click="startEdit(s.id, s.name)">
              {{ s.name }}
              <span v-if="!s.active" class="badge badge-off">已停用</span>
              <span v-if="usedCount[s.id]" class="badge badge-used">{{ usedCount[s.id] }} 箱在此步</span>
              <span v-else-if="s.used" class="badge badge-ever">已有箱子用过</span>
            </div>
          </template>
        </div>

        <div class="step-ops">
          <label class="switch" :title="s.active ? '停用' : '启用'">
            <input type="checkbox" :checked="s.active" @change="toggleActive(s.id, !s.active)" />
            <span>{{ s.active ? '启用' : '停用' }}</span>
          </label>
          <button v-if="canDelete(s.id)" class="mini mini-danger" @click="remove(s.id)">删除</button>
          <span v-else class="locked" title="已有箱子使用，只能停用">🔒</span>
        </div>
      </div>

      <div v-if="task.steps.length === 0" class="empty">还没有步骤，先在上方添加一个吧</div>
    </div>
  </div>
</template>

<style scoped>
.step-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.step-row.inactive { opacity: 0.55; }
.step-order {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.step-index {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 16px;
  text-align: center;
}
.step-main { flex: 1; min-width: 0; }
.step-name {
  font-weight: 700;
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.step-ops {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.mini {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: pointer;
  min-width: 30px;
}
.mini:disabled { opacity: 0.35; cursor: default; }
.mini-danger { color: var(--danger); border-color: var(--danger); }
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.badge-off { background: var(--border); color: var(--text-secondary); }
.badge-used { background: rgba(59,130,246,0.15); color: var(--info); }
.badge-ever { background: rgba(156,163,175,0.2); color: var(--text-secondary); }
.locked { font-size: 14px; opacity: 0.6; }.switch {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
</style>
