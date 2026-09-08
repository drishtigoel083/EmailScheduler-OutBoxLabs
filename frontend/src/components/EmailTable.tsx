'use client';

import React from 'react';
import { EmailItem, EmailStatus } from '../types';
import { RefreshCw, Mail, Star } from 'lucide-react';

interface EmailTableProps {
  emails: EmailItem[];
  isLoading: boolean;
  onSelectEmail: (email: EmailItem) => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  emails,
  isLoading,
  onSelectEmail,
}) => {
  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-text-secondary text-sm">Loading emails...</p>
      </div>
    );
  }

  if (!emails || emails.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center mx-8">
        <div className="w-14 h-14 rounded-full bg-surface-input flex items-center justify-center mb-4">
          <Mail className="w-7 h-7 text-text-muted" />
        </div>
        <h3 className="text-base font-semibold text-text-primary">No emails found</h3>
        <p className="text-text-secondary text-sm mt-1 max-w-sm">
          No emails match the current view or search. Click Compose to schedule a new message.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: EmailStatus, scheduledAt: string) => {
    switch (status) {
      case 'SCHEDULED':
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-badge-scheduled text-white whitespace-nowrap">
            {new Date(scheduledAt).toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-badge-sent text-text-secondary">
            Sent
          </span>
        );
      case 'RESCHEDULED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-amber-100 text-amber-700">
            Rescheduled
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-red-100 text-red-600">
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getBodySnippet = (body: string) => {
    const plain = body.replace(/<[^>]*>/g, '').trim();
    return plain.length > 60 ? plain.slice(0, 60) + '...' : plain;
  };

  const getRecipientName = (recipient: string) => {
    const local = recipient.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1).replace(/[._]/g, ' ');
  };

  return (
    <div className="px-8 pb-8">
      <div className="divide-y divide-border-light">
        {emails.map((email) => (
          <div
            key={email.id}
            onClick={() => onSelectEmail(email)}
            className="py-5 flex items-start gap-4 cursor-pointer hover:bg-surface-hover/50 -mx-4 px-4 rounded-lg transition-colors group"
          >
            {/* Left: Recipient + Status */}
            <div className="flex items-center gap-3 min-w-[180px] shrink-0">
              <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
                To: {getRecipientName(email.recipient)}
              </span>
              {getStatusBadge(email.status, email.scheduledAt)}
            </div>

            {/* Center: Subject + Snippet */}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-text-primary">{email.subject}</span>
              <span className="text-sm text-text-secondary"> — {getBodySnippet(email.body)}</span>
            </div>

            {/* Right: Star */}
            <button
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="p-1 text-text-muted hover:text-amber-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
            >
              <Star className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
