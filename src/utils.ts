import QRCode from 'qrcode';
import type { MoveTask, UnloadStep } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 旧版六档状态的默认步骤定义，新建任务时沿用，同时作为老数据迁移基准。
 * 「已拆箱」固定在最后作为完成态（旧版房间进度即按已拆箱统计），
 * 破损/缺失作为异常状态紧挨其前；用户之后可自行改名、排序、停用。
 */
export const DEFAULT_STEP_DEFS: { id: string; name: string }[] = [
  { id: 'packed', name: '待打包' },
  { id: 'loaded', name: '已装车' },
  { id: 'arrived', name: '已到达' },
  { id: 'damaged', name: '破损' },
  { id: 'missing', name: '缺失' },
  { id: 'unpacked', name: '已拆箱' },
];

/** 新建任务默认携带的卸货步骤 */
export function defaultSteps(): UnloadStep[] {
  return DEFAULT_STEP_DEFS.map((d, i) => ({ id: d.id, name: d.name, order: i, active: true }));
}

/** 生成一个任务内唯一的新步骤 id */
export function newStepId(existing: UnloadStep[]): string {
  let id = uid();
  while (existing.some((s) => s.id === id)) id = uid();
  return id;
}

/** 按 order 排序的全部步骤 */
export function orderedSteps(task: MoveTask): UnloadStep[] {
  return [...task.steps].sort((a, b) => a.order - b.order);
}

/** 可在扫码页/详情页中选择的步骤（启用中），按顺序排列 */
export function selectableSteps(task: MoveTask): UnloadStep[] {
  return orderedSteps(task).filter((s) => s.active);
}

/** 任务的最后一步（完成态），即使被停用也算（可能已有箱子停在该步） */
export function terminalStep(task: MoveTask): UnloadStep | null {
  const list = orderedSteps(task);
  return list.length ? list[list.length - 1] : null;
}

export function getStep(task: MoveTask, stepId: string): UnloadStep | undefined {
  return task.steps.find((s) => s.id === stepId);
}

export function stepName(task: MoveTask, stepId: string): string {
  return getStep(task, stepId)?.name ?? '未知步骤';
}

/** 步骤是否被任何箱子使用中 */
export function stepInUse(task: MoveTask, stepId: string): boolean {
  return task.boxes.some((b) => b.stepId === stepId);
}

/** 步骤名字的重复校验（去首尾空格后比较），excludeId 用于编辑时排除自身 */
export function duplicateStepName(task: MoveTask, name: string, excludeId?: string): boolean {
  const n = name.trim();
  return task.steps.some((s) => s.id !== excludeId && s.name.trim() === n);
}

// 颜色按步骤在流程中的位置轮转；最后一步固定绿色作为完成态
const STEP_COLORS = [
  '#9ca3af', // 灰
  '#3b82f6', // 蓝
  '#f59e0b', // 橙
  '#8b5cf6', // 紫
  '#06b6d4', // 青
  '#ec4899', // 粉
  '#84cc16', // 黄绿
  '#f97316', // 深橙
  '#14b8a6', // 蓝绿
  '#a855f7', // 深紫
];

export function stepColor(task: MoveTask, stepId: string): string {
  const list = orderedSteps(task);
  const idx = list.findIndex((s) => s.id === stepId);
  if (idx === -1) return '#9ca3af';
  if (idx === list.length - 1) return '#22c55e';
  return STEP_COLORS[idx % STEP_COLORS.length];
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

export function estimateVehicle(boxCount: number, avgVolumeM3 = 0.08): { vehicle: string; suggestion: string } {
  const totalVolume = boxCount * avgVolumeM3;
  if (totalVolume <= 8) return { vehicle: '面包车/小型货车', suggestion: '建议选用 4.2m 厢式货车或面包车' };
  if (totalVolume <= 18) return { vehicle: '中型货车', suggestion: '建议选用 6.8m 厢式货车' };
  return { vehicle: '大型货车/多车', suggestion: '箱数较多，建议选用 9.6m 货车或分多车运输' };
}

/** 房间维度的进度：done = 停在任务最后一步的箱子数 */
export function roomProgress(task: MoveTask, room: string): { total: number; done: number } {
  const boxes = task.boxes.filter((b) => b.roomTo === room);
  const terminal = terminalStep(task);
  return {
    total: boxes.length,
    done: terminal ? boxes.filter((b) => b.stepId === terminal.id).length : 0,
  };
}
