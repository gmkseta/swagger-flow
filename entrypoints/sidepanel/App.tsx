import { useState, useCallback } from 'preact/hooks';
import { Shell } from '../../src/components/layout/Shell';
import { TabBar, type Tab } from '../../src/components/layout/TabBar';
import { ToastProvider, useToast } from '../../src/components/layout/Toast';
import { ShortcutList } from '../../src/components/shortcuts/ShortcutList';
import { AuthManager } from '../../src/components/auth/AuthManager';
import { EnvEditor } from '../../src/components/env/EnvEditor';
import { HistoryList } from '../../src/components/history/HistoryList';
import type { Shortcut } from '../../src/db';
import { plugins } from '#tab-plugins';

const coreTabs: Tab[] = [
  { id: 'shortcuts', label: 'Shortcuts', icon: '⚡' },
  { id: 'auth', label: 'Auth', icon: '🔑' },
  { id: 'env', label: 'Env', icon: '🌍' },
  { id: 'history', label: 'History', icon: '📋' },
];

const pluginTabs: Tab[] = [...plugins]
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  .map((p) => ({ id: p.id, label: p.label, icon: p.icon }));

const tabs: Tab[] = [...coreTabs, ...pluginTabs];

function AppContent() {
  const [activeTab, setActiveTab] = useState('shortcuts');
  const [prefillShortcut, setPrefillShortcut] = useState<Omit<Shortcut, 'id'> | null>(null);
  const { clearAll } = useToast();

  const handleTabChange = useCallback((tab: string) => {
    clearAll();
    setActiveTab(tab);
  }, [clearAll]);

  function handleNavigateToShortcut(shortcut: Omit<Shortcut, 'id'>) {
    setPrefillShortcut(shortcut);
    handleTabChange('shortcuts');
  }

  return (
    <Shell>
      <div class="flex-1 overflow-y-auto p-3">
        {activeTab === 'shortcuts' && (
          <ShortcutList
            prefillShortcut={prefillShortcut}
            onPrefillConsumed={() => setPrefillShortcut(null)}
          />
        )}
        {activeTab === 'auth' && <AuthManager />}
        {activeTab === 'env' && <EnvEditor />}
        {activeTab === 'history' && (
          <HistoryList onNavigateToShortcut={handleNavigateToShortcut} />
        )}
        {!['shortcuts', 'auth', 'env', 'history'].includes(activeTab) && (() => {
          const plugin = plugins.find((p) => p.id === activeTab);
          if (!plugin) return null;
          const PluginComponent = plugin.component;
          return <PluginComponent />;
        })()}
      </div>
      <TabBar tabs={tabs} active={activeTab} onChange={handleTabChange} />
    </Shell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
