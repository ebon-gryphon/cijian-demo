import type { Metadata } from 'next';
import OnlineRoom from './room';

export const metadata: Metadata = {
  title: '联机测试 · 此间',
  description: '两个人使用邀请码进入同一个此间测试空间。',
};

export default function OnlinePage() {
  return <OnlineRoom />;
}
