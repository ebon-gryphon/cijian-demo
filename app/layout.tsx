import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '此间 · 我们的关系空间',
  description: '在彼此眼里认识我们。体验双人认知、共同记忆与忙碌时的透明陪伴交接。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
