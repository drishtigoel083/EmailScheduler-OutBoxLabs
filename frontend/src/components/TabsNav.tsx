'use client';

import React from 'react';
import { Search, RefreshCw, SlidersHorizontal } from 'lucide-react';

interface TabsNavProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const TabsNav: React.FC<TabsNavProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="flex items-center gap-3 px-8 py-5">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search"
          className="w-full pl-11 pr-4 py-2.5 bg-surface-input border-0 rounded-pill text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
        />
      </div>

      <button
        className="p-2.5 text-text-secondary hover:text-text-primary transition-colors"
        title="Filter"
      >
        <SlidersHorizontal className="w-5 h-5" />
      </button>

      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-2.5 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-brand' : ''}`} />
      </button>
    </div>
  );
};
