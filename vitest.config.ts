import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test'), __BUILD_ID__: JSON.stringify('test') },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 120000 } },
      { extends: true, test: { name: 'campaign', include: ['tests/campaign/**/*.test.ts'], environment: 'node', testTimeout: 1800000, hookTimeout: 1800000 } },
    ],
  },
});
