import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:5224',
            changeOrigin: true,
            secure: false,
            ws: true,
            configure: (proxy, _options) => {
              proxy.on('error', (err, _req, _res) => {
                console.log('Backend proxy error:', err.message);
                console.log('Make sure the backend server is running on http://localhost:5224');
                console.log('Run: cd Backend/Backend/Backend && dotnet run');
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
