export interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: Props) {
  return (
    <nav class="flex border-t border-gray-200 bg-white shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          class={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
            active === tab.id
              ? 'text-indigo-600 border-t-2 border-indigo-600 -mt-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span class="text-base leading-none">{tab.icon}</span>
          <span class="mt-0.5">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
