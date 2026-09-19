import type { MoveTask, Box, TaskStep } from './types';
import { createDefaultSteps } from './types';
import { uid } from './utils';

const DB_NAME = 'MovingBoxTracker';
const DB_VERSION = 1;
const STORE_TASKS = 'tasks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
      }
    };
  });
}

/** 老版本任务没有 steps 字段，补上写死的六档；旧箱子的 status 正好等于对应步骤 id，无需改动 */
function migrate(task: MoveTask): MoveTask {
  if (!Array.isArray(task.steps) || task.steps.length === 0) {
    task.steps = createDefaultSteps();
  }
  // 当前仍有箱子停在的步骤视为已使用，迁移后不可删除
  for (const box of task.boxes) {
    const step = task.steps.find((s) => s.id === box.status);
    if (step) step.used = true;
  }
  return task;
}

export async function getAllTasks(): Promise<MoveTask[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as MoveTask[]).map(migrate));
    req.onerror = () => reject(req.error);
  });
}

export async function getTask(id: string): Promise<MoveTask | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.get(id);
    req.onsuccess = () => {
      const task = req.result as MoveTask | undefined;
      resolve(task ? migrate(task) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveTask(task: MoveTask): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readwrite');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.put(task);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTask(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readwrite');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** 箱子被设到某一步后，该步即视为“曾使用”，从此只能停用不能删除 */
function markStepUsed(task: MoveTask, stepId: string): void {
  const step = task.steps.find((s) => s.id === stepId);
  if (step) step.used = true;
}

export async function addBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes.push(box);
  markStepUsed(task, box.status);
  await saveTask(task);
}

export async function updateBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const idx = task.boxes.findIndex((b) => b.id === box.id);
  if (idx === -1) throw new Error('Box not found');
  task.boxes[idx] = box;
  markStepUsed(task, box.status);
  await saveTask(task);
}

export async function deleteBox(taskId: string, boxId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes = task.boxes.filter((b) => b.id !== boxId);
  await saveTask(task);
}

// ---- 任务自定义卸货步骤 ----

function normalizeName(name: string): string {
  return name.trim();
}

/** 同任务内步骤名不可重复（忽略首尾空格）；excludeId 用于改名时排除自身 */
export function findDuplicateStepName(task: MoveTask, name: string, excludeId?: string): boolean {
  const target = normalizeName(name).toLocaleLowerCase();
  return task.steps.some((s) => s.id !== excludeId && s.name.trim().toLocaleLowerCase() === target);
}

export function isStepInUse(task: MoveTask, stepId: string): boolean {
  return task.boxes.some((b) => b.status === stepId);
}

export async function addStep(taskId: string, name: string): Promise<MoveTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error('步骤名不能为空');
  if (findDuplicateStepName(task, trimmed)) throw new Error('同任务内已存在同名步骤');
  task.steps.push({ id: uid(), name: trimmed, active: true });
  await saveTask(task);
  return task;
}

export async function renameStep(taskId: string, stepId: string, name: string): Promise<MoveTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error('步骤名不能为空');
  if (findDuplicateStepName(task, trimmed, stepId)) throw new Error('同任务内已存在同名步骤');
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) throw new Error('Step not found');
  step.name = trimmed;
  await saveTask(task);
  return task;
}

export async function setStepActive(taskId: string, stepId: string, active: boolean): Promise<MoveTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) throw new Error('Step not found');
  step.active = active;
  await saveTask(task);
  return task;
}

/** 仅允许删除没有箱子正在使用、且从未被箱子使用过的步骤；否则只能停用 */
export async function deleteStep(taskId: string, stepId: string): Promise<MoveTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const step = task.steps.find((s) => s.id === stepId);
  if (step?.used || isStepInUse(task, stepId)) {
    throw new Error('该步骤已有箱子使用，只能停用不能删除');
  }
  task.steps = task.steps.filter((s) => s.id !== stepId);
  await saveTask(task);
  return task;
}

export async function reorderSteps(taskId: string, steps: TaskStep[]): Promise<MoveTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.steps = steps;
  await saveTask(task);
  return task;
}
