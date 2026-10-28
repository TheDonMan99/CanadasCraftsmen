import { seedSettings } from '@/lib/config/catalog';
import { calibrationSvg, type ExportSettings } from '@/lib/export';

export const runtime = 'nodejs';

export function GET() {
  return new Response(calibrationSvg(seedSettings().export as ExportSettings), {
    headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': 'attachment; filename="calibration-10in-square.svg"' },
  });
}
