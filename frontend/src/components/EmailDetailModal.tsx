'use client';

import React from 'react';
import { EmailItem } from '../types';
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  Send,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

interface EmailDetailModalProps {
  email: EmailItem | null;
  onClose: () => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, onClose }) => {
  if (!email) return null;

  const getSenderInitial = (sender: string) => {
    return sender.charAt(0).toUpperCase();
  };

  const getSenderName = (sender: string) => {
    const local = sender.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1).replace(/[._]/g, ' ');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-text-primary truncate">
            {email.subject}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="p-2 text-text-muted hover:text-amber-400 transition-colors">
            <Star className="w-5 h-5" />
          </button>
          <button className="p-2 text-text-muted hover:text-text-secondary transition-colors">
            <Archive className="w-5 h-5" />
          </button>
          <button className="p-2 text-text-muted hover:text-red-500 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(getSenderName(email.sender))}&background=00A844&color=fff&size=32`}
            alt=""
            className="w-8 h-8 rounded-full ml-2"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Sender Info */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {getSenderInitial(email.sender)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">{getSenderName(email.sender)}</span>
                <span className="text-sm text-text-secondary">&lt;{email.sender}&gt;</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-text-secondary mt-0.5">
                <span>to {email.recipient}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
          <span className="text-sm text-text-secondary shrink-0">
            {formatDate(email.sentAt || email.scheduledAt)}
          </span>
        </div>

        {/* Status Banners */}
        {email.sentAt && (
          <div className="mb-6 p-4 bg-brand-light border-l-4 border-brand rounded-r-lg text-sm text-brand flex items-center gap-2">
            <Send className="w-4 h-4 shrink-0" />
            <span>Delivered successfully at {formatDate(email.sentAt)}</span>
          </div>
        )}

        {email.failReason && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-r-lg text-sm text-red-600 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {email.status === 'RESCHEDULED' ? 'Rescheduled (Rate Limit)' : 'Delivery Failed'}
            </div>
            <div className="text-xs font-mono opacity-80">{email.failReason}</div>
          </div>
        )}

        {email.status === 'SCHEDULED' && !email.sentAt && (
          <div className="mb-6 p-4 bg-amber-50 border-l-4 border-badge-scheduled rounded-r-lg text-sm text-amber-800">
            Scheduled for {formatDate(email.scheduledAt)}
          </div>
        )}

        {/* Email Body */}
        <div className="prose prose-sm max-w-none text-text-primary leading-relaxed">
          <div
            className="text-sm whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: email.body }}
          />
        </div>

        {/* Metadata Footer */}
        <div className="mt-10 pt-6 border-t border-border-light">
          <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
            <div>
              <span className="font-medium text-text-primary">Status:</span>{' '}
              {email.status.charAt(0) + email.status.slice(1).toLowerCase()}
            </div>
            <div>
              <span className="font-medium text-text-primary">Job ID:</span>{' '}
              {email.bullmqJobId || 'Pending'}
            </div>
            <div>
              <span className="font-medium text-text-primary">Scheduled:</span>{' '}
              {formatDate(email.scheduledAt)}
            </div>
            <div>
              <span className="font-medium text-text-primary">Created:</span>{' '}
              {formatDate(email.createdAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
