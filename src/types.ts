export type UnloadStep = {
  id: string;
  name: string;
  /** 排序权重，越小越靠前 */
  order: number;
  /** 被停用后不再出现在扫码页和箱子详情页的可选项里，但已有箱子仍保留该状态 */
  active: boolean;
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
  /** 引用所属任务 steps 中的某一步 */
  stepId: string;
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
  steps: UnloadStep[];
  boxes: Box[];
  createdAt: number;
};
