import type { MoveTask, Box, UnloadStep } from './types';
import { DEFAULT_STEP_DEFS, defaultSteps } from './utils';

const DB_NAME = 'MovingBoxTracker';
const DB_VERSION = 1;
const STORE_TASKS = 'tasks';

type LegacyBox = Omit<Box, 'stepId'> & { status?: string; stepId?: string };
type LegacyTask = Omit<MoveTask, 'steps' | 'boxes'> & { steps?: UnloadStep[]; boxes: LegacyBox[] };

/**
 * 老版本任务没有 steps，箱子用写死的 status 字符串。
 * 迁移时按默认六档建步骤（id 沿用旧状态名），箱子的 status 直接成为 stepId，
 * 未知状态兜底到第一步。
 */
export function migrateTask(raw: LegacyTask): MoveTask {
  const steps: UnloadStep[] = raw.steps && raw.steps.length > 0
    ? [...raw.steps].sort((a, b) => a.order - b.order).map((s) => ({ ...s }))
    : defaultSteps();

  const fallbackId = steps[0]?.id ?? DEFAULT_STEP_DEFS[0].id;
  const stepIds = new Set(steps.map((s) => s.id));

  const boxes: Box[] = raw.boxes.map((b) => {
    const stepId = b.stepId ?? (b.status as string | undefined) ?? fallbackId;
    const { status, ...rest } = b as LegacyBox;
    void status;
    return { ...rest, stepId: stepIds.has(stepId) ? stepId : fallbackId };
  });

  return { ...raw, steps, boxes };
}

function needsMigration(raw: LegacyTask): boolean {
  return !Array.isArray(raw.steps) || raw.steps.length === 0 ||
    raw.boxes.some((b) => b.stepId === undefined);
}

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

export async function getAllTasks(): Promise<MoveTask[]> {
  const db = await openDB();
  const raws = await new Promise<LegacyTask[]>((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const req = tx.objectStore(STORE_TASKS).getAll();
    req.onsuccess = () => resolve(req.result as LegacyTask[]);
    req.onerror = () => reject(req.error);
  });
  const tasks: MoveTask[] = [];
  const migrated: MoveTask[] = [];
  for (const raw of raws) {
    if (needsMigration(raw)) {
      const t = migrateTask(raw);
      tasks.push(t);
      migrated.push(t);
    } else {
      tasks.push(raw as unknown as MoveTask);
    }
  }
  if (migrated.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TASKS, 'readwrite');
      const store = tx.objectStore(STORE_TASKS);
      migrated.forEach((t) => store.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  return tasks;
}

export async function getTask(id: string): Promise<MoveTask | null> {
  const db = await openDB();
  const raw = await new Promise<LegacyTask | null>((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const req = tx.objectStore(STORE_TASKS).get(id);
    req.onsuccess = () => resolve((req.result as LegacyTask) || null);
    req.onerror = () => reject(req.error);
  });
  if (!raw) return null;
  if (needsMigration(raw)) {
    const task = migrateTask(raw);
    await saveTask(task);
    return task;
  }
  return raw as unknown as MoveTask;
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

export async function addBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes.push(box);
  await saveTask(task);
}

export async function updateBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const idx = task.boxes.findIndex((b) => b.id === box.id);
  if (idx === -1) throw new Error('Box not found');
  task.boxes[idx] = box;
  await saveTask(task);
}

export async function deleteBox(taskId: string, boxId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes = task.boxes.filter((b) => b.id !== boxId);
  await saveTask(task);
}
