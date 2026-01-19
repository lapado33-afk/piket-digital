
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  define: {
    'process.env': process.env
  }
});
