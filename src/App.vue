<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';

// --- State Management ---
const isDarkMode = ref(false);
const activeTab = ref('exam'); // 'exam', 'quiz', or 'tools'
const showZhuyin = ref(false);
const isCountdownMode = ref(false);
const isFullScreenTimer = ref(false);
const isExamFlashing = ref(false);
const isExamWarning = ref(false);

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

// --- Interactive Tools State ---
// 1. Random Draw
const namesInput = ref('');
const namesList = ref([]);
const drawnResult = ref(null);
const isDrawing = ref(false);
const excludeWinner = ref(false);

// 2. Scoreboard
const groups = ref([
  { name: '第一組', score: 0 },
  { name: '第二組', score: 0 }
]);
const sortedGroups = computed(() => {
  return [...groups.value].sort((a, b) => b.score - a.score);
});

// 3. Presentation Timer
const presentationSeconds = ref(0);
const isPresentationRunning = ref(false);
const isTimerFlashing = ref(false);
const isTimerWarning = ref(false);
let presentationInterval = null;

const activeMusic = ref(null);
let bgAudio = null;

const presentationPresets = [3, 5, 10]; // minutes

// 4. Digital Quiz System
const isPublishing = ref(false);
const studentScores = ref([]); // 儲存從學生端傳回的成績
const deletedTimestamps = ref(new Set(JSON.parse(localStorage.getItem('deleted_results_cache') || '[]')));
const studentSiteUrl = 'https://413730739.github.io/0417-2/';

// --- 資料庫配置 ---
// 此 URL 用於處理所有後端邏輯：包含發布題目、獲取學生成績以及刪除紀錄
const DATABASE_URL = 'https://script.google.com/macros/s/AKfycbyR7t58ExcpPfuuEY6wPz4ctdJg_V9fQ0klVnopEHYnYvn-DF-OzL8YxJTtKCI1h5nvCQ/exec';

// 從 localStorage 讀取已儲存的題目，若無則初始化為空陣列
const quizQuestions = ref(JSON.parse(localStorage.getItem('teacher_quiz_questions') || '[]'));

// 監聽題目變動並同步到 localStorage，確保重新整理後資料不遺失
watch(quizQuestions, (newVal) => {
  localStorage.setItem('teacher_quiz_questions', JSON.stringify(newVal));
}, { deep: true });

// 處理題型切換時的答案格式初始化
const handleTypeChange = () => {
  if (quizForm.value.type === 'multiple') {
    quizForm.value.answer = [];
  } else if (quizForm.value.type === 'boolean') {
    quizForm.value.answer = null;
  } else {
    quizForm.value.answer = null;
  }
};

const showQuizEditor = ref(false);
const editingId = ref(null);

const quizForm = ref({
  type: 'single',
  question: '',
  options: ['', ''],
  answer: null, // index for single, array for multiple, boolean for T/F
  explanation: ''
});

// Methods for Quiz Creator
const addOption = () => quizForm.value.options.push('');
const removeOption = (idx) => quizForm.value.options.splice(idx, 1);

const toggleQuizEditor = () => {
  showQuizEditor.value = !showQuizEditor.value;
  if (!showQuizEditor.value) {
    editingId.value = null;
    quizForm.value = { type: 'single', question: '', options: ['', ''], answer: null, explanation: '' };
  }
};

const editQuestion = (index) => {
  const q = quizQuestions.value[index];
  editingId.value = q.id;
  quizForm.value = {
    type: q.type,
    question: q.question,
    options: [...q.options],
    answer: Array.isArray(q.answer) ? [...q.answer] : q.answer,
    explanation: q.explanation || ''
  };
  showQuizEditor.value = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const addQuestionToQuiz = () => {
  if (!quizForm.value.question.trim()) return alert('請輸入題目');

  // 答案驗證
  if (quizForm.value.type === 'single') {
    const validOptions = quizForm.value.options.filter(opt => opt.trim() !== '');
    if (validOptions.length < 2) {
      return alert('單選題至少需要輸入兩個選項。');
    }
    if (quizForm.value.answer === null || quizForm.value.answer === undefined) {
      return alert('單選題請選擇一個正確答案。');
    }
  } else if (quizForm.value.type === 'multiple') {
    const validOptions = quizForm.value.options.filter(opt => opt.trim() !== '');
    if (validOptions.length < 3) {
      return alert('多選題至少需要輸入三個選項。');
    }
    if (!Array.isArray(quizForm.value.answer) || quizForm.value.answer.length < 2) {
      return alert('多選題請選擇至少兩個正確答案。');
    }
  } else if (quizForm.value.type === 'boolean') {
    if (quizForm.value.answer === null || quizForm.value.answer === undefined) {
      return alert('是非題請選擇正確或錯誤。');
    }
  }

  // 過濾掉空選項，避免儲存不必要的資料
  quizForm.value.options = quizForm.value.options.filter(opt => opt.trim() !== '');
  
  if (editingId.value) {
    const index = quizQuestions.value.findIndex(q => q.id === editingId.value);
    if (index !== -1) {
      quizQuestions.value[index] = {
        ...quizQuestions.value[index],
        ...quizForm.value,
        options: [...quizForm.value.options]
      };
    }
    editingId.value = null;
  } else {
    const newQ = {
      ...quizForm.value,
      id: Date.now(),
      options: [...quizForm.value.options],
      userAnswer: quizForm.value.type === 'multiple' ? [] : null
    };
    quizQuestions.value.push(newQ);
  }
  
  // Reset form
  quizForm.value = { type: 'single', question: '', options: ['', ''], answer: null, explanation: '' };
  showQuizEditor.value = false;
};

const removeQuestion = async (idx) => {
  if (!confirm('確定要刪除此題目嗎？刪除後將自動同步更新學生端的題庫。')) return;
  
  quizQuestions.value.splice(idx, 1);
  
  // 題目刪除後，立即同步到後端資料庫
  isPublishing.value = true;
  try {
    const response = await fetch(DATABASE_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'publishQuiz',
        questions: quizQuestions.value
      })
    });

    playSound('success');
  } catch (error) {
    console.error('同步刪除失敗:', error);
    alert('刪除成功但同步至學生端失敗，請手動點擊「發佈到學生端」按鈕。');
  } finally {
    isPublishing.value = false;
  }
};

