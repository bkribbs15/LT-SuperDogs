import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174 — the Masters pool dev server owns 5173 on the same machine.
    // Use `npm run dev -- --host` to test from a phone on the LAN.
    host: '127.0.0.1',
    port: 5174,
  },
})
