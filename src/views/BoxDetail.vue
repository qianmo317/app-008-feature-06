<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask, updateBox, deleteBox } from '../db';
import { generateQRDataURL, stepColor, stepName, findStep, activeSteps } from '../utils';
import type { MoveTask, Box } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);
const box = ref<Box | null>(null);
const qrUrl = ref('');

const choices = computed(() => (task.value ? activeSteps(task.value) : []));

/** 箱子正停在已停用/已删除的步骤上时，仍要把当前步骤显示出来 */
const currentStepMissing = computed(() =>
  task.value && box.value ? !findStep(task.value, box.value.status) : false,
);

async function load() {
  const t = await getTask(route.params.id as string);
  task.value = t;
  if (!t) return;
  const b = t.boxes.find((x) => x.code === (route.params.code as string));
  if (!b) return;
  box.value = b;
  qrUrl.value = await generateQRDataURL(t.id, b.code);
}

async function setStatus(stepId: string) {
  if (!box.value || !task.value) return;
  box.value.status = stepId;
  box.value.updatedAt = Date.now();
  await updateBox(task.value.id, box.value);
}

async function remove() {
  if (!box.value || !task.value) return;
  if (!confirm('确定删除此箱子？')) return;
  await deleteBox(task.value.id, box.value.id);
  router.push(`/task/${task.value.id}`);
}

onMounted(load);
</script>

<template>
  <div v-if="task && box">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>箱子详情 {{ box.code }}</h1>
    </div>
    <div class="page">
      <div class="qr-wrap">
        <img :src="qrUrl" alt="qr" />
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">扫码查看箱内物品</div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="status-dot" :style="{background: stepColor(task, box.status)}"></span>
          <span style="font-weight:700;">{{ stepName(task, box.status) }}</span>
          <span v-if="currentStepMissing" style="font-size:12px;color:var(--warning);">（该步骤已停用或删除）</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <button
            v-for="s in choices"
            :key="s.id"
            class="tag"
            :class="{active: box.status === s.id}"
            @click="setStatus(s.id)"
          >
            {{ s.name }}
          </button>
        </div>
        <div v-if="choices.length === 0" style="font-size:13px;color:var(--text-secondary);">
          当前任务没有启用的步骤，
          <router-link :to="`/task/${task.id}/steps`" style="color:var(--primary-dark);">去设置</router-link>
        </div>
      </div>

      <div class="card">
        <div style="font-size:14px;color:var(--text-secondary);">目标房间</div>
        <div style="font-weight:700;">{{ box.roomTo }}</div>
      </div>
      <div class="card">
        <div style="font-size:14px;color:var(--text-secondary);">标签</div>
        <div>{{ box.tags.join(', ') || '无' }}</div>
      </div>
      <div class="card" v-if="box.fragile || box.liquid">
        <div style="font-size:14px;color:var(--text-secondary);">特殊标记</div>
        <div>{{ box.fragile ? '易碎 ' : '' }}{{ box.liquid ? '液体禁运' : '' }}</div>
      </div>
      <div class="card" v-if="box.weightKg">
        <div style="font-size:14px;color:var(--text-secondary);">重量</div>
        <div>{{ box.weightKg }} kg</div>
      </div>
      <div class="card" v-if="box.photo">
        <img :src="box.photo" style="width:100%;border-radius:10px;" />
      </div>
      <div class="card" v-if="box.note">
        <div style="font-size:14px;color:var(--text-secondary);">备注</div>
        <div>{{ box.note }}</div>
      </div>

      <button class="btn btn-danger btn-block" @click="remove">删除此箱</button>
    </div>
  </div>
</template>
