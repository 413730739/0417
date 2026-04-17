import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/0417/',   // ← 加上這行，填你的倉庫名稱
})
