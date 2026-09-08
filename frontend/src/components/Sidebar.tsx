'use client';

import React from 'react';
import { Clock, Send, AlertTriangle, LogOut, Slack, CheckCircle2, ExternalLink } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { UserProfile } from '../types';

interface SidebarProps {
  user: UserProfile;
  activeTab: 'scheduled' | 'sent' | 'rescheduled';
  onSelectTab: (tab: 'scheduled' | 'sent' | 'rescheduled') => void;
  scheduledCount: number;
  sentCount: number;
  rescheduledCount: number;
  onOpenCompose: () => void;
  slackConnected: boolean;
  onConnectSlack: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  onSelectTab,
  scheduledCount,
  sentCount,
  rescheduledCount,
  onOpenCompose,
  slackConnected,
  onConnectSlack,
}) => {
  const navItems = [
    { id: 'scheduled' as const, label: 'Scheduled', icon: Clock, count: scheduledCount },
    { id: 'sent' as const, label: 'Sent', icon: Send, count: sentCount },
    { id: 'rescheduled' as const, label: 'Rate Limited', icon: AlertTriangle, count: rescheduledCount },
  ];

  return (
    <aside className="w-64 min-h-screen border-r border-border flex flex-col bg-white shrink-0">
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-black tracking-tight text-text-primary">ONE</h1>
      </div>

      {/* User Profile Card */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-3 p-3 bg-surface-input rounded-xl">
          <img
            src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=00A844&color=fff`}
            alt={user.name}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{user.name}</div>
            <div className="text-xs text-text-secondary truncate">{user.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            className="p-1 text-text-secondary hover:text-red-500 transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compose Button */}
      <div className="px-4 mb-6">
        <button
          onClick={onOpenCompose}
          className="w-full py-3 border border-brand text-brand rounded-pill text-sm font-medium hover:bg-brand-light transition-all"
        >
          Compose
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-4 flex-1">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-3">
          Core
        </div>
        <ul className="space-y-1">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <li key={id}>
              <button
                onClick={() => onSelectTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-brand-light text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon className={`w-4 h-4 ${activeTab === id ? 'text-brand' : ''}`} />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-xs text-text-secondary">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer Actions */}
      <div className="px-4 py-6 space-y-2 border-t border-border-light">
        <button
          onClick={onConnectSlack}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            slackConnected
              ? 'bg-brand-light text-brand'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <Slack className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">{slackConnected ? 'Slack Connected' : 'Connect Slack'}</span>
          {slackConnected && <CheckCircle2 className="w-3.5 h-3.5 text-brand" />}
        </button>
        <a
          href="http://localhost:4000/admin/queues"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-text-secondary hover:bg-surface-hover transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Queue Dashboard</span>
        </a>
      </div>
    </aside>
  );
};
