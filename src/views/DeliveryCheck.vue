<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { getTask, updateBox } from '../db';
import {
  selectableSteps,
  terminalStep,
  stepColor,
  stepName,
} from '../utils';
import type { MoveTask, Box } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const route = useRoute();
const task = ref<MoveTask | null>(null);
const pdfArea = ref<HTMLDivElement | null>(null);

const steps = computed(() => (task.value ? selectableSteps(task.value) : []));
const terminal = computed(() => (task.value ? terminalStep(task.value) : null));

const grouped = computed(() => {
  if (!task.value) return [] as { room: string; boxes: Box[] }[];
  return task.value.rooms.map((r) => ({
    room: r,
    boxes: task.value!.boxes.filter((b) => b.roomTo === r),
  })).filter((g) => g.boxes.length > 0);
});

/** 还没走到最后一步的箱子（替代旧版固定的缺件/破损清单） */
const unfinishedList = computed(() => {
  if (!task.value || !terminal.value) return [];
  const tId = terminal.value.id;
  return task.value.boxes.filter((b) => b.stepId !== tId);
});

async function load() {
  task.value = await getTask(route.params.id as string);
}

function nameOf(stepId: string): string {
  return task.value ? stepName(task.value, stepId) : '';
}

async function setStep(box: Box, stepId: string) {
  if (!task.value) return;
  box.stepId = stepId;
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
      stepName(task.value!, b.stepId),
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
      <div v-if="steps.length === 0" class="card" style="font-size:13px;color:var(--warning);">
        本任务还没有启用中的卸货步骤，请到任务页的「卸货步骤」中启用或新增。
      </div>
      <div v-if="grouped.length === 0" class="empty">还没有箱子</div>
      <div v-for="g in grouped" :key="g.room" class="card">
        <div style="font-weight:700;margin-bottom:10px;">{{ g.room }} ({{ g.boxes.length }} 箱)</div>
        <div v-for="b in g.boxes" :key="b.id" class="box-line">
          <span class="status-dot" :style="{background: stepColor(task, b.stepId)}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;">{{ b.code }}</div>
            <div style="font-size:12px;color:var(--text-secondary);">{{ b.tags.join(', ') }}</div>
          </div>
          <div class="step-btns">
            <button
              v-for="s in steps"
              :key="s.id"
              class="tag"
              :class="{active: b.stepId === s.id}"
              @click="setStep(b, s.id)"
            >{{ s.name }}</button>
          </div>
        </div>
      </div>

      <div v-if="unfinishedList.length && terminal" class="card" style="border-left:4px solid var(--warning);">
        <div style="font-weight:700;color:var(--warning);">
          未完成「{{ terminal.name }}」清单 ({{ unfinishedList.length }})
        </div>
        <div v-for="b in unfinishedList" :key="b.id" class="unfinished-row">
          {{ b.code }} · {{ b.roomTo }} ·
          <span :style="{color: stepColor(task, b.stepId)}">{{ stepName(task, b.stepId) }}</span>
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
              <td style="border:1px solid #ccc;padding:6px;">{{ stepName(task, b.stepId) }}</td>
              <td style="border:1px solid #ccc;padding:6px;">{{ b.note || '' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="unfinishedList.length && terminal" style="margin-top:16px;color:#d97706;">
          <strong>未完成「{{ terminal.name }}」清单:</strong>
          {{ unfinishedList.map(x => `${x.code}(${nameOf(x.stepId)})`).join(', ') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.box-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}
.step-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.unfinished-row {
  font-size: 14px;
  margin-top: 6px;
}
</style>