// --- Methods ---
const playSound = (type) => {
  const sounds = {
    click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
    alarm: 'https://assets.mixkit.co/active_storage/sfx/2190/2190-preview.mp3',
    warning: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'
  };
  const audio = new Audio(sounds[type]);
  audio.volume = 0.4;
  audio.play().catch(() => {}); // Browsers often block auto-play until interaction
};

const updateTime = () => {
  currentTime.value = new Date();
  if (isCountdownMode.value) {
    const remaining = getExamRemainingSeconds();
    
    // 當時間剛好變為 0 時觸發警報與閃爍
    if (remaining === 0 && remainingSeconds.value > 0) {
      playSound('alarm');
      isExamFlashing.value = true;
    } else if (remaining > 0) {
      isExamFlashing.value = false;
    }

    // 預熱提醒：剩餘 3 分鐘 (180秒) 變橘色
    isExamWarning.value = remaining <= 180 && remaining > 0;

    // 剩餘 5 分鐘 (300秒) 時播放短促提醒
    if (remaining === 300 && remainingSeconds.value > 300) {
      playSound('warning');
    }
    
    remainingSeconds.value = remaining;
  }
};

const toggleCountdown = () => {
  playSound('click');
  isCountdownMode.value = !isCountdownMode.value;
  isExamFlashing.value = false;
  isExamWarning.value = false;
  if (isCountdownMode.value) {
    // Reset countdown based on current exam's end time
    remainingSeconds.value = getExamRemainingSeconds();
    // 如果一切換過去就已經是 0 秒，則啟動閃爍
    if (remainingSeconds.value === 0) {
      isExamFlashing.value = true;
    }
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
    playSound('success');
    // 清空輸入框以方便下一筆輸入
    examSubject.value = '';
  }
};

const removeExam = (index) => {
  examList.value.splice(index, 1);
};

// Interactive Tool Methods
const startDraw = () => {
  if (isDrawing.value) return;
  
  const list = namesInput.value.split(/[\n,， ]+/).filter(n => n.trim() !== '');
  if (list.length === 0) return alert('請先輸入名單');
  
  isDrawing.value = true;
  let iterations = 0;
  const maxIterations = 20;
  
  const interval = setInterval(() => {
    drawnResult.value = list[Math.floor(Math.random() * list.length)];
    iterations++;
    if (iterations >= maxIterations) {
      clearInterval(interval);
      isDrawing.value = false;
      if (excludeWinner.value) {
          playSound('success');
        namesInput.value = list.filter(n => n !== drawnResult.value).join('\n');
      }
    }
  }, 100);
};

const addGroup = () => {
  groups.value.push({ name: `第 ${groups.value.length + 1} 組`, score: 0 });
};

const resetScores = () => {
  if (confirm('確定要將所有分數歸零嗎？')) {
    groups.value.forEach(g => g.score = 0);
  }
};

const updateScore = (index, val) => {
  playSound('click');
  groups.value[index].score += val;
};

const setPresentationTime = (mins) => {
  presentationSeconds.value = mins * 60;
  isTimerFlashing.value = false;
  isTimerWarning.value = false;
  if (isPresentationRunning.value) {
    clearInterval(presentationInterval);
    isPresentationRunning.value = false;
  }
};

