'use client';

import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  AlertCircle,
  CheckCircle,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  List,
  ListOrdered,
  Link2,
  Undo2,
  Redo2,
  Type,
} from 'lucide-react';
import Papa from 'papaparse';
import axios from 'axios';
import { CSVLead } from '../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  apiUrl: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  apiUrl,
}) => {
  const [mode, setMode] = useState<'single' | 'csv'>('single');
  const [sender, setSender] = useState('sender@example.com');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [delayMs, setDelayMs] = useState(1000);
  const [hourlyLimit, setHourlyLimit] = useState(50);

  const [csvLeads, setCsvLeads] = useState<CSVLead[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: CSVLead[] = [];
        results.data.forEach((row: any) => {
          const email = row.email || row.Email || row['E-mail'] || Object.values(row)[0];
          if (email && typeof email === 'string' && email.includes('@')) {
            parsed.push({
              email: email.trim(),
              name: row.name || row.Name || '',
              company: row.company || row.Company || '',
            });
          }
        });

        setCsvLeads(parsed);
        setStatusMessage(`Successfully parsed ${parsed.length} leads from CSV.`);
      },
      error: (err) => {
        console.error('CSV parse error:', err);
        setStatusMessage('Failed to parse CSV file. Please verify format.');
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const targetStartTime = scheduledAt ? new Date(scheduledAt).getTime() : Date.now();

      if (mode === 'single') {
        if (!recipient) {
          throw new Error('Please enter a recipient email address.');
        }

        await axios.post(`${apiUrl}/emails/schedule`, {
          sender,
          recipient,
          subject,
          body,
          scheduledAt: new Date(targetStartTime).toISOString(),
        });
      } else {
        if (csvLeads.length === 0) {
          throw new Error('Please upload a valid CSV file with recipient emails.');
        }

        let currentDelayOffset = 0;
        for (let i = 0; i < csvLeads.length; i++) {
          const lead = csvLeads[i];
          const leadTargetTime = new Date(targetStartTime + currentDelayOffset).toISOString();

          const personalizedBody = body
            .replace(/{{name}}/g, lead.name || 'there')
            .replace(/{{company}}/g, lead.company || 'your company');

          await axios.post(`${apiUrl}/emails/schedule`, {
            sender,
            recipient: lead.email,
            subject,
            body: personalizedBody,
            scheduledAt: leadTargetTime,
          });

          currentDelayOffset += Number(delayMs);
        }
      }

      setStatusMessage('Emails scheduled successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Schedule submit error:', err);
      setStatusMessage(err.response?.data?.error || err.message || 'Scheduling failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-text-primary">Compose New Email</h2>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 text-text-secondary hover:text-text-primary transition-colors relative">
            <Paperclip className="w-5 h-5" />
            {mode === 'csv' && csvLeads.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {csvLeads.length}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSchedulePicker(!showSchedulePicker)}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <Clock className="w-5 h-5" />
            </button>

            {showSchedulePicker && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-border rounded-xl shadow-modal p-4 z-20">
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Schedule for later
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-input rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowSchedulePicker(false)}
                    className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSchedulePicker(false)}
                    className="px-4 py-1.5 text-sm border border-brand text-brand rounded-lg hover:bg-brand-light"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            form="compose-form"
            disabled={isSubmitting}
            className="btn-primary px-5 py-2 disabled:opacity-50"
          >
            {scheduledAt ? 'Send Later' : isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Form */}
      <form id="compose-form" onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* From */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0">From</label>
          <div className="flex-1">
            <input
              type="email"
              required
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="inline-block px-4 py-1.5 bg-surface-input rounded-pill text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        {/* To */}
        <div className="flex items-start gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0 pt-2">To</label>
          <div className="flex-1 space-y-2">
            {mode === 'single' ? (
              <input
                type="email"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full px-4 py-2 bg-transparent border-b border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors"
              />
            ) : (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
                {csvLeads.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {csvLeads.slice(0, 3).map((lead, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-3 py-1 border border-brand rounded-pill text-xs text-text-primary"
                      >
                        {lead.email}
                      </span>
                    ))}
                    {csvLeads.length > 3 && (
                      <span className="inline-flex items-center px-3 py-1 bg-brand-light rounded-pill text-xs text-brand font-medium">
                        +{csvLeads.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'single' ? 'csv' : 'single');
              if (mode === 'single') fileInputRef.current?.click();
            }}
            className="flex items-center gap-1.5 text-sm text-brand font-medium hover:opacity-80 shrink-0"
          >
            <Upload className="w-4 h-4" />
            Upload List
          </button>
        </div>

        {/* Subject */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0">Subject</label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 px-0 py-2 bg-transparent border-b border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors"
          />
        </div>

        {/* Delay & Hourly Limit */}
        <div className="flex items-center gap-8 pl-20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary">Delay between 2 emails</span>
            <input
              type="number"
              min="0"
              step="500"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="w-16 px-2 py-1.5 bg-surface-input rounded-lg text-sm text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary">Hourly Limit</span>
            <input
              type="number"
              min="1"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-16 px-2 py-1.5 bg-surface-input rounded-lg text-sm text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        {/* Editor Area */}
        <div className="mt-4 bg-surface-editor rounded-xl border border-border-light min-h-[320px] relative">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-2.5 bg-white rounded-t-xl border-b border-border-light mx-auto max-w-fit mt-4 shadow-sm">
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Undo2 className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Redo2 className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary flex items-center gap-0.5"><Type className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Bold className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Italic className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Underline className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><AlignLeft className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><AlignCenter className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><List className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><ListOrdered className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-border mx-1" />
            <button type="button" className="p-1.5 text-text-secondary hover:text-text-primary"><Link2 className="w-4 h-4" /></button>
          </div>

          {/* Body Textarea */}
          <textarea
            required
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="w-full px-6 py-4 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none resize-none"
          />
        </div>

        {/* CSV file info */}
        {mode === 'csv' && fileName && (
          <div className="flex items-center gap-2 text-xs text-text-secondary pl-20">
            <CheckCircle className="w-3.5 h-3.5 text-brand" />
            <span>{fileName} — {csvLeads.length} leads parsed</span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className={`mx-auto max-w-4xl px-6 py-3 rounded-lg text-sm flex items-center gap-2 ${
            statusMessage.includes('success') || statusMessage.includes('parsed')
              ? 'bg-brand-light text-brand'
              : 'bg-red-50 text-red-600'
          }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </form>
    </div>
  );
};
