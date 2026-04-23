<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// --- State Management ---
const isDarkMode = ref(false);
const activeTab = ref('exam'); // 'exam', 'quiz', or 'tools'
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
let presentationInterval = null;
const presentationPresets = [3, 5, 10]; // minutes

// 4. Digital Quiz System
const isQuizSubmitted = ref(false);
const quizScore = ref(0);
const quizQuestions = ref([]);
const showQuizEditor = ref(false);

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

const addQuestionToQuiz = () => {
  if (!quizForm.value.question.trim()) return alert('請輸入題目');
  
  const newQ = {
    ...quizForm.value,
    id: Date.now(),
    options: [...quizForm.value.options],
    userAnswer: quizForm.value.type === 'multiple' ? [] : null
  };
  
  quizQuestions.value.push(newQ);
  // Reset form
  quizForm.value = { type: 'single', question: '', options: ['', ''], answer: null, explanation: '' };
  showQuizEditor.value = false;
};

const removeQuestion = (idx) => {
  quizQuestions.value.splice(idx, 1);
};

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
  groups.value[index].score += val;
};

const setPresentationTime = (mins) => {
  presentationSeconds.value = mins * 60;
  isTimerFlashing.value = false;
  if (isPresentationRunning.value) {
    clearInterval(presentationInterval);
    isPresentationRunning.value = false;
  }
};

const togglePresentationTimer = () => {
  if (isPresentationRunning.value) {
    clearInterval(presentationInterval);
  } else {
    presentationInterval = setInterval(() => {
      if (presentationSeconds.value > 0) {
        presentationSeconds.value--;
      } else {
        clearInterval(presentationInterval);
        isPresentationRunning.value = false;
        isTimerFlashing.value = true;
      }
    }, 1000);
  }
  isPresentationRunning.value = !isPresentationRunning.value;
};

// Quiz Methods
const submitQuiz = () => {
  let correctCount = 0;
  quizQuestions.value.forEach(q => {
    if (q.type === 'multiple') {
      const isCorrect = Array.isArray(q.userAnswer) && 
                        q.userAnswer.length === q.answer.length &&
                        q.userAnswer.every(val => q.answer.includes(val));
      if (isCorrect) correctCount++;
    } else {
      if (q.userAnswer === q.answer) correctCount++;
    }
  });
  quizScore.value = Math.round((correctCount / quizQuestions.value.length) * 100);
  isQuizSubmitted.value = true;
};

const resetQuiz = () => {
  quizQuestions.value.forEach(q => {
    q.userAnswer = q.type === 'multiple' ? [] : null;
  });
  isQuizSubmitted.value = false;
  quizScore.value = 0;
};

const formatPresentationTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Lifecycle ---
onMounted(() => {
  timerInterval = setInterval(updateTime, 1000);
});

