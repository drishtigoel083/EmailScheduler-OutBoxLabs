'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

import { Sidebar } from '../../components/Sidebar';
import { TabsNav } from '../../components/TabsNav';
import { EmailTable } from '../../components/EmailTable';
import { ComposeModal } from '../../components/ComposeModal';
import { EmailDetailModal } from '../../components/EmailDetailModal';
import { EmailItem, UserProfile } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

type Tab = 'scheduled' | 'sent' | 'rescheduled';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // ── State ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);

  // ── Derived user profile from session ─────────────────────────────
  const user: UserProfile = {
    name: session?.user?.name ?? 'User',
    email: session?.user?.email ?? '',
    image: session?.user?.image ?? undefined,
  };

  // ── Fetch emails ───────────────────────────────────────────────────
  const fetchEmails = useCallback(async (showSpinner = true) => {
    const email = session?.user?.email;

    // Don't fire the request until we actually have a logged-in session.
    // Backend requires userId or email — an unscoped call is intentionally rejected (400).
    if (!email) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await axios.get(`${API_URL}/emails`, {
        params: { email },
      });
      const raw = res.data;
      const list: EmailItem[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.emails)
            ? raw.emails
            : [];
      setEmails(list);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.user?.email]);

  const fetchSlackStatus = useCallback(async () => {
    const dbUserId = (session?.user as { id?: string })?.id;
    const email = session?.user?.email;
    if (!dbUserId && !email) return;

    try {
      const params = dbUserId ? { userId: dbUserId } : { email };
      const res = await axios.get(`${API_URL}/slack/status`, { params });
      setSlackConnected(Boolean(res.data?.connected));
    } catch (err) {
      console.error('Failed to fetch Slack status:', err);
    }
  }, [session?.user]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEmails();
      fetchSlackStatus();
    }
  }, [status, fetchEmails, fetchSlackStatus]);

  // Live polling every 5 seconds
  useEffect(() => {
    if (status !== 'authenticated') return;

    const interval = setInterval(() => {
      fetchEmails(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [status, fetchEmails]);

  // ── Filtered emails by tab & search ───────────────────────────────
  const isRateLimited = (e: EmailItem) =>
    e.failReason?.toLowerCase().includes('rate limit') ?? false;

  const filtered = emails.filter((e) => {
    const matchesTab =
      activeTab === 'scheduled'
        ? (e.status === 'SCHEDULED' || e.status === 'PROCESSING') && !isRateLimited(e)
        : activeTab === 'sent'
          ? e.status === 'SENT' || e.status === 'FAILED'
          : isRateLimited(e) || e.status === 'RESCHEDULED';

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      e.recipient.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      e.sender.toLowerCase().includes(q);

    return matchesTab && matchesSearch;
  });

  // ── Count by status ────────────────────────────────────────────────
  const scheduledCount = emails.filter(
    (e) => (e.status === 'SCHEDULED' || e.status === 'PROCESSING') && !isRateLimited(e)
  ).length;
  const sentCount = emails.filter(
    (e) => e.status === 'SENT' || e.status === 'FAILED'
  ).length;
  const rescheduledCount = emails.filter(
    (e) => isRateLimited(e) || e.status === 'RESCHEDULED'
  ).length;

  // ── Slack connect ──────────────────────────────────────────────────
  const handleConnectSlack = () => {
    const email = session?.user?.email;

    if (!email) return;

    const url = `${API_URL}/slack/connect?email=${encodeURIComponent(email)}`;
    window.open(url, '_blank', 'width=600,height=700');

    const onMessage = (e: MessageEvent) => {
      if (e.data === 'slack-connected') {
        setSlackConnected(true);
        fetchSlackStatus();
        window.removeEventListener('message', onMessage);
      }
    };

    window.addEventListener('message', onMessage);
  };

  // ── Loading skeleton ───────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#00A844] border-t-transparent" />
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <div className="flex min-h-screen bg-white">
      {/* ── Sidebar ── */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSearchQuery('');
        }}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        rescheduledCount={rescheduledCount}
        onOpenCompose={() => setIsComposeOpen(true)}
        slackConnected={slackConnected}
        onConnectSlack={handleConnectSlack}
      />

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white border-b border-[#E0E0E0] px-8 h-14 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1A1A1A] capitalize">{activeTab}</h2>
          <button
            onClick={() =>
              signOut({ callbackUrl: '/login' })
            }
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Search + refresh toolbar */}
        <TabsNav
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={() => fetchEmails(false)}
          isRefreshing={isRefreshing}
        />

        {/* Email list */}
        <div className="flex-1">
          <EmailTable
            emails={filtered}
            isLoading={isLoading}
            onSelectEmail={setSelectedEmail}
          />
        </div>
      </main>

      {/* ── Modals ── */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={() => fetchEmails(false)}
        apiUrl={API_URL}
        userEmail={session?.user?.email ?? ''}
        userId={(session?.user as { id?: string })?.id}
      />

      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}