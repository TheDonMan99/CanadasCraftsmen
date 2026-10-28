// PNG of the preview, rendered on the server with resvg.
import { Resvg } from '@resvg/resvg-js';

export function svgToPng(svg: string, widthPx = 1200): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: widthPx }, background: 'white', font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } });
  return r.render().asPng();
}
