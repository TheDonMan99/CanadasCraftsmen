import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Welcome Sign Generator',
  description: 'Design and order laser-cut welcome signs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
