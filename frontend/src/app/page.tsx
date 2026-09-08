'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Sidebar } from '../components/Sidebar';
import { TabsNav } from '../components/TabsNav';
import { EmailTable } from '../components/EmailTable';
import { ComposeModal } from '../components/ComposeModal';
import { EmailDetailModal } from '../components/EmailDetailModal';
import { EmailItem, UserProfile } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function Dashboard() {
  const [user, setUser] = useState<UserProfile>({
    name: 'Oliver Brown',
    email: 'oliver.brown@domain.io',
  });

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'rescheduled'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

  const checkSlackStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/slack/status?userId=default-user-id`);
      setSlackConnected(res.data.connected);
    } catch (err) {
      console.error('Failed to check Slack status:', err);
    }
  }, []);

  const fetchEmails = useCallback(async () => {
    setIsRefreshing(true);
    try {
      let url = `${API_BASE_URL}/emails`;
      if (searchQuery.trim() !== '') {
        url = `${API_BASE_URL}/emails/search?q=${encodeURIComponent(searchQuery)}`;
      }

      const res = await axios.get(url);
      const data: EmailItem[] = res.data.data || res.data || [];
      setEmails(data);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchEmails();
    checkSlackStatus();

    const interval = setInterval(() => {
      fetchEmails();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchEmails, checkSlackStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'slack-connected') {
        setSlackConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectSlack = () => {
    window.open(`${API_BASE_URL}/slack/connect?userId=default-user-id`, 'Slack OAuth', 'width=600,height=700');
  };

  const filteredEmails = emails.filter((item) => {
    if (activeTab === 'scheduled') return item.status === 'SCHEDULED' || item.status === 'PROCESSING';
    if (activeTab === 'sent') return item.status === 'SENT';
    if (activeTab === 'rescheduled') return item.status === 'RESCHEDULED' || item.status === 'FAILED';
    return true;
  });

  const scheduledCount = emails.filter((i) => i.status === 'SCHEDULED' || i.status === 'PROCESSING').length;
  const sentCount = emails.filter((i) => i.status === 'SENT').length;
  const rescheduledCount = emails.filter((i) => i.status === 'RESCHEDULED' || i.status === 'FAILED').length;

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        rescheduledCount={rescheduledCount}
        onOpenCompose={() => setIsComposeOpen(true)}
        slackConnected={slackConnected}
        onConnectSlack={handleConnectSlack}
      />

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <TabsNav
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={fetchEmails}
          isRefreshing={isRefreshing}
        />

        <EmailTable
          emails={filteredEmails}
          isLoading={isLoading}
          onSelectEmail={(email) => setSelectedEmail(email)}
        />
      </main>

      {/* Modals */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={fetchEmails}
        apiUrl={API_BASE_URL}
      />

      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}
