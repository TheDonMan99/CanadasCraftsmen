import { withUser } from '@/lib/auth/session';
import { labFile, type LabRequest } from '@/lib/server/lab';

export const runtime = 'nodejs';

const FORMATS = new Set(['svg', 'png', 'dxf', 'json']);

export async function POST(req: Request) {
  return withUser('download_files', () => labExport(req));
}

async function labExport(req: Request) {
  let body: LabRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body?.design || !Array.isArray(body.design.lines) || !FORMATS.has(body.format))
    return Response.json({ error: 'Expected { design, materialId, format }' }, { status: 400 });
  const file = await labFile(body);
  return new Response(typeof file.body === 'string' ? file.body : new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.type,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'X-Engine-Ok': String(file.result.ok),
    },
  });
}
