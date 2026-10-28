// File names: S-1042_Smith_36in_Birch-6mm.svg for an order,
// 2026-11-03_Birch-6mm_Sheet1_PanelA.svg for a nested panel.

const clean = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .slice(0, 40) || 'Sign';

const inches = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}in`;

export function orderFileName(orderNumber: string, name: string, sizeIn: number, materialTag: string, ext = 'svg'): string {
  return `${clean(orderNumber)}_${clean(name)}_${inches(sizeIn)}_${clean(materialTag)}.${ext}`;
}

export function panelFileName(date: string, materialTag: string, sheet: number, panel: string, ext = 'svg'): string {
  return `${date}_${clean(materialTag)}_Sheet${sheet}_Panel${clean(panel)}.${ext}`;
}
