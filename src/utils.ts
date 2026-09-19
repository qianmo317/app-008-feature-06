import QRCode from 'qrcode';
import type { MoveTask, TaskStep } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function generateBoxCode(task: MoveTask, roomTo: string): string {
  const prefix = roomTo.charAt(0).toUpperCase();
  const sameRoomBoxes = task.boxes.filter((b) => b.roomTo === roomTo);
  const seq = sameRoomBoxes.length + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export async function generateQRDataURL(taskId: string, code: string): Promise<string> {
  const text = `movedoc://${taskId}/${code}`;
  return QRCode.toDataURL(text, { width: 256, margin: 2 });
}

export function compressImage(file: File, maxLongEdge = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge > maxLongEdge) {
        const ratio = maxLongEdge / longEdge;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function vibrateShort(): void {
  if (navigator.vibrate) navigator.vibrate(50);
}

export function playBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // ignore
  }
}

export function parseQRContent(text: string): { taskId?: string; code?: string } {
  const match = text.match(/^movedoc:\/\/([^/]+)\/(.+)$/);
  if (!match) return {};
  return { taskId: match[1], code: match[2] };
}

const STEP_PALETTE = [
  '#3b82f6', // 蓝
  '#10b981', // 青绿
  '#0ea5e9', // 天蓝
  '#8b5cf6', // 紫
  '#ec4899', // 粉
  '#14b8a6', // 蓝绿
  '#f59e0b', // 琥珀
];

/** 首档灰、末档绿（完成），中间按顺序取色；名为破损/缺失类的异常步骤给警示色 */
export function stepColor(task: MoveTask, stepId: string): string {
  const step = findStep(task, stepId);
  if (!step) return '#9ca3af';
  if (/破|损/.test(step.name)) return '#ef4444';
  if (/缺|失/.test(step.name)) return '#f59e0b';
  const idx = task.steps.indexOf(step);
  if (idx === 0) return '#9ca3af';
  if (idx === task.steps.length - 1) return '#22c55e';
  return STEP_PALETTE[(idx - 1) % STEP_PALETTE.length];
}

export function findStep(task: MoveTask, stepId: string): TaskStep | undefined {
  return task.steps.find((s) => s.id === stepId);
}

export function stepName(task: MoveTask, stepId: string): string {
  return findStep(task, stepId)?.name ?? '未知步骤';
}

/** 扫码页/详情页只展示启用中的步骤，顺序与任务定义一致 */
export function activeSteps(task: MoveTask): TaskStep[] {
  return task.steps.filter((s) => s.active);
}

/** 箱子当前停在（含）目标步骤之后的哪一档，用于进度统计 */
function boxReached(task: MoveTask, stepId: string, targetId: string): boolean {
  const a = task.steps.findIndex((s) => s.id === stepId);
  const b = task.steps.findIndex((s) => s.id === targetId);
  return a !== -1 && b !== -1 && a >= b;
}

export function estimateVehicle(boxCount: number, avgVolumeM3 = 0.08): { vehicle: string; suggestion: string } {
  const totalVolume = boxCount * avgVolumeM3;
  if (totalVolume <= 8) return { vehicle: '面包车/小型货车', suggestion: '建议选用 4.2m 厢式货车或面包车' };
  if (totalVolume <= 18) return { vehicle: '中型货车', suggestion: '建议选用 6.8m 厢式货车' };
  return { vehicle: '大型货车/多车', suggestion: '箱数较多，建议选用 9.6m 货车或分多车运输' };
}

/** 拆箱进度以任务最后一个启用步骤为“完成”口径 */
export function roomProgress(task: MoveTask, room: string): { total: number; done: number } {
  const boxes = task.boxes.filter((b) => b.roomTo === room);
  const doneStep = activeSteps(task).at(-1);
  return {
    total: boxes.length,
    done: doneStep ? boxes.filter((b) => boxReached(task, b.status, doneStep.id)).length : 0,
  };
}

/** 全任务各步骤的箱子数量（含停用步骤，老数据也要能显示） */
export function stepCounts(task: MoveTask): { step: TaskStep; count: number }[] {
  return task.steps.map((step) => ({
    step,
    count: task.boxes.filter((b) => b.status === step.id).length,
  }));
}
