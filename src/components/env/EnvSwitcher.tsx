import { useEnv } from '../../hooks/useEnv';

export function EnvSwitcher() {
  const { environments, activeId, switchEnv } = useEnv();

  return (
    <select
      value={activeId}
      onChange={(e) => switchEnv((e.target as HTMLSelectElement).value)}
      class="text-xs bg-indigo-700 text-white border border-indigo-500 rounded px-2 py-1 focus:ring-1 focus:ring-white"
    >
      {environments.map((env) => (
        <option key={env.id} value={env.id}>
          {env.name}
        </option>
      ))}
    </select>
  );
}
