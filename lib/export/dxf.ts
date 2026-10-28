// DXF export of the cut layer (R12 POLYLINE entities, inches, y up).

import type { Shape } from '@/lib/engine/types';
import { bounds } from '@/lib/engine/geom';

export function cutLayerDxf(cut: Shape, layerName = 'CUT'): string {
  const b = bounds(cut);
  const f = (n: number) => n.toFixed(5);
  const out: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$INSUNITS', '70', '1',
    '9', '$MEASUREMENT', '70', '0',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '1',
    '0', 'LAYER', '2', layerName, '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];
  for (const path of cut) {
    if (path.length < 3) continue;
    out.push('0', 'POLYLINE', '8', layerName, '66', '1', '70', '1');
    for (const p of path) out.push('0', 'VERTEX', '8', layerName, '10', f(p.x), '20', f(b.maxY - p.y), '30', '0');
    out.push('0', 'SEQEND', '8', layerName);
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
