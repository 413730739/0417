<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// --- State Management ---
const isDarkMode = ref(false);
const showZhuyin = ref(false);
const isCountdownMode = ref(false);

// Form Data
const examSubject = ref('');
const invigilator = ref('');
const examTimeInput = ref('120'); // Default minutes

// Time Logic
const currentTime = ref(new Date());
const remainingSeconds = ref(120 * 60);
let timerInterval = null;

// --- Methods ---
const updateTime = () => {
  currentTime.value = new Date();
  if (isCountdownMode.value && remainingSeconds.value > 0) {
    remainingSeconds.value--;
  }
};

const toggleCountdown = () => {
  isCountdownMode.value = !isCountdownMode.value;
  if (isCountdownMode.value) {
    // Reset countdown based on input when switching to it
    remainingSeconds.value = parseInt(examTimeInput.value || 0) * 60;
  }
};

const formatTime = (date) => {
  return date.toLocaleTimeString('zh-TW', { hour12: false });
};

const formatCountdown = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// --- Lifecycle ---
onMounted(() => {
  timerInterval = setInterval(updateTime, 1000);
});

onUnmounted(() => {
  clearInterval(timerInterval);
});
</script>

<template>
  <div :class="['app-wrapper transition-all duration-500', isDarkMode ? 'dark-mode' : 'light-mode']">
    
    <!-- Header Section -->
    <header class="header">
      <div class="header-left">
        <a href="https://www.et.tku.edu.tw/" target="_blank" class="nav-button">
          <ruby v-if="showZhuyin">淡江教科系<rt>ㄉㄢˋ ㄐㄧㄤ ㄐㄧㄠˋ ㄎㄜ ㄒㄧˋ</rt></ruby>
          <span v-else>淡江教科系</span>
        </a>
      </div>
      <h1 class="title">
        <ruby v-if="showZhuyin">考試系統<rt>ㄎㄠˇ ㄕˋ ㄒㄧˋ ㄊㄨㄥˇ</rt></ruby>
        <span v-else>考試系統</span>
      </h1>
      <div class="header-right"></div> <!-- Spacer for centering -->
    </header>

    <main class="container">
      <!-- Tool Buttons -->
      <div class="button-group">
        <button @click="toggleCountdown" class="tool-btn">
          <ruby v-if="showZhuyin">切換倒數/現在時間<rt>ㄑㄧㄝ ㄏㄨㄢˋ ㄉㄠˇ ㄕㄨˋ / ㄒㄧㄢˋ ㄗㄞˋ ㄕˊ ㄐㄧㄢ</rt></ruby>
          <span v-else>切換倒數/現在時間</span>
        </button>
        <button @click="showZhuyin = !showZhuyin" class="tool-btn">
          <ruby v-if="showZhuyin">切換注音符號<rt>ㄑㄧㄝ ㄏㄨㄢˋ ㄓㄨˋ ㄧㄣ ㄈㄨˊ ㄏㄠˋ</rt></ruby>
          <span v-else>切換注音符號</span>
        </button>
        <button @click="isDarkMode = !isDarkMode" class="tool-btn">
          <ruby v-if="showZhuyin">切換黑白底色<rt>ㄑㄧㄝ ㄏㄨㄢˋ ㄏㄟ ㄅㄞˊ ㄉㄧˇ ㄙㄜˋ</rt></ruby>
          <span v-else>切換黑白底色</span>
        </button>
      </div>

      <!-- Time Display Area -->
      <div class="time-display">
        <h2 class="display-label">
          <ruby v-if="showZhuyin">{{ isCountdownMode ? '剩餘時間' : '現在時間' }}<rt>{{ isCountdownMode ? 'ㄕㄥˋ ㄩˊ ㄕˊ ㄐㄧㄢ' : 'ㄒㄧㄢˋ ㄗㄞˋ ㄕˊ ㄐㄧㄢ' }}</rt></ruby>
          <span v-else>{{ isCountdownMode ? '剩餘時間' : '現在時間' }}</span>
        </h2>
        <div class="time-value">
          {{ isCountdownMode ? formatCountdown(remainingSeconds) : formatTime(currentTime) }}
        </div>
      </div>

      <!-- Input and Info Section -->
      <div class="info-section">
        <div class="input-card">
          <div class="form-group">
            <label><ruby v-if="showZhuyin">考試時間(分)<rt>ㄎㄠˇ ㄕˋ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>考試時間(分)</span></label>
            <input v-model="examTimeInput" type="number" placeholder="例如: 120" />
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">考試科目<rt>ㄎㄠˇ ㄕˋ ㄎㄜ ㄇㄨˋ</rt></ruby><span v-else>考試科目</span></label>
            <input v-model="examSubject" type="text" placeholder="請輸入科目" />
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">監考老師<rt>ㄐㄧㄢ ㄎㄠˇ ㄌㄠˇ ㄕ</rt></ruby><span v-else>監考老師</span></label>
            <input v-model="invigilator" type="text" placeholder="請輸入姓名" />
          </div>
        </div>

        <div class="display-card">
          <h3><ruby v-if="showZhuyin">當前監考資訊<rt>ㄉㄤ ㄑㄧㄢˊ ㄐㄧㄢ ㄎㄠˇ ㄗ ㄒㄩㄣˋ</rt></ruby><span v-else>當前監考資訊</span></h3>
          <p><strong>科目：</strong> {{ examSubject || '尚未設定' }}</p>
          <p><strong>老師：</strong> {{ invigilator || '尚未設定' }}</p>
          <p><strong>時長：</strong> {{ examTimeInput }} 分鐘</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
}

.light-mode {
  background-color: #ffffff;
  color: #000000;
}

.dark-mode {
  background-color: #000000;
  color: #ffffff;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid #ccc;
}
.header-left, .header-right { flex: 1; }
.title { flex: 2; text-align: center; font-size: 1.5rem; margin: 0; }

.nav-button {
  background: #007bff;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  text-decoration: none;
  font-size: 0.9rem;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.button-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.tool-btn {
  padding: 1rem;
  cursor: pointer;
  border: 1px solid #007bff;
  background: transparent;
  color: inherit;
  border-radius: 8px;
  transition: background 0.2s;
  font-weight: 500;
}
.tool-btn:hover { background: rgba(0, 123, 255, 0.1); }
.dark-mode .tool-btn { border-color: #4da3ff; }

.time-display {
  text-align: center;
  margin: 3rem 0;
  padding: 2rem;
  border: 2px dashed #888;
  border-radius: 15px;
}
.time-value { font-size: 4rem; font-weight: bold; font-family: monospace; }

.info-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.input-card, .display-card { padding: 1.5rem; border: 1px solid #ddd; border-radius: 8px; }
.form-group { margin-bottom: 1rem; }

.form-group label { 
  display: block; 
  margin-bottom: 0.5rem; 
  font-weight: bold;
}

.form-group input { 
  width: 100%; 
  padding: 0.8rem; 
  border: 1px solid #ccc; 
  border-radius: 4px; 
  background-color: #fcfcfc;
  color: #333;
  font-size: 1rem;
}

.dark-mode .input-card, .dark-mode .display-card { border-color: #444; }

@media (max-width: 600px) {
  .time-value { font-size: 2.5rem; }
  .header { flex-direction: column; gap: 1rem; }
}
</style>
