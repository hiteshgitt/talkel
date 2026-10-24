import type { Metadata } from 'next';
import { Geist, Outfit } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Absolute URLs for link previews (the share image, icons).
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3100'),
  title: 'Talkel — Your AI Conversation Partner',
  description: 'Practise real English conversations with AI, then get friendly feedback.',
};

const themeScript = `(function(){try{var t=localStorage.getItem('talkel-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${outfit.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
