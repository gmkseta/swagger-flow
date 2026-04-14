import { useState, useEffect } from 'preact/hooks';
import {
  getSyncData,
  setEnvironments,
  setActiveEnvId,
  onSyncChange,
  type Environment,
} from '../storage/sync';

export function useEnv() {
  const [environments, setEnvs] = useState<Environment[]>([]);
  const [activeId, setActiveId] = useState('default');

  useEffect(() => {
    getSyncData().then((d) => {
      setEnvs(d.environments);
      setActiveId(d.activeEnvId);
    });
    onSyncChange((changes) => {
      if (changes.environments) setEnvs(changes.environments);
      if (changes.activeEnvId) setActiveId(changes.activeEnvId);
    });
  }, []);

  const activeEnv = environments.find((e) => e.id === activeId) || environments[0];

  async function switchEnv(id: string) {
    await setActiveEnvId(id);
    setActiveId(id);
  }

  async function addEnvironment(env: Environment) {
    const updated = [...environments, env];
    await setEnvironments(updated);
    setEnvs(updated);
  }

  async function updateEnvironment(id: string, changes: Partial<Environment>) {
    const updated = environments.map((e) =>
      e.id === id ? { ...e, ...changes } : e,
    );
    await setEnvironments(updated);
    setEnvs(updated);
  }

  async function removeEnvironment(id: string) {
    if (environments.length <= 1) return; // keep at least one
    const updated = environments.filter((e) => e.id !== id);
    await setEnvironments(updated);
    setEnvs(updated);
    if (activeId === id) await switchEnv(updated[0].id);
  }

  function getVariables(): Record<string, string> {
    return activeEnv?.variables ?? {};
  }

  return {
    environments,
    activeEnv,
    activeId,
    switchEnv,
    addEnvironment,
    updateEnvironment,
    removeEnvironment,
    getVariables,
  };
}
