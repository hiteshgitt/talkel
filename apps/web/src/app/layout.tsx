import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  // Absolute URLs for link previews (the share image, icons).
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3100'),
  title: 'Talkel — Your AI Conversation Partner',
  description: 'Practise real English conversations with AI, then get friendly feedback.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