const togglePresentationTimer = () => {
  playSound('click');
  if (isPresentationRunning.value) {
    clearInterval(presentationInterval);
  } else {
    presentationInterval = setInterval(() => {
      if (presentationSeconds.value > 0) {
        presentationSeconds.value--;
        // 剩餘 5 分鐘提醒 (300秒)
        if (presentationSeconds.value === 300) {
          playSound('warning');
        }
        // 預熱提醒：剩餘 3 分鐘 (180秒) 變橘色
        isTimerWarning.value = presentationSeconds.value <= 180 && presentationSeconds.value > 0;
      } else {
        clearInterval(presentationInterval);
        playSound('alarm');
        isPresentationRunning.value = false;
        isTimerFlashing.value = true;
        isTimerWarning.value = false;
      }
    }, 1000);
  }
  isPresentationRunning.value = !isPresentationRunning.value;
};

const toggleMusic = (type) => {
  if (activeMusic.value === type) {
    if (bgAudio) bgAudio.pause();
    activeMusic.value = null;
    return;
  }

  if (bgAudio) bgAudio.pause();

  const musicFiles = {
    relax: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    exam: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3',
    focus: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  };

  bgAudio = new Audio(musicFiles[type]);
  bgAudio.loop = (type !== 'exam'); // 鐘聲不循環
  bgAudio.volume = 0.5;
  bgAudio.play().catch(() => {
    alert('請先點擊頁面任意處以允許播放音訊');
    activeMusic.value = null;
  });
  activeMusic.value = type;
};

// Quiz Methods
const publishQuizToStudent = async () => {
  if (quizQuestions.value.length === 0) {
    if (!confirm('目前題庫為空，確定要清空學生端的所有題目嗎？')) return;
  }
  
  isPublishing.value = true;
  playSound('click');
  
  try {
    console.log('準備發送的題目資料：', quizQuestions.value);
    
    const response = await fetch(DATABASE_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'publishQuiz',
        questions: quizQuestions.value
      })
    });

    alert('測驗已成功同步至學生端！');
  } catch (error) {
    console.error('發佈出錯:', error);
    alert(`發佈失敗：${error.message}\n請確認 DATABASE_URL 是否正確，且網路連線正常。`);
  } finally {
    isPublishing.value = false;
  }
};

const fetchStudentResults = async () => {
  try {
    // 從統一的資料庫網址獲取資料
    const response = await fetch(`${DATABASE_URL}?action=getResults&_t=${Date.now()}`);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      // 獲取伺服器端所有的時間戳記，用來檢查後端是否已經完成物理刪除
      const serverTimestamps = new Set(data.map(res => res.timestamp));
      
      // 自動清理：如果本地黑名單中的資料在伺服器端已經消失了，就從黑名單移除
      let cacheChanged = false;
      deletedTimestamps.value.forEach(ts => {
        if (!serverTimestamps.has(ts)) {
          deletedTimestamps.value.delete(ts);
          cacheChanged = true;
        }
      });
      if (cacheChanged) {
        localStorage.setItem('deleted_results_cache', JSON.stringify(Array.from(deletedTimestamps.value)));
      }

      // 過濾掉尚未被後端刪除（但在本地黑名單中）的資料，防止資料「閃回」
      const filteredData = data.filter(res => !deletedTimestamps.value.has(res.timestamp));
      
      studentScores.value = filteredData.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
    }
  } catch (error) {
    console.error('獲取學生成績失敗:', error);
  }
};

const deleteResult = async (timestamp) => {
  if (!confirm('確定要刪除這筆成績紀錄嗎？')) return;
  
  isPublishing.value = true; // 顯示同步狀態
  playSound('click');
  try {
    // 1. 立即加入本地黑名單
    deletedTimestamps.value.add(timestamp);
    
    // 將黑名單同步到 localStorage，確保重新整理頁面後，還沒被後端刪掉的資料不會重新出現
    localStorage.setItem('deleted_results_cache', JSON.stringify(Array.from(deletedTimestamps.value)));

    console.log(`[刪除請求] 嘗試刪除時間戳記: ${timestamp}`);

    // 發送刪除請求到統一的後端
    await fetch(DATABASE_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'deleteResult',
        timestamp: String(timestamp), // 強制轉為字串確保後端比對一致
        sheetName: 'Results' // 明確指定刪除 Results 工作表的資料
      })
    });
    
    // 2. 立即從前端目前的顯示列表中移除
    studentScores.value = studentScores.value.filter(res => res.timestamp !== timestamp);
    playSound('success');
  } catch (error) {
    console.error('刪除失敗:', error);
    alert(`刪除失敗：${error.message}`);
  } finally {
    isPublishing.value = false;
  }
};

let syncInterval = null;
const startSync = () => {
  syncInterval = setInterval(fetchStudentResults, 5000); // 每 5 秒檢查一次學生進度
};

const formatPresentationTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Lifecycle ---
onMounted(() => {
  timerInterval = setInterval(updateTime, 1000);
  startSync();
});