onUnmounted(() => {
  clearInterval(timerInterval);
  clearInterval(presentationInterval);
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
          <button @click="activeTab = 'exam'" :class="{ active: activeTab === 'exam' }">
            <ruby v-if="showZhuyin">考試系統<rt>ㄎㄠˇ ㄕˋ ㄒㄧˋ ㄊㄨㄥˇ</rt></ruby>
            <span v-else>考試系統</span>
          </button>
          <button @click="activeTab = 'quiz'" :class="{ active: activeTab === 'quiz' }">
            <ruby v-if="showZhuyin">測驗卷<rt>ㄘㄜˋ ㄧㄢˋ ㄐㄩㄢˋ</rt></ruby>
            <span v-else>測驗卷</span>
          </button>
          <button @click="activeTab = 'tools'" :class="{ active: activeTab === 'tools' }">
            <ruby v-if="showZhuyin">互動工具<rt>ㄏㄨˋ ㄉㄨㄥˋ ㄍㄨㄥ ㄐㄩˋ</rt></ruby>
            <span v-else>互動工具</span>
          </button>
        </nav>
      </div>
      <div class="header-right"></div> <!-- Spacer for centering -->
    </header>

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

    <main class="container" v-else-if="activeTab === 'quiz'">
      <div class="quiz-header">
        <h2>
          <ruby v-if="showZhuyin">數位互動測驗卷<rt>ㄕㄨˋ ㄨㄟˋ ㄏㄨˋ ㄉㄨㄥˋ ㄘㄜˋ ㄧㄢˋ ㄐㄩㄢˋ</rt></ruby>
          <span v-else>數位互動測驗卷</span>
        </h2>
        <div class="quiz-actions-top">
          <button @click="showQuizEditor = !showQuizEditor" class="tool-btn">
            {{ showQuizEditor ? '關閉編輯器' : '新增題目' }}
          </button>
          <div v-if="isQuizSubmitted" class="score-badge">總分：{{ quizScore }}</div>
        </div>
      </div>

      <!-- Question Editor -->
      <div v-if="showQuizEditor" class="editor-card">
        <h3>題庫編輯器</h3>
        <div class="form-group">
          <label>題型：</label>
          <select v-model="quizForm.type" class="type-select">
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
        <button @click="addQuestionToQuiz" class="add-btn">儲存題目</button>
      </div>

      <!-- Quiz Display -->
      <div class="quiz-list">
        <div v-if="quizQuestions.length === 0" class="empty-state">目前尚無題目，請點擊上方按鈕新增。</div>
        <div v-for="(q, index) in quizQuestions" :key="q.id" class="quiz-card" :class="{ 'correct': isQuizSubmitted && (q.type === 'multiple' ? (q.userAnswer.length === q.answer.length && q.userAnswer.every(val => q.answer.includes(val))) : q.userAnswer === q.answer), 'incorrect': isQuizSubmitted && !(q.type === 'multiple' ? (q.userAnswer.length === q.answer.length && q.userAnswer.every(val => q.answer.includes(val))) : q.userAnswer === q.answer) }">
          <div class="q-header">
            <span class="q-num">Q{{ index + 1 }}.</span>
            <span class="q-type-label">[{{ q.type === 'single' ? '單選' : q.type === 'multiple' ? '多選' : '是非' }}]</span>
            <button v-if="!isQuizSubmitted" @click="removeQuestion(index)" class="delete-link">刪除</button>
          </div>
          <p class="q-text">{{ q.question }}</p>
          
          <div class="q-options">
            <template v-if="q.type === 'single'">
              <label v-for="(opt, oIdx) in q.options" :key="oIdx" class="opt-label">
                <input type="radio" :name="'q'+q.id" :value="oIdx" v-model="q.userAnswer" :disabled="isQuizSubmitted"> {{ opt }}
              </label>
            </template>
            <template v-if="q.type === 'multiple'">
              <label v-for="(opt, oIdx) in q.options" :key="oIdx" class="opt-label">
                <input type="checkbox" :value="oIdx" v-model="q.userAnswer" :disabled="isQuizSubmitted"> {{ opt }}
              </label>
            </template>
            <template v-if="q.type === 'boolean'">
              <label class="opt-label"><input type="radio" :value="true" v-model="q.userAnswer" :disabled="isQuizSubmitted"> 正確 (O)</label>
              <label class="opt-label"><input type="radio" :value="false" v-model="q.userAnswer" :disabled="isQuizSubmitted"> 錯誤 (X)</label>
            </template>
          </div>

          <div v-if="isQuizSubmitted" class="q-feedback">
            <div class="ans-row"><strong>正確答案：</strong> {{ q.type === 'boolean' ? (q.answer ? '正確 (O)' : '錯誤 (X)') : (Array.isArray(q.answer) ? q.answer.map(i => q.options[i]).join(', ') : q.options[q.answer]) }}</div>
            <div class="exp-row"><strong>解析：</strong> {{ q.explanation || '無提供解析。' }}</div>
          </div>
        </div>
      </div>

      <div v-if="quizQuestions.length > 0" class="quiz-footer">
        <button v-if="!isQuizSubmitted" @click="submitQuiz" class="submit-quiz-btn">提交測驗卷</button>
        <button v-else @click="resetQuiz" class="tool-btn">重新作答</button>
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
          <div class="score-list">
            <div v-for="(group, idx) in groups" :key="idx" class="score-item">
              <input v-model="group.name" class="group-name-input" />
              <div class="score-actions">
                <button @click="updateScore(idx, -1)">-1</button>
                <span class="score-val">{{ group.score }}</span>
                <button @click="updateScore(idx, 1)">+1</button>
                <button @click="updateScore(idx, 5)">+5</button>
              </div>
            </div>
          </div>
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
          </div>
          <div class="presentation-timer-display" :class="{ 'flash': isTimerFlashing }">
            {{ formatPresentationTime(presentationSeconds) }}
          </div>
          <button @click="togglePresentationTimer" class="action-btn">
            {{ isPresentationRunning ? '停止' : '開始' }}
          </button>
        </section>
      </div>

      <!-- Real-time Ranking Table -->
      <div class="list-section">
        <div class="list-card">
          <h3><ruby v-if="showZhuyin">即時排行榜<rt>ㄐㄧˊ ㄕˊ ㄆㄞˊ ㄏㄤˊ ㄅㄤˇ</rt></ruby><span v-else>即時排行榜</span></h3>
          <table class="exam-table">
            <thead>
              <tr>
                <th><ruby v-if="showZhuyin">排名<rt>ㄆㄞˊ ㄇㄧㄥˊ</rt></ruby><span v-else>排名</span></th>
                <th><ruby v-if="showZhuyin">組別名稱<rt>ㄗㄨˇ ㄅㄧㄝˊ ㄇㄧㄥˊ ㄔㄥ</rt></ruby><span v-else>組別名稱</span></th>
                <th><ruby v-if="showZhuyin">總分<rt>ㄗㄨˇ ㄈㄣ</rt></ruby><span v-else>總分</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(group, index) in sortedGroups" :key="index">
                <td>{{ index + 1 }}</td>
                <td>{{ group.name }}</td>
                <td>{{ group.score }}</td>
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

.tab-nav {
  display: flex;
  gap: 1rem;
}

.tab-nav button {
  padding: 0.5rem 1.5rem;
  border: none;
  background: none;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  color: #666;
  border-bottom: 3px solid transparent;
}

.tab-nav button.active {
  color: #007bff;
  border-bottom-color: #007bff;
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

/* Interactive Tools Enhancements */
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
  border: 1px solid #ddd;
}
.dark-mode .tool-card { border-color: #444; }

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
  animation: flash-animation 0.8s infinite;
  color: #dc3545;
}

.tool-btn-sm.reset-btn { margin-left: 0.5rem; border-color: #dc3545; color: #dc3545; }
</style>
