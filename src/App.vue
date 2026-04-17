<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// --- State Management ---
const isDarkMode = ref(false);
const showZhuyin = ref(false);
const isCountdownMode = ref(false);

// Form Data
const examSubject = ref('');
const invigilator = ref('');
const examStartHour = ref('09');
const examStartMinute = ref('00');
const examEndHour = ref('10');
const examEndMinute = ref('30');
const examList = ref([]);

// Time Logic
const currentTime = ref(new Date());
const remainingSeconds = ref(120 * 60);
let timerInterval = null;

// --- Methods ---
const updateTime = () => {
  currentTime.value = new Date();
  if (isCountdownMode.value) {
    const remaining = getExamRemainingSeconds();
    remainingSeconds.value = remaining;
  }
};

const toggleCountdown = () => {
  isCountdownMode.value = !isCountdownMode.value;
  if (isCountdownMode.value) {
    // Reset countdown based on current exam's end time
    remainingSeconds.value = getExamRemainingSeconds();
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

// 根據現在時間找出進行中的考試
const getCurrentExam = () => {
  const now = currentTime.value;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  for (let exam of examList.value) {
    const [startHour, startMin] = exam.startTime.split(':').map(Number);
    const [endHour, endMin] = exam.endTime.split(':').map(Number);
    const examStartMinutes = startHour * 60 + startMin;
    const examEndMinutes = endHour * 60 + endMin;
    
    if (currentMinutes >= examStartMinutes && currentMinutes < examEndMinutes) {
      return exam;
    }
  }
  return null;
};

// 計算當前考試的剩餘秒數
const getExamRemainingSeconds = () => {
  const exam = getCurrentExam();
  if (!exam) return 0;
  
  const now = currentTime.value;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();
  
  const [endHour, endMin] = exam.endTime.split(':').map(Number);
  const examEndMinutes = endHour * 60 + endMin;
  
  const totalCurrentSeconds = currentMinutes * 60 + currentSeconds;
  const totalEndSeconds = examEndMinutes * 60;
  
  const remaining = totalEndSeconds - totalCurrentSeconds;
  return Math.max(0, remaining);
};

const addExamToList = () => {
  if (examSubject.value.trim()) {
    const startTime = `${examStartHour.value}:${examStartMinute.value}`;
    const endTime = `${examEndHour.value}:${examEndMinute.value}`;
    examList.value.push({
      subject: examSubject.value,
      startTime: startTime,
      endTime: endTime,
      invigilator: invigilator.value || '尚未設定'
    });
    // 清空輸入框以方便下一筆輸入
    examSubject.value = '';
  }
};

const removeExam = (index) => {
  examList.value.splice(index, 1);
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
            <label><ruby v-if="showZhuyin">考試開始時間<rt>ㄎㄠˇ ㄕˋ ㄎㄞ ㄕˇ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>考試開始時間</span></label>
            <div class="time-input-group">
              <input v-model="examStartHour" type="number" min="0" max="23" placeholder="時" class="time-input" />
              <span class="time-separator">:</span>
              <input v-model="examStartMinute" type="number" min="0" max="59" placeholder="分" class="time-input" />
            </div>
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">考試結束時間<rt>ㄎㄠˇ ㄕˋ ㄐㄧㄝˊ ㄕㄨ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>考試結束時間</span></label>
            <div class="time-input-group">
              <input v-model="examEndHour" type="number" min="0" max="23" placeholder="時" class="time-input" />
              <span class="time-separator">:</span>
              <input v-model="examEndMinute" type="number" min="0" max="59" placeholder="分" class="time-input" />
            </div>
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">考試科目<rt>ㄎㄠˇ ㄕˋ ㄎㄜ ㄇㄨˋ</rt></ruby><span v-else>考試科目</span></label>
            <input v-model="examSubject" type="text" placeholder="請輸入科目" />
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">監考老師<rt>ㄐㄧㄢ ㄎㄠˇ ㄌㄠˇ ㄕ</rt></ruby><span v-else>監考老師</span></label>
            <input v-model="invigilator" type="text" placeholder="請輸入姓名" />
          </div>
          <button @click="addExamToList" class="add-btn">
            <ruby v-if="showZhuyin">加入考試列表<rt>ㄐㄧㄚ ㄖㄨˋ ㄎㄠˇ ㄕˋ ㄌㄧㄝˋ ㄅㄧㄠˇ</rt></ruby>
            <span v-else>加入考試列表</span>
          </button>
        </div>

        <div class="display-card">
          <h3><ruby v-if="showZhuyin">當前監考資訊<rt>ㄉㄤ ㄑㄧㄢˊ ㄐㄧㄢ ㄎㄠˇ ㄗ ㄒㄩㄣˋ</rt></ruby><span v-else>當前監考資訊</span></h3>
          <template v-if="getCurrentExam()">
            <p><strong>科目：</strong> {{ getCurrentExam().subject }}</p>
            <p><strong>老師：</strong> {{ getCurrentExam().invigilator }}</p>
            <p><strong>考試時段：</strong> {{ getCurrentExam().startTime }} - {{ getCurrentExam().endTime }}</p>
            <p v-if="isCountdownMode" style="color: #dc3545; font-weight: bold;"><strong>剩餘時間：</strong> {{ formatCountdown(remainingSeconds) }}</p>
          </template>
          <template v-else>
            <p><strong>科目：</strong> 尚未開始或已結束</p>
            <p><strong>老師：</strong> 無</p>
            <p><strong>考試時段：</strong> 無</p>
          </template>
        </div>
      </div>

      <!-- Exam List Section -->
      <div v-if="examList.length > 0" class="list-section">
        <div class="list-card">
          <h3><ruby v-if="showZhuyin">考科清單<rt>ㄎㄠˇ ㄎㄜ ㄑㄧㄥ ㄉㄢ</rt></ruby><span v-else>考科清單</span></h3>
          <table class="exam-table">
            <thead>
              <tr>
                <th><ruby v-if="showZhuyin">科目<rt>ㄎㄜ ㄇㄨˋ</rt></ruby><span v-else>科目</span></th>
                <th><ruby v-if="showZhuyin">開始時間<rt>ㄎㄞ ㄕˇ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>開始時間</span></th>
                <th><ruby v-if="showZhuyin">結束時間<rt>ㄐㄧㄝˊ ㄕㄨ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>結束時間</span></th>
                <th><ruby v-if="showZhuyin">監考<rt>ㄐㄧㄢ ㄎㄠˇ</rt></ruby><span v-else>監考</span></th>
                <th><ruby v-if="showZhuyin">操作<rt>ㄘㄠ ㄗㄨㄛˋ</rt></ruby><span v-else>操作</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in examList" :key="index">
                <td>{{ item.subject }}</td>
                <td>{{ item.startTime }}</td>
                <td>{{ item.endTime }}</td>
                <td>{{ item.invigilator }}</td>
                <td>
                  <button @click="removeExam(index)" class="delete-btn">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
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

.time-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-input {
  width: 60px !important;
  padding: 0.8rem !important;
  text-align: center;
}

.time-separator {
  font-size: 1.2rem;
  font-weight: bold;
}

.dark-mode .input-card, .dark-mode .display-card { border-color: #444; }

.add-btn {
  width: 100%;
  padding: 0.8rem;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  margin-top: 1rem;
}
.add-btn:hover { background-color: #218838; }

.list-section { margin-top: 2rem; }
.exam-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.exam-table th, .exam-table td {
  border: 1px solid #ddd;
  padding: 0.8rem;
  text-align: center;
}
.dark-mode .exam-table th, .dark-mode .exam-table td {
  border-color: #444;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn:hover { background-color: #c82333; }

.list-card { border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; }
.dark-mode .list-card { border-color: #444; }

@media (max-width: 600px) {
  .time-value { font-size: 2.5rem; }
  .header { flex-direction: column; gap: 1rem; }
}
</style>
