// Type declaration for the #auth-provider build-time alias
declare module '#auth-provider' {
  import type { AuthProvider } from './provider';
  export const provider: AuthProvider;
}
