import { useRef } from 'react';
import { cn } from '../../lib/cn';

interface TabsProps {
  tabs: { id: string; label: string; count?: number; panelId?: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = 'tabs-list';

  return (
    <div className="tabs-shell flex max-w-full gap-1 overflow-x-auto p-1" role="tablist" id={listId}>
      {tabs.map((tab, index) => {
        const panelId = tab.panelId ?? `tabpanel-${tab.id}`;
        return (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          ref={(el) => { tabsRef.current[index] = el; }}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={panelId}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(tab.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
               e.preventDefault();
               const next = (index + 1) % tabs.length;
               tabsRef.current[next]?.focus();
               onChange(tabs[next].id);
            } else if (e.key === 'ArrowLeft') {
               e.preventDefault();
               const prev = (index - 1 + tabs.length) % tabs.length;
               tabsRef.current[prev]?.focus();
               onChange(tabs[prev].id);
            }
          }}
          className={cn(
            'tabs-button whitespace-nowrap px-4 py-2 text-sm font-medium transition-all duration-200',
            activeTab === tab.id && 'tabs-button-active shadow-sm'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="tabs-count ml-1.5 rounded-full px-1.5 py-0.5 text-xs">
              {tab.count}
            </span>
          )}
        </button>
        );
      })}
    </div>
  );
}
