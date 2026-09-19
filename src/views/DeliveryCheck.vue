<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { getTask, updateBox } from '../db';
import { stepColor, stepName, activeSteps, findStep } from '../utils';
import type { MoveTask, Box, TaskStep } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const route = useRoute();
const task = ref<MoveTask | null>(null);
const pdfArea = ref<HTMLDivElement | null>(null);

const grouped = computed(() => {
  if (!task.value) return [] as { room: string; boxes: Box[] }[];
  return task.value.rooms.map((r) => ({
    room: r,
    boxes: task.value!.boxes.filter((b) => b.roomTo === r),
  })).filter((g) => g.boxes.length > 0);
});

const choices = computed(() => (task.value ? activeSteps(task.value) : []));

/** 异常清单按步骤名归类，不写死状态值 */
const abnormalGroups = computed(() => {
  if (!task.value) return [] as { step: TaskStep; boxes: Box[]; tone: 'warning' | 'danger' }[];
  return task.value.steps
    .map((step) => {
      let tone: 'warning' | 'danger' | null = null;
      if (/破|损/.test(step.name)) tone = 'danger';
      else if (/缺|失/.test(step.name)) tone = 'warning';
      if (!tone) return null;
      return { step, tone, boxes: task.value!.boxes.filter((b) => b.status === step.id) };
    })
    .filter((g): g is { step: TaskStep; boxes: Box[]; tone: 'warning' | 'danger' } => !!g && g.boxes.length > 0);
});

async function load() {
  task.value = await getTask(route.params.id as string);
}

async function setStatus(box: Box, stepId: string) {
  if (!task.value) return;
  box.status = stepId;
  box.updatedAt = Date.now();
  await updateBox(task.value.id, box);
}

function exportSheet() {
  if (!task.value) return;
  const lines = [
    `搬家箱单 - ${task.value.title}`,
    `日期: ${task.value.date}`,
    `从: ${task.value.from} → 到: ${task.value.to}`,
    '',
    '箱号,目标房间,标签,易碎,液体禁运,步骤,备注',
    ...task.value.boxes.map((b) => [
      b.code,
      b.roomTo,
      b.tags.join(';'),
      b.fragile ? '是' : '否',
      b.liquid ? '是' : '否',
      stepName(task.value!, b.status),
      b.note || '',
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${task.value.title}_箱单.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF() {
  if (!task.value || !pdfArea.value) return;
  const canvas = await html2canvas(pdfArea.value, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(`${task.value.title}_箱单.pdf`);
}

onMounted(load);
</script>

<template>
  <div v-if="task">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>卸货核对</h1>
      <div class="no-print" style="display:flex;gap:8px;">
        <button class="btn" style="padding:8px 14px;font-size:14px;" @click="exportSheet">导出 CSV</button>
        <button class="btn" style="padding:8px 14px;font-size:14px;" @click="exportPDF">导出 PDF</button>
      </div>
    </div>
    <div class="page">
      <div v-if="grouped.length === 0" class="empty">还没有箱子</div>
      <div v-for="g in grouped" :key="g.room" class="card">
        <div style="font-weight:700;margin-bottom:10px;">{{ g.room }} ({{ g.boxes.length }} 箱)</div>
        <div v-for="b in g.boxes" :key="b.id" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);">
          <span class="status-dot" :style="{background: stepColor(task, b.status)}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;">{{ b.code }}</div>
            <div style="font-size:12px;color:var(--text-secondary);">{{ b.tags.join(', ') }}</div>
            <div v-if="!findStep(task, b.status)" style="font-size:11px;color:var(--warning);">当前步骤已停用或删除</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button
              v-for="s in choices"
              :key="s.id"
              class="tag"
              :class="{active: b.status === s.id}"
              @click="setStatus(b, s.id)"
            >
              {{ s.name }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-for="ag in abnormalGroups"
        :key="ag.step.id"
        class="card"
        :style="{borderLeft: `4px solid var(--${ag.tone})`}"
      >
        <div :style="{fontWeight:700, color:`var(--${ag.tone})`}">{{ ag.step.name }}清单 ({{ ag.boxes.length }})</div>
        <div v-for="b in ag.boxes" :key="b.id" style="font-size:14px;margin-top:6px;">
          {{ b.code }} · {{ b.roomTo }}
        </div>
      </div>

      <!-- hidden area for PDF export -->
      <div ref="pdfArea" style="position:absolute;left:-9999px;top:0;width:800px;background:#fff;color:#000;padding:20px;">
        <h2 style="margin:0 0 10px;">搬家箱单 - {{ task.title }}</h2>
        <p style="margin:0 0 6px;">日期: {{ task.date }} | 从: {{ task.from }} → 到: {{ task.to }}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">箱号</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">目标房间</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">标签</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">易碎</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">液体禁运</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">步骤</th>
              <th style="border:1px solid #ccc;padding:6px;text-align:left;">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in task.boxes" :key="b.id">
              <td style="border:1px solid #ccc;padding:6px;">{{ b.code }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.roomTo }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.tags.join('; ') }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.fragile ? '是' : '' }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.liquid ? '是' : '' }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ stepName(task, b.status) }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.note || '' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-for="ag in abnormalGroups" :key="ag.step.id" :style="{marginTop:'16px', color: ag.tone === 'danger' ? '#ef4444' : '#d97706'}">
          <strong>{{ ag.step.name }}清单:</strong> {{ ag.boxes.map(x => x.code).join(', ') }}
        </div>
      </div>
    </div>
  </div>
</template>
