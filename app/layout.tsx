import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '此间 · 我们的双人日记',
  description: '两个人的片段，写成可编辑的故事，按需配图，收进共同记忆。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
