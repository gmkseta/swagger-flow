import type { ComponentType } from 'preact';

export interface TabPlugin {
  id: string;
  label: string;
  icon: string;
  order?: number;
  component: ComponentType;
}
