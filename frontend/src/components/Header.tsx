'use client';

import React from 'react';
import { Mail, PlusCircle, ExternalLink, Slack, CheckCircle2, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile;
  slackConnected: boolean;
  onOpenCompose: () => void;
  onConnectSlack: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  slackConnected,
  onOpenCompose,
  onConnectSlack,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-100 leading-none">EmailScheduler</h1>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              BullMQ + Redis Active
            </p>
          </div>
        </div>

        {/* Action Controls & User Info */}
        <div className="flex items-center gap-3">
          {/* Slack Connect Button */}
          <button
            onClick={onConnectSlack}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              slackConnected
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            <Slack className="w-4 h-4 text-purple-400" />
            <span>{slackConnected ? 'Slack Alerts Active' : 'Connect Slack'}</span>
            {slackConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>

          {/* Bull Board Dashboard Link */}
          <a
            href="http://localhost:4000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-all"
          >
            <span>Bull Board Queue</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          {/* Compose Email Button */}
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Compose Email</span>
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <img
              src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=3b82f6&color=fff`}
              alt={user.name}
              className="w-9 h-9 rounded-full border border-slate-700 object-cover"
            />
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-200">{user.name}</div>
              <div className="text-[10px] text-slate-400 max-w-[120px] truncate">{user.email}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
