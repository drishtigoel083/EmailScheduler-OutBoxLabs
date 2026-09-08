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
  userEmail: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  apiUrl,
  userEmail,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [delayMs, setDelayMs] = useState(1000);
  const [hourlyLimit, setHourlyLimit] = useState(50);

  const [csvLeads, setCsvLeads] = useState<CSVLead[]>([]);
  const [manualRecipients, setManualRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');

  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const addRecipients = (value: string) => {
    const emails = value
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .filter((email) => email && email.includes('@'));

    if (emails.length === 0) return;

    setManualRecipients((prev) => {
      const existing = new Set(prev.map((email) => email.toLowerCase()));

      const newEmails = emails.filter(
        (email) => !existing.has(email.toLowerCase())
      );

      return [...prev, ...newEmails];
    });
  };

  const handleRecipientKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();

      if (recipientInput.trim()) {
        addRecipients(recipientInput);
        setRecipientInput('');
      }
    }

    if (
      e.key === 'Backspace' &&
      !recipientInput &&
      manualRecipients.length > 0
    ) {
      setManualRecipients((prev) => prev.slice(0, -1));
    }
  };

  const handleRecipientBlur = () => {
    if (recipientInput.trim()) {
      addRecipients(recipientInput);
      setRecipientInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setManualRecipients((prev) =>
      prev.filter((recipient) => recipient !== email)
    );
  };

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
          const email =
            row.email ||
            row.Email ||
            row['E-mail'] ||
            Object.values(row)[0];

          if (
            email &&
            typeof email === 'string' &&
            email.includes('@')
          ) {
            parsed.push({
              email: email.trim(),
              name: row.name || row.Name || '',
              company: row.company || row.Company || '',
            });
          }
        });

        setCsvLeads(parsed);
        setStatusMessage(
          `Successfully parsed ${parsed.length} leads from CSV.`
        );
      },
      error: (err) => {
        console.error('CSV parse error:', err);
        setStatusMessage(
          'Failed to parse CSV file. Please verify format.'
        );
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      // Combine manually entered recipients + CSV recipients
      const recipients = [
        ...manualRecipients.map((email) => ({
          email,
          name: '',
          company: '',
        })),
        ...csvLeads,
      ];

      // Remove duplicate email addresses
      const uniqueRecipients = recipients.filter(
        (recipient, index, self) =>
          index ===
          self.findIndex(
            (item) =>
              item.email.toLowerCase() ===
              recipient.email.toLowerCase()
          )
      );

      if (uniqueRecipients.length === 0) {
        throw new Error(
          'Please add at least one recipient email or upload a valid CSV file.'
        );
      }

      const targetStartTime = scheduledAt
        ? new Date(scheduledAt).getTime()
        : Date.now();

      let currentDelayOffset = 0;

      for (const lead of uniqueRecipients) {
        const personalizedBody = body
          .replace(/{{name}}/g, lead.name || 'there')
          .replace(/{{company}}/g, lead.company || 'your company');

        await axios.post(`${apiUrl}/emails/schedule`, {
          sender: userEmail,
          recipient: lead.email,
          subject,
          body: personalizedBody,
          scheduledAt: new Date(
            targetStartTime + currentDelayOffset
          ).toISOString(),
        });

        currentDelayOffset += Number(delayMs);
      }

      setStatusMessage('Emails scheduled successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Schedule submit error:', err);
      setStatusMessage(
        err.response?.data?.error ||
        err.message ||
        'Scheduling failed.'
      );
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
          <h2 className="text-lg font-semibold text-text-primary">
            Compose New Email
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 text-text-secondary hover:text-text-primary transition-colors relative">
            <Paperclip className="w-5 h-5" />
            {csvLeads.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {csvLeads.length}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setShowSchedulePicker(!showSchedulePicker)
              }
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
            {scheduledAt
              ? 'Send Later'
              : isSubmitting
                ? 'Sending...'
                : 'Send'}
          </button>
        </div>
      </div>

      {/* Form */}
      <form
        id="compose-form"
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto px-6 py-6 space-y-5"
      >
        {/* From — logged-in user's email, read-only */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0">
            From
          </label>
          <div className="flex-1">
            <span className="inline-flex items-center px-4 py-1.5 bg-surface-input rounded-pill text-sm text-text-primary">
              {userEmail || 'Not signed in'}
            </span>
          </div>
        </div>

        {/* To — Multiple recipients + CSV upload */}
        <div className="flex items-start gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0 pt-2">
            To
          </label>

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 min-h-[38px] border-b border-border focus-within:border-brand transition-colors">
              {/* Manually added emails */}
              {manualRecipients.map((email, i) => (
                <span
                  key={`${email}-${i}`}
                  className="inline-flex items-center gap-1 px-3 py-1 border border-brand rounded-pill text-xs text-text-primary"
                >
                  {email}

                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    className="text-text-secondary hover:text-text-primary ml-1"
                    aria-label={`Remove ${email}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* CSV recipients */}
              {csvLeads.length > 0 &&
                csvLeads.slice(0, 3).map((lead, i) => (
                  <span
                    key={`csv-${i}`}
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

              {/* Email input */}
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientKeyDown}
                onBlur={handleRecipientBlur}
                placeholder={
                  manualRecipients.length === 0 &&
                    csvLeads.length === 0
                    ? 'Enter recipient email(s)'
                    : 'Add another email'
                }
                className="flex-1 min-w-[180px] px-0 py-2 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>

            <p className="text-xs text-text-muted">
              Press Enter or comma after each email to add multiple
              recipients
            </p>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-brand font-medium hover:opacity-80 shrink-0"
            >
              <Upload className="w-4 h-4" />
              Upload List
            </button>
          </div>
        </div>

        {/* Subject */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary w-16 shrink-0">
            Subject
          </label>
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
            <span className="text-sm text-text-secondary">
              Delay between 2 emails
            </span>
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
            <span className="text-sm text-text-secondary">
              Hourly Limit
            </span>
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
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary flex items-center gap-0.5"
            >
              <Type className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Underline className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="button"
              className="p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Link2 className="w-4 h-4" />
            </button>
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
        {fileName && (
          <div className="flex items-center gap-2 text-xs text-text-secondary pl-20">
            <CheckCircle className="w-3.5 h-3.5 text-brand" />
            <span>
              {fileName} — {csvLeads.length} leads parsed
            </span>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mx-auto max-w-4xl px-6 py-3 rounded-lg text-sm flex items-center gap-2 ${statusMessage.includes('success') ||
                statusMessage.includes('parsed')
                ? 'bg-brand-light text-brand'
                : 'bg-red-50 text-red-600'
              }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </form>
    </div>
  );
};