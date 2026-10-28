import { withUser } from '@/lib/auth/session';
import { loadSettings } from '@/lib/data';
import { calibrationSvg, type ExportSettings } from '@/lib/export';

export const runtime = 'nodejs';

export async function GET() {
  return withUser('download_files', async () =>
    new Response(calibrationSvg((await loadSettings()).export as ExportSettings), {
      headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': 'attachment; filename="calibration-10in-square.svg"' },
    }),
  );
}