onUnmounted(() => {
  clearInterval(timerInterval);
  clearInterval(presentationInterval);
  if (syncInterval) clearInterval(syncInterval);
  if (bgAudio) bgAudio.pause();
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
      <div class="header-center">
        <nav class="tab-nav">
          <button @click="activeTab = 'exam'; playSound('click')" :class="{ active: activeTab === 'exam' }">
            <ruby v-if="showZhuyin">考試系統<rt>ㄎㄠˇ ㄕˋ ㄒㄧˋ ㄊㄨㄥˇ</rt></ruby>
            <span v-else>考試系統</span>
          </button>
          <button @click="activeTab = 'quiz'; playSound('click')" :class="{ active: activeTab === 'quiz' }">
            <ruby v-if="showZhuyin">測驗卷<rt>ㄘㄜˋ ㄧㄢˋ ㄐㄩㄢˋ</rt></ruby>
            <span v-else>測驗卷</span>
          </button>
          <button @click="activeTab = 'tools'; playSound('click')" :class="{ active: activeTab === 'tools' }">
            <ruby v-if="showZhuyin">互動工具<rt>ㄏㄨˋ ㄉㄨㄥˋ ㄍㄨㄥ ㄐㄩˋ</rt></ruby>
            <span v-else>互動工具</span>
          </button>
        </nav>
      </div>
      <div class="header-right"></div> <!-- Spacer for centering -->
    </header>

    <transition name="fade" mode="out-in">
    <main class="container" v-if="activeTab === 'exam'">
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
        <div class="time-value" :class="{ 'flash': isCountdownMode && isExamFlashing, 'warning-orange': isCountdownMode && isExamWarning }">
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
            <transition-group name="list" tag="tbody">
              <tr v-for="(item, index) in examList" :key="index">
                <td>{{ item.subject }}</td>
                <td>{{ item.startTime }}</td>
                <td>{{ item.endTime }}</td>
                <td>{{ item.invigilator }}</td>
                <td>
                  <button @click="removeExam(index)" class="delete-btn">刪除</button>
                </td>
              </tr>
            </transition-group>
          </table>
        </div>
      </div>
    </main>

    <main class="container" v-else-if="activeTab === 'quiz'">
      <div class="quiz-header dashboard-card">
        <h2>
          <ruby v-if="showZhuyin">數位互動測驗卷<rt>ㄕㄨˋ ㄨㄟˋ ㄏㄨˋ ㄉㄨㄥˋ ㄘㄜˋ ㄧㄢˋ ㄐㄩㄢˋ</rt></ruby>
          <span v-else>數位互動測驗卷</span>
        </h2>
        <div class="quiz-actions-top">
          <button @click="toggleQuizEditor" class="tool-btn-sm">
            {{ showQuizEditor ? (editingId ? '取消編輯' : '關閉編輯器') : '新增題目' }}
          </button>
          <button @click="publishQuizToStudent" class="tool-btn-sm publish-btn" :disabled="isPublishing">
            {{ isPublishing ? '同步中...' : '🚀 發佈到學生端' }}
          </button>
          <a :href="studentSiteUrl" target="_blank" class="student-link-btn">開啟學生端 🔗</a>
        </div>
      </div>

      <!-- Question Editor -->
      <div v-if="showQuizEditor" class="editor-card">
        <h3>{{ editingId ? '編輯題目' : '題庫編輯器' }}</h3>
        <div class="form-group">
          <label>題型：</label>
          <select v-model="quizForm.type" @change="handleTypeChange" class="type-select">
            <option value="single">單選題</option>
            <option value="multiple">多選題</option>
            <option value="boolean">是非題</option>
          </select>
        </div>
        <div class="form-group">
          <label>題目：</label>
          <textarea v-model="quizForm.question" placeholder="請輸入問題內容..." class="q-textarea"></textarea>
        </div>
        
        <!-- Options for Choice Questions -->
        <div v-if="quizForm.type !== 'boolean'" class="options-edit">
          <label>選項 (請勾選正確答案)：</label>
          <div v-for="(opt, idx) in quizForm.options" :key="idx" class="opt-row">
            <input v-if="quizForm.type === 'single'" type="radio" :value="idx" v-model="quizForm.answer">
            <input v-else type="checkbox" :value="idx" v-model="quizForm.answer">
            <input v-model="quizForm.options[idx]" placeholder="選項內容" class="opt-input">
            <button @click="removeOption(idx)" class="delete-btn-sm">✕</button>
          </div>
          <button @click="addOption" class="add-opt-btn">+ 新增選項</button>
        </div>

        <!-- Options for Boolean -->
        <div v-else class="options-edit">
          <label>正確答案：</label>
          <div class="bool-row">
            <label><input type="radio" :value="true" v-model="quizForm.answer"> 正確 (O)</label>
            <label><input type="radio" :value="false" v-model="quizForm.answer"> 錯誤 (X)</label>
          </div>
        </div>

        <div class="form-group">
          <label>解析：</label>
          <input v-model="quizForm.explanation" placeholder="輸入答案解析..." class="explanation-input">
        </div>
        <button @click="addQuestionToQuiz" class="add-btn">{{ editingId ? '更新並儲存題目' : '儲存題目' }}</button>
      </div>

      <!-- Quiz Display -->
      <div class="quiz-list">
        <div v-if="quizQuestions.length === 0" class="empty-state">目前尚無題目，請點擊上方按鈕新增。</div>
        <div v-for="(q, index) in quizQuestions" :key="q.id" class="quiz-card">
          <div class="q-header">
            <span class="q-num">Q{{ index + 1 }}.</span>
            <span class="q-type-label">[{{ q.type === 'single' ? '單選' : q.type === 'multiple' ? '多選' : '是非' }}]</span>
            <div class="q-actions">
              <button @click="editQuestion(index)" class="edit-link">編輯</button>
              <button @click="removeQuestion(index)" class="delete-link">刪除</button>
            </div>
          </div>
          <p class="q-text">{{ q.question }}</p>
          
          <div class="q-options">
            <template v-if="q.type === 'single'">
              <label v-for="(opt, oIdx) in q.options" :key="oIdx" class="opt-label is-disabled">
                <input type="radio" disabled :checked="q.answer === oIdx"> {{ opt }}
              </label>
            </template>
            <template v-if="q.type === 'multiple'">
              <label v-for="(opt, oIdx) in q.options" :key="oIdx" class="opt-label is-disabled">
                <input type="checkbox" disabled :checked="Array.isArray(q.answer) && q.answer.includes(oIdx)"> {{ opt }}
              </label>
            </template>
            <template v-if="q.type === 'boolean'">
              <label class="opt-label is-disabled"><input type="radio" disabled :checked="q.answer === true"> 正確 (O)</label>
              <label class="opt-label is-disabled"><input type="radio" disabled :checked="q.answer === false"> 錯誤 (X)</label>
            </template>
          </div>
        </div>
      </div>

      <!-- Student Results Table -->
      <div class="list-section" style="margin-top: 3rem;">
        <div class="list-card student-results-card">
          <div class="card-header">
            <h3>👨‍🎓 學生作答成績</h3>
            <button @click="fetchStudentResults" class="refresh-btn">🔄 立即刷新</button>
          </div>
          <table class="exam-table">
            <thead>
              <tr>
                <th>學生姓名</th>
                <th>測驗成績</th>
                <th>繳交時間</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(res, idx) in studentScores" :key="idx">
                <td>{{ res.name }}</td>
                <td :class="{'text-success': res.score >= 60, 'text-danger': res.score < 60}">{{ res.score }} 分</td>
                <td>{{ res.timestamp }}</td>
                <td><span class="status-pill">已完成</span></td>
                <td>
                  <button @click="deleteResult(res.timestamp)" class="delete-btn" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;">刪除</button>
                </td>
              </tr>
              <tr v-if="studentScores.length === 0">
                <td colspan="5" class="empty-msg">等待學生繳交中...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <main class="container" v-else-if="activeTab === 'tools'">
      <div class="tools-grid">
        <!-- Random Draw Machine -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">隨機抽籤機<rt>ㄙㄨㄟˊ ㄐㄧ ㄔㄡ ㄑㄧㄢ ㄐㄧ</rt></ruby><span v-else>隨機抽籤機</span></h3>
          <textarea v-model="namesInput" placeholder="請輸入名單（姓名或組別，以換行分隔）" class="name-textarea"></textarea>
          <div class="draw-controls">
            <label><input type="checkbox" v-model="excludeWinner"> 抽中後排除</label>
            <button @click="startDraw" :disabled="isDrawing" class="action-btn">開始抽籤</button>
          </div>
          <div v-if="drawnResult" class="draw-result" :class="{ 'is-drawing': isDrawing }">
            {{ drawnResult }}
          </div>
        </section>

        <!-- Scoreboard -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">小組競賽記分板<rt>ㄒㄧㄠˇ ㄗㄨˇ ㄐㄧㄥˋ ㄙㄞˋ ㄐㄧˋ ㄈㄣ ㄅㄢˇ</rt></ruby><span v-else>小組競賽記分板</span></h3>
          <div class="score-controls">
            <button @click="addGroup" class="tool-btn-sm">+ 新增小組</button>
            <button @click="resetScores" class="tool-btn-sm reset-btn">重設分數</button>
          </div>
          <transition-group name="list" tag="div" class="score-list">
            <div v-for="(group, idx) in groups" :key="idx" class="score-item">
              <div class="score-main">
                <input v-model="group.name" class="group-name-input" />
                <span class="score-val">{{ group.score }}</span>
              </div>
              <div class="score-actions">
                <button @click="updateScore(idx, -1)" class="btn-sub">-1</button>
                <button @click="updateScore(idx, 1)" class="btn-add">+1</button>
                <button @click="updateScore(idx, 5)" class="btn-add-lg">+5</button>
              </div>
            </div>
          </transition-group>
          <div class="ranking-preview">
            <strong>目前領先：</strong> {{ sortedGroups[0]?.name }} ({{ sortedGroups[0]?.score }})
          </div>
        </section>

        <!-- Presentation Timer -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">小組報告計時器<rt>ㄒㄧㄠˇ ㄗㄨˇ ㄅㄠˋ ㄍㄠˋ ㄐㄧˋ ㄕˊ ㄑㄧˋ</rt></ruby><span v-else>小組報告計時器</span></h3>
          <div class="preset-btns">
            <button v-for="t in presentationPresets" :key="t" @click="setPresentationTime(t)" class="tool-btn-sm">
              {{ t }} 分
            </button>
            <button @click="isFullScreenTimer = true" class="tool-btn-sm fs-trigger-btn">
              🗖 全螢幕
            </button>
          </div>
          <div class="presentation-timer-display" :class="{ 'flash': isTimerFlashing, 'warning-orange': isTimerWarning }">
            {{ formatPresentationTime(presentationSeconds) }}
          </div>
          <button @click="togglePresentationTimer" class="action-btn">
            {{ isPresentationRunning ? '停止' : '開始' }}
          </button>
        </section>

        <!-- Music Switcher -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">課堂環境音效<rt>ㄎㄜˋ ㄊㄤˊ ㄏㄨㄢˊ ㄐㄧㄥˋ ㄧㄣ ㄒㄧㄠˋ</rt></ruby><span v-else>課堂環境音效</span></h3>
          <p class="tool-desc">點擊播放背景音樂或提示音</p>
          <div class="music-grid">
            <button @click="toggleMusic('relax')" :class="['music-btn', { 'active': activeMusic === 'relax' }]">🎵 輕音樂</button>
            <button @click="toggleMusic('focus')" :class="['music-btn', { 'active': activeMusic === 'focus' }]">🎧 專注背景</button>
            <button @click="toggleMusic('exam')" :class="['music-btn', { 'active': activeMusic === 'exam' }]">🔔 考試鐘聲</button>
          </div>
        </section>
      </div>

      <!-- Real-time Ranking Table -->
      <div class="ranking-section">
        <div class="list-card">
          <h3 class="ranking-title"><ruby v-if="showZhuyin">即時排行榜<rt>ㄐㄧˊ ㄕˊ ㄆㄞˊ ㄏㄤˊ ㄅㄤˇ</rt></ruby><span v-else>即時排行榜</span></h3>
          <transition-group name="list" tag="div" class="ranking-grid">
            <div v-for="(group, index) in sortedGroups" :key="index" class="rank-card" :class="'rank-' + (index + 1)">
              <div class="rank-badge">
                <span class="rank-num">{{ index + 1 }}</span>
              </div>
              <div class="rank-info">
                <span class="rank-name">{{ group.name }}</span>
              </div>
              <div class="rank-score-pill">
                <span class="score-num">{{ group.score }}</span>
                <span class="unit">pts</span>
              </div>
            </div>
          </transition-group>
        </div>
      </div>
    </main>
    </transition>

    <!-- 全螢幕計時器遮罩 -->
    <transition name="fade">
      <div v-if="isFullScreenTimer" class="fs-timer-overlay" :class="{ 'dark': isDarkMode, 'flash': isTimerFlashing }">
        <button @click="isFullScreenTimer = false" class="fs-close-btn">✕</button>
        <div class="fs-timer-content">
          <div class="fs-timer-value" :class="{ 'flash': isTimerFlashing, 'warning-orange': isTimerWarning }">{{ formatPresentationTime(presentationSeconds) }}</div>
          <button @click="togglePresentationTimer" class="fs-start-btn">
            {{ isPresentationRunning ? '停止' : '開始' }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  font-family: 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  transition: background-color 0.4s ease, color 0.4s ease;
}

.light-mode {
  background-color: #f8f9fa;
  color: #212529;
}

.dark-mode {
  background-color: #121212;
  color: #e9ecef;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 2rem;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.dark-mode .header {
  background: rgba(30, 30, 30, 0.8);
  border-bottom-color: rgba(255,255,255,0.1);
}

.tab-nav {
  display: flex;
  gap: 0.5rem;
}

.tab-nav button {
  padding: 0.6rem 1.2rem;
  border: none;
  background: none;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  color: #adb5bd;
  transition: all 0.3s ease;
}
.tab-nav button.active {
  color: #007bff;
  position: relative;
}
.tab-nav button.active::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 20%;
  width: 60%;
  height: 4px;
  background: #007bff;
  border-radius: 2px;
}

.header-left, .header-right { flex: 1; }
.title { flex: 2; text-align: center; font-size: 1.5rem; margin: 0; }

.nav-button {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-size: 0.95rem;
  box-shadow: 0 4px 6px rgba(0, 123, 255, 0.2);
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.button-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.tool-btn {
  padding: 0.8rem;
  cursor: pointer;
  border: 1px solid rgba(0, 123, 255, 0.3);
  background: white;
  color: inherit;
  border-radius: 12px;
  transition: all 0.3s ease;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.dark-mode .tool-btn { background: #1e1e1e; border-color: #444; }
.tool-btn:hover { 
  background: #007bff; 
  color: white; 
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2);
}

.time-display {
  text-align: center;
  margin: 2rem 0;
  padding: 2rem;
  background: linear-gradient(135deg, #ffffff, #f0f7ff);
  border-radius: 24px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
  border: 1px solid rgba(0, 123, 255, 0.1);
}
.dark-mode .time-display {
  background: linear-gradient(135deg, #1e1e1e, #141e2a);
  border-color: #333;
}
.time-value { 
  font-size: 5rem; 
  font-weight: 800; 
  font-family: 'Courier New', monospace;
  background: linear-gradient(to bottom, #007bff, #0056b3);
  line-height: 1; /* Ensure text fits within its box */
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.info-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.input-card, .display-card { 
  padding: 2rem; 
  background: white;
  border-radius: 16px; 
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
  border: 1px solid #eee;
}
.dark-mode .input-card, .dark-mode .display-card { background: #1e1e1e; border-color: #333; }
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

.add-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #28a745, #218838);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
  margin-top: 1rem;
  box-shadow: 0 4px 10px rgba(40, 167, 69, 0.2);
}
.add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(40, 167, 69, 0.3); }
.add-btn:active { transform: scale(0.98); }

.list-section { margin-top: 2rem; }
.exam-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.exam-table thead th {
  background: #f8f9fa;
  color: #666;
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.5px;
}
.dark-mode .exam-table thead th { background: #2c2c2c; color: #aaa; }
.exam-table th, .exam-table td {
  padding: 1rem;
  text-align: center;
  border-bottom: 1px solid #eee;
}
.dark-mode .exam-table th, .dark-mode .exam-table td { border-color: #333; }

.exam-table tr:hover { background: rgba(0, 123, 255, 0.02); }

.delete-btn {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}
.delete-btn:hover { background-color: #c82333; }

.list-card { 
  background: #fff;
  border: 1px solid #eee; 
  border-radius: 12px; 
  padding: 1.5rem; 
  box-shadow: 0 4px 6px rgba(0,0,0,0.02);
}
.dark-mode .list-card { border-color: #444; }

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.list-enter-active, .list-leave-active { transition: all 0.5s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateX(30px); }
.list-move { transition: transform 0.5s ease; }

@media (max-width: 600px) {
  .time-value { font-size: 2.5rem; }
  .time-display { padding: 2rem 1rem; } /* Adjust padding for smaller screens */
}

/* --- Quiz System Mobile Redesign --- */
.quiz-header {
  text-align: center;
  margin-bottom: 2rem;
}

.quiz-actions-top {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

.score-badge {
  background: #ffc107;
  color: #000;
  padding: 0.5rem 1.2rem;
  border-radius: 20px;
  font-weight: 800;
  box-shadow: 0 4px 10px rgba(255, 193, 7, 0.3);
}

.quiz-card {
  background: white;
  border-radius: 20px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 8px 20px rgba(0,0,0,0.06);
  border: 1px solid #eee;
  transition: transform 0.3s ease;
  position: relative;
  overflow: hidden;
}
.dark-mode .quiz-card { background: #1e1e1e; border-color: #333; }

.q-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.q-num { font-weight: 800; color: #007bff; font-size: 1.2rem; }
.q-type-label { background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; color: #666; }
.dark-mode .q-type-label { background: #333; color: #aaa; }

.q-text {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.q-options {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.opt-label {
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border: 2px solid #f1f3f5;
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}
.dark-mode .opt-label { border-color: #2c2c2c; }

.opt-label:hover:not(.is-disabled) {
  background: #f8f9fa;
  border-color: #dee2e6;
}
.dark-mode .opt-label:hover:not(.is-disabled) { background: #252525; }

.opt-label input { margin-right: 12px; transform: scale(1.2); }

/* 選中狀態樣式 */
.opt-label:has(input:checked) {
  background: rgba(0, 123, 255, 0.05);
  border-color: #007bff;
  color: #007bff;
}

/* 回饋狀態 */
.quiz-card.correct { border-left: 6px solid #28a745; background: #f4fff7; }
.quiz-card.incorrect { border-left: 6px solid #dc3545; background: #fff5f5; }
.dark-mode .quiz-card.correct { background: #142a1a; }
.dark-mode .quiz-card.incorrect { background: #2a1414; }

.q-feedback {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px dashed #ddd;
  font-size: 0.95rem;
}

.submit-quiz-btn {
  display: block;
  width: 100%;
  max-width: 400px;
  margin: 2rem auto;
  padding: 1.2rem;
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  border-radius: 50px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(0, 123, 255, 0.3);
  transition: transform 0.2s;
}
.submit-quiz-btn:hover { transform: translateY(-3px); }

/* 編輯器優化 */
.editor-card {
  background: #fff;
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  border: 2px solid #007bff;
}
.dark-mode .editor-card { background: #1e1e1e; }

.q-textarea {
  width: 100%;
  height: 80px;
  padding: 0.8rem;
  border-radius: 10px;
  border: 1px solid #ddd;
  margin-top: 0.5rem;
}

.opt-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.5rem;
}

/* --- Interactive Tools Enhancements --- */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.tool-card {
  background: rgba(128, 128, 128, 0.05);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.05);
  background: #fff;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}
.dark-mode .tool-card { background: #1e1e1e; border-color: #333; }

.name-textarea {
  width: 100%;
  height: 120px;
  margin: 1rem 0;
  padding: 0.5rem;
  border-radius: 4px;
  resize: none;
}

.draw-result {
  font-size: 2.5rem;
  text-align: center;
  margin-top: 1rem;
  min-height: 4rem;
  color: #007bff;
  font-weight: bold;
}

.is-drawing {
  opacity: 0.6;
  transform: scale(1.1);
  transition: transform 0.1s;
}

.score-list {
  max-height: 300px;
  overflow-y: auto;
  margin: 1rem 0;
}

.score-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 1rem;
}

.group-name-input {
  flex: 1;
  padding: 0.3rem;
  border: none;
  background: transparent;
  border-bottom: 1px solid #ccc;
  color: inherit;
}

.score-actions button {
  padding: 0.2rem 0.5rem;
  margin: 0 2px;
  cursor: pointer;
}

.presentation-timer-display {
  font-size: 3.5rem;
  text-align: center;
  font-family: monospace;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 8px;
}

@keyframes flash-animation {
  0% { background-color: transparent; }
  50% { background-color: rgba(220, 53, 69, 0.4); }
  100% { background-color: transparent; }
}

.flash {
  animation: flash-animation 0.8s infinite !important;
  color: #dc3545 !important;
  -webkit-text-fill-color: #dc3545 !important;
}

.warning-orange {
  color: #fd7e14 !important;
  -webkit-text-fill-color: #fd7e14 !important;
}

.tool-btn-sm.reset-btn { margin-left: 0.5rem; border-color: #dc3545; color: #dc3545; }

/* 全螢幕計時器樣式 */
.fs-timer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: white;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background-color 0.3s;
}
.fs-timer-overlay.dark { background: #121212; color: white; }

.fs-close-btn {
  position: absolute;
  top: 2rem;
  right: 2rem;
  font-size: 2.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.5;
  transition: opacity 0.3s;
}
.fs-close-btn:hover { opacity: 1; }

.fs-timer-content { text-align: center; }
.fs-timer-value {
  font-size: 25vw;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  line-height: 1;
  margin-bottom: 3rem;
}
.fs-start-btn {
  font-size: 2rem;
  padding: 1rem 4rem;
  border-radius: 60px;
  border: 3px solid #007bff;
  background: transparent;
  color: #007bff;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}
.fs-start-btn:hover { background: #007bff; color: white; transform: scale(1.05); }
.dark .fs-start-btn { border-color: #4da3ff; color: #4da3ff; }
.dark .fs-start-btn:hover { background: #4da3ff; color: #121212; }
.fs-trigger-btn { background-color: #6c757d; color: white; border: none; margin-left: 0.5rem; }

.tool-desc { font-size: 0.85rem; color: #666; margin-bottom: 1rem; }
.dark-mode .tool-desc { color: #aaa; }
.music-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.music-btn {
  padding: 0.8rem;
  border: 1px solid #ddd;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: inherit;
  font-weight: 600;
  transition: all 0.3s;
}
.music-btn.active { background: #007bff; color: white; border-color: #007bff; box-shadow: 0 4px 10px rgba(0, 123, 255, 0.3); }
.music-btn:nth-child(3) { grid-column: span 2; }

.publish-btn { background-color: #6610f2; color: white; border: none; }
.publish-btn:hover { background-color: #520dc2; }
.student-link-btn { font-size: 0.8rem; color: #007bff; text-decoration: none; padding: 0.5rem; border: 1px solid #007bff; border-radius: 8px; }
.student-results-card { border-top: 4px solid #6610f2; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.refresh-btn { background: none; border: 1px solid #ddd; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.text-success { color: #28a745; font-weight: bold; }
.text-danger { color: #dc3545; font-weight: bold; }
.status-pill { background: #e3f2fd; color: #0d47a1; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; }
.empty-msg { padding: 2rem !important; color: #999; }
</style>
