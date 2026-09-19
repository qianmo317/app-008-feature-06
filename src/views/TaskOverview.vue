<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask } from '../db';
import { estimateVehicle, roomProgress, stepColor, stepName, activeSteps, stepCounts } from '../utils';
import type { MoveTask } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);

function isAbnormal(name: string): boolean {
  return /破|损|缺|失/.test(name);
}

const stats = computed(() => {
  if (!task.value) return { total: 0, inProgress: 0, done: 0, abnormal: 0 };
  const t = task.value;
  const boxes = t.boxes;
  const active = activeSteps(t);
  const firstId = active[0]?.id;
  const doneId = active.at(-1)?.id;
  return {
    total: boxes.length,
    inProgress: boxes.filter((b) => b.status !== firstId && b.status !== doneId).length,
    done: doneId ? boxes.filter((b) => b.status === doneId).length : 0,
    abnormal: boxes.filter((b) => {
      const name = stepName(t, b.status);
      return isAbnormal(name);
    }).length,
  };
});

const stepStats = computed(() => (task.value ? stepCounts(task.value) : []));

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
          <div style="font-size:28px;font-weight:800;color:var(--info);">{{ stats.inProgress }}</div>
          <div style="font-size:12px;color:var(--text-secondary);">进行中</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:28px;font-weight:800;color:var(--success);">{{ stats.done }}</div>
          <div style="font-size:12px;color:var(--text-secondary);">已完成</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:28px;font-weight:800;color:var(--danger);">{{ stats.abnormal }}</div>
          <div style="font-size:12px;color:var(--text-secondary);">异常</div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-weight:700;">卸货步骤</span>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:13px;box-shadow:none;" @click="router.push(`/task/${task.id}/steps`)">
            管理
          </button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span v-for="ss in stepStats" :key="ss.step.id" class="step-chip" :style="{borderColor: stepColor(task, ss.step.id)}" :class="{off: !ss.step.active}">
            <span class="status-dot" :style="{background: stepColor(task, ss.step.id)}"></span>
            {{ ss.step.name }}
            <strong>{{ ss.count }}</strong>
          </span>
        </div>
      </div>

      <div v-if="vehicle" class="card">
        <div style="font-weight:700;">车型建议</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">
          {{ vehicle.vehicle }} · {{ vehicle.suggestion }}
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">完成进度</div>
        <div v-for="rs in roomStats" :key="rs.room" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span>{{ rs.room }}</span>
            <span>{{ rs.done }}/{{ rs.total }}</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:999px;overflow:hidden;margin-top:4px;">
            <div :style="{width: rs.total ? `${(rs.done/rs.total)*100}%` : '0%', height:'100%', background:'var(--success)', borderRadius:'999px'}"></div>
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
        <div v-for="b in [...task.boxes].reverse().slice(0,10)" :key="b.id" class="card" @click="router.push(`/task/${task.id}/box/${b.code}`)" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
          <span class="status-dot" :style="{background: stepColor(task, b.status)}"></span>
          <div style="flex:1;">
            <div style="font-weight:700;">{{ b.code }}</div>
            <div style="font-size:12px;color:var(--text-secondary);">{{ b.roomTo }} · {{ b.tags.join(', ') || '无标签' }}</div>
          </div>
          <span style="font-size:12px;color:var(--text-secondary);">{{ stepName(task, b.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 13px;
}
.step-chip.off { opacity: 0.45; text-decoration: line-through; }
.step-chip strong { font-weight: 800; }
</style>
