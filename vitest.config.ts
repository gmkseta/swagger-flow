import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/auth/**/*.ts',
        'src/hooks/useAuthProvider.ts',
      ],
      exclude: [
        'src/auth/auth-provider.d.ts',
        'src/auth/provider.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': './src',
      '#auth-provider': new URL('./src/auth/providers/noop.ts', import.meta.url).pathname,
      '#tab-plugins': new URL('./src/plugins/noop-tabs.ts', import.meta.url).pathname,
    },
  },
});
