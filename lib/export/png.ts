// PNG of the preview, rendered on the server with resvg. Text (the size label)
// uses the bundled Montserrat, since servers like Vercel have no system fonts.
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const LABEL_FONT = path.join(process.cwd(), 'public', 'fonts', 'Montserrat-Bold.ttf');

export function svgToPng(svg: string, widthPx = 1200): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: widthPx },
    background: 'white',
    font: { fontFiles: [LABEL_FONT], loadSystemFonts: false, defaultFontFamily: 'Montserrat', sansSerifFamily: 'Montserrat' },
  });
  return r.render().asPng();
}
