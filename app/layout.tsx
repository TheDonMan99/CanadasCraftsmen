import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Brand fonts, self-hosted (SIL Open Font License; licences in app/fonts/).
const archivo = localFont({
  src: [
    { path: './fonts/Archivo-Variable.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/Archivo-Variable-Italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-archivo',
  display: 'swap',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
});
const alfa = localFont({
  src: './fonts/AlfaSlabOne-Regular.woff2',
  weight: '400',
  variable: '--font-alfa',
  display: 'swap',
  fallback: ['Rockwell', 'Georgia', 'serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://canadas-craftsmen.vercel.app'),
  title: { default: 'Canada’s Craftsmen: custom welcome signs and name signs', template: '%s · Canada’s Craftsmen' },
  description: 'Welcome signs and name signs, cut from real birch and maple in Sherwood Park, Alberta. Design yours on your phone and pick it up, usually within 7 days.',
  openGraph: { siteName: 'Canada’s Craftsmen', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#2b1d14' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${archivo.variable} ${alfa.variable}`}>
      <body>{children}</body>
    </html>
  );
}
