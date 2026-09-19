<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask } from '../db';
import {
  estimateVehicle,
  roomProgress,
  orderedSteps,
  terminalStep,
  stepColor,
  stepName,
} from '../utils';
import type { MoveTask } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);

const terminal = computed(() => (task.value ? terminalStep(task.value) : null));

const stats = computed(() => {
  if (!task.value || !terminal.value) return { total: 0, done: 0 };
  const boxes = task.value.boxes;
  return {
    total: boxes.length,
    done: boxes.filter((b) => b.stepId === terminal.value!.id).length,
  };
});

/** 每个步骤当前有多少箱子（含已停用步骤，便于发现历史数据） */
const stepCounts = computed(() => {
  if (!task.value) return [];
  return orderedSteps(task.value).map((s) => ({
    step: s,
    count: task.value!.boxes.filter((b) => b.stepId === s.id).length,
  }));
});

const vehicle = computed(() => {
  if (!task.value || task.value.boxes.length === 0) return null;
  return estimateVehicle(task.value.boxes.length);
});

const roomStats = computed(() => {
  if (!task.value) return [];
  return task.value.rooms.map((r) => ({ room: r, ...roomProgress(task.value!, r) }));
});

async function load() {
  task.value = await getTask(route.params.id as string);
}

onMounted(load);
</script>

<template>
  <div v-if="task">
    <div class="header">
      <router-link to="/" class="back">←</router-link>
      <h1>{{ task.title }}</h1>
    </div>
    <div class="page">
      <div class="grid-2">
        <div class="card" style="text-align:center;">
          <div style="font-size:28px;font-weight:800;">{{ stats.total }}</div>
          <div style="font-size:12px;color:var(--text-secondary);">总箱数</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:28px;font-weight:800;color:var(--success);">{{ stats.done }}</div>
          <div style="font-size:12px;color:var(--text-secondary);">
            已到「{{ terminal?.name ?? '—' }}」
          </div>
        </div>
      </div>

      <div v-if="vehicle" class="card">
        <div style="font-weight:700;">车型建议</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">
          {{ vehicle.vehicle }} · {{ vehicle.suggestion }}
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700;">卸货步骤</div>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:13px;box-shadow:none;" @click="router.push(`/task/${task.id}/steps`)">
            管理
          </button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;">
          <div v-for="sc in stepCounts" :key="sc.step.id" style="display:flex;align-items:center;gap:6px;font-size:13px;">
            <span class="status-dot" :style="{background: stepColor(task, sc.step.id)}"></span>
            <span :style="sc.step.active ? {} : {color: 'var(--text-secondary)', textDecoration: 'line-through'}">
              {{ sc.step.name }}
            </span>
            <span style="color:var(--text-secondary);">{{ sc.count }}</span>
            <span v-if="!sc.step.active" style="color:var(--danger);font-size:11px;">已停用</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">
          {{ terminal ? `「${terminal.name}」进度` : '完成进度' }}
        </div>
        <div v-for="rs in roomStats" :key="rs.room" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span>{{ rs.room }}</span>
            <span>{{ rs.done }}/{{ rs.total }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{width: rs.total ? `${(rs.done/rs.total)*100}%` : '0%'}"></div>
          </div>
        </div>
      </div>

      <div class="toolbar no-print">
        <button class="btn" @click="router.push(`/task/${task.id}/register`)">封箱登记</button>
        <button class="btn" @click="router.push(`/task/${task.id}/scan`)">扫码查箱</button>
        <button class="btn" @click="router.push(`/task/${task.id}/check`)">卸货核对</button>
        <button class="btn" @click="router.push(`/task/${task.id}/labels`)">标签打印</button>
        <button class="btn btn-secondary" @click="router.push(`/task/${task.id}/steps`)">卸货步骤</button>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">最近封箱</div>
        <div v-if="task.boxes.length === 0" class="empty" style="padding:12px 0;">还没有箱子，去封箱登记吧</div>
        <div v-for="b in [...task.boxes].reverse().slice(0,10)" :key="b.id" class="box-item" @click="router.push(`/task/${task.id}/box/${b.code}`)">
          <span class="status-dot" :style="{background: stepColor(task, b.stepId)}"></span>
          <div style="flex:1;">
            <div style="font-weight:700;">{{ b.code }}</div>
            <div style="font-size:12px;color:var(--text-secondary);">{{ b.roomTo }} · {{ b.tags.join(', ') || '无标签' }}</div>
          </div>
          <span style="font-size:12px;color:var(--text-secondary);">{{ stepName(task, b.stepId) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-track {
  height: 8px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
  margin-top: 4px;
}
.progress-fill {
  height: 100%;
  background: var(--success);
  border-radius: 999px;
}
.box-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
}
.box-item:active {
  background: var(--border);
}
</style>
