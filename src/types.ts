export type TaskStep = {
  id: string;
  name: string;
  /** 顺序即数组下标；停用后不参与扫码页/详情页的可选步骤 */
  active: boolean;
  /** 是否曾被箱子设置过；为 true 后只能停用不能删除 */
  used?: boolean;
};

export type Box = {
  id: string;
  code: string; // e.g. A-014
  roomFrom: string;
  roomTo: string;
  tags: string[];
  fragile: boolean;
  liquid: boolean;
  photo?: string; // compressed dataURL
  weightKg?: number;
  /** 指向所属任务 steps 中某一步的 id */
  status: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export type MoveTask = {
  id: string;
  title: string;
  from: string;
  to: string;
  date: string;
  rooms: string[];
  /** 每个任务自定义的卸货步骤，顺序即先后次序 */
  steps: TaskStep[];
  boxes: Box[];
  createdAt: number;
};

/** 旧版本写死的六档状态迁移为每个任务自带的默认步骤；步骤 id 沿用旧 status 值，老箱子无需改动 */
export function createDefaultSteps(): TaskStep[] {
  return [
    { id: 'packed', name: '待打包', active: true },
    { id: 'loaded', name: '已装车', active: true },
    { id: 'arrived', name: '已到达', active: true },
    { id: 'damaged', name: '破损', active: true },
    { id: 'missing', name: '缺失', active: true },
    { id: 'unpacked', name: '已拆箱', active: true },
  ];
}
