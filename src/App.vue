<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';

// --- Directives ---
const vFocusAuto = {
  mounted: (el) => el.focus()
};

// --- State Management ---
const isDarkMode = ref(false);
const activeTab = ref('home'); // 'home', 'exam', 'quiz', 'poll', or 'tools'
const showZhuyin = ref(false);
const isCountdownMode = ref(false);
const isFullScreenTimer = ref(false);
const isExamFlashing = ref(false);
const showQrCodeModal = ref(false); // 新增：控制 QR Code 彈出視窗顯示
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
const drawNamesInput = ref('');
const groupNamesInput = ref('');
const namesList = ref([]);
const drawnResult = ref(null);
const isDrawing = ref(false);
const excludeWinner = ref(false);
const groupSize = ref(3);
const randomGroups = ref([]);

// 2. Scoreboard
const groups = ref([
  { name: '第一組', score: 0, isEditing: false, scoreAnimation: false },
  { name: '第二組', score: 0, isEditing: false, scoreAnimation: false }
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

// --- Real-time Poll State (New) ---
const POLL_DATABASE_URL = 'https://script.google.com/macros/s/AKfycbxgCLOipsnuhxbQmxGi_Wl3ndHESVaxjQ4qc4BPgdWmSZPOlQWnrwdDTE5N34LMaBwGHA/exec';
const pollForm = ref({
  question: '',
  options: ['', ''],
  type: 'poll' // 'poll' (選擇題) 或 'qa' (開放問答)
});
const isPollPublishing = ref(false);

// 從 localStorage 讀取快取，確保重新整理後立即顯示
const pollQuestions = ref(JSON.parse(localStorage.getItem('poll_queue_cache') || '[]')); 
const allPollResults = ref(JSON.parse(localStorage.getItem('poll_results_cache') || '[]'));
const deletedPollIds = ref(new Set(JSON.parse(localStorage.getItem('poll_deleted_ids_cache') || '[]'))); // 持久化黑名單

// 監聽變動並同步至 LocalStorage
watch(pollQuestions, (newVal) => {
  localStorage.setItem('poll_queue_cache', JSON.stringify(newVal));
}, { deep: true });
watch(allPollResults, (newVal) => {
  localStorage.setItem('poll_results_cache', JSON.stringify(newVal));
}, { deep: true });
watch(deletedPollIds, (newVal) => {
  localStorage.setItem('poll_deleted_ids_cache', JSON.stringify(Array.from(newVal)));
}, { deep: true });

// 監聽頁籤切換，當進入「測驗卷」或「反饋與投票」時立即更新最新資料
watch(activeTab, (newTab) => {
  if (newTab === 'quiz') {
    fetchStudentResults();
  } else if (newTab === 'poll') {
    fetchPollStatus();
  }
});

// 監聽考試時間輸入，強制限制範圍 (小時 0-24, 分鐘 0-60)
watch(examStartHour, (val) => {
  if (val === '') return;
  const n = parseInt(val);
  if (n < 0) examStartHour.value = '00';
  else if (n > 24) examStartHour.value = '24';
});
watch(examStartMinute, (val) => {
  if (val === '') return;
  const n = parseInt(val);
  if (n < 0) examStartMinute.value = '00';
  else if (n > 60) examStartMinute.value = '60';
});
watch(examEndHour, (val) => {
  if (val === '') return;
  const n = parseInt(val);
  if (n < 0) examEndHour.value = '00';
  else if (n > 24) examEndHour.value = '24';
});
watch(examEndMinute, (val) => {
  if (val === '') return;
  const n = parseInt(val);
  if (n < 0) examEndMinute.value = '00';
  else if (n > 60) examEndMinute.value = '60';
});

const getPollTotal = (poll) => {
  if (poll.type === 'poll' && poll.votes) {
    return poll.votes.reduce((sum, item) => sum + item.count, 0);
  }
  return poll.responses?.length || 0;
};

const getBarColor = (idx) => {
  const colors = ['#4da3ff', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];
  return colors[idx % colors.length];
};

const presentationPresets = [3, 5, 10]; // minutes

// 4. Digital Quiz System
const isPublishing = ref(false);
const studentScores = ref([]); // 儲存從學生端傳回的成績
const deletedTimestamps = ref(new Set(JSON.parse(localStorage.getItem('deleted_results_cache') || '[]'))); // 新增：用於本地快取刪除的時間戳記，防止資料閃回
const studentSiteUrl = 'https://413730739.github.io/0417-2/';

// --- 資料庫配置 ---
// 此 URL 用於處理所有後端邏輯：包含發布題目、獲取學生成績以及刪除紀錄
const DATABASE_URL = 'https://script.google.com/macros/s/AKfycbxLSLXbOQBjMii0WXi3YNbGLAFA6FxLwsBDhUrLlR942HecqgS19hM-nuDxFeULk9y3gg/exec';

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
    showQuizEditor.value = false; // 只有編輯完成才關閉視窗
  } else {
    const newQ = {
      ...quizForm.value,
      id: Date.now(),
      options: [...quizForm.value.options],
      userAnswer: quizForm.value.type === 'multiple' ? [] : null
    };
    quizQuestions.value.push(newQ);
    // 新增模式下保持視窗開啟，方便「依序加入」
  }
  
  // Reset form
  quizForm.value = { type: 'single', question: '', options: ['', ''], answer: null, explanation: '' };
  playSound('success'); // 播放成功音效提醒已儲存
  
  // 自動同步到後端，確保「教師端沒刪，題目會一直存在」且「新增即同步」
  syncQuizToBackend(true); 
};

const removeQuestion = async (idx) => {
  if (!confirm('確定要刪除此題目嗎？刪除後將自動同步更新學生端的題庫。')) return;
  
  quizQuestions.value.splice(idx, 1);
  // 執行同步：因為後端 GAS 會 clear() 重新寫入，所以本地刪除後同步即達成後端刪除
  syncQuizToBackend(true);
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
    
    // 倒數最後 10 秒：每秒播放滴答聲並啟動閃爍
    if (remaining <= 10 && remaining > 0) {
      if (remaining !== remainingSeconds.value) playSound('click');
      isExamFlashing.value = true;
    } 
    // 當時間剛好變為 0 時觸發長警報
    else if (remaining === 0 && remainingSeconds.value > 0) {
      playSound('alarm');
      isExamFlashing.value = true;
    } else if (remaining > 10) {
      isExamFlashing.value = false;
    }

    // 預熱提醒：剩餘 3 分鐘 (180秒) 變橘色，直到進入最後 10 秒閃爍期
    isExamWarning.value = remaining <= 180 && remaining > 10;

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

// 煙火特效函式：使用 canvas-confetti 實現慶祝效果
const triggerFireworks = async () => {
  try {
    // 透過 ESM 動態載入，無需預先安裝套件
    const { default: confetti } = await import('https://esm.run/canvas-confetti');
    
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);

      const particleCount = 50 * (timeLeft / duration);
      // 從左右兩側隨機噴發
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  } catch (err) {
    console.error('無法載入特效庫:', err);
  }
};

// Interactive Tool Methods
const startDraw = () => {
  if (isDrawing.value) return;
  
  const list = drawNamesInput.value.split(/[\n,， ]+/).filter(n => n.trim() !== '');
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
      triggerFireworks(); // 抽籤結束時觸發煙火
      if (excludeWinner.value) {
          playSound('success');
        drawNamesInput.value = list.filter(n => n !== drawnResult.value).join('\n');
      }
    }
  }, 100);
};

const clearDrawNames = () => {
  if (drawNamesInput.value && !confirm('確定要清空抽籤名單嗎？')) return;
  drawNamesInput.value = '';
  drawnResult.value = null;
};

const clearGroupNames = () => {
  if (groupNamesInput.value && !confirm('確定要清空分組名單嗎？')) return;
  groupNamesInput.value = '';
  randomGroups.value = [];
};

const startGrouping = () => {
  const list = groupNamesInput.value.split(/[\n,， ]+/).filter(n => n.trim() !== '');
  if (list.length === 0) return alert('請先輸入名單');
  if (groupSize.value <= 0) return alert('每組人數必須大於 0');
  
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  const result = [];
  for (let i = 0; i < shuffled.length; i += groupSize.value) {
    result.push(shuffled.slice(i, i + groupSize.value));
  }
  randomGroups.value = result;
  playSound('success');
};

const addGroup = () => {
  groups.value.push({ name: `第 ${groups.value.length + 1} 組`, score: 0, isEditing: false });
};

const resetScores = () => {
  if (confirm('確定要將所有分數歸零嗎？')) {
    groups.value.forEach(g => g.score = 0);
  }
};

const updateScore = (index, val) => {
  playSound('click');
  groups.value[index].score += val;
  if (val > 0) {
    groups.value[index].scoreAnimation = true;
    setTimeout(() => groups.value[index].scoreAnimation = false, 300); // 動畫持續時間
  }
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

        // 倒數最後 10 秒提示：音效與閃爍
        if (presentationSeconds.value <= 10 && presentationSeconds.value > 0) {
          playSound('click');
          isTimerFlashing.value = true;
        }

        // 剩餘 5 分鐘提醒 (300秒)
        if (presentationSeconds.value === 300) {
          playSound('warning');
        }
        // 預熱提醒：剩餘 3 分鐘 (180秒) 變橘色，進入最後 10 秒閃爍期前停止
        isTimerWarning.value = presentationSeconds.value <= 180 && presentationSeconds.value > 10;
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

// --- Quiz Sync Core Logic ---
// 統一處理測驗卷同步，對接 GAS 的 action: 'publishQuiz'
const syncQuizToBackend = async (silent = false) => {
  if (quizQuestions.value.length === 0) {
    if (!silent && !confirm('目前題庫為空，確定要清空學生端的所有題目嗎？')) return;
  }
  
  isPublishing.value = true;
  if (!silent) playSound('click');
  
  try {
    const res = await fetch(DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'publishQuiz',
        questions: quizQuestions.value // 將整個陣列傳送，後端會執行 setValue(JSON.stringify(...))
      })
    });

    if (!res.ok) throw new Error(`伺服器回傳錯誤: ${res.status}`);
    if (!silent) alert('測驗已成功同步至學生端！');
    playSound('success');
  } catch (error) {
    console.error('同步出錯:', error);
    if (!silent) alert(`發佈失敗：${error.message}`);
  } finally {
    isPublishing.value = false;
  }
};

const publishQuizToStudent = () => syncQuizToBackend(false);

// --- Real-time Poll Methods ---
const addPollOption = () => pollForm.value.options.push('');
const removePollOption = (idx) => pollForm.value.options.splice(idx, 1);

const addPollToQueue = () => {
  if (!pollForm.value.question.trim()) return alert('請輸入問題內容');
  
  const validOptions = pollForm.value.options.filter(o => o.trim() !== '');
  if (pollForm.value.type === 'poll' && validOptions.length < 2) {
    return alert('多選題至少需要兩個有效的選項');
  }

  pollQuestions.value.push({
    id: Date.now() + Math.random(),
    question: pollForm.value.question,
    options: pollForm.value.type === 'poll' ? validOptions : [], // 開放式作答不需要固定選項
    type: pollForm.value.type,
    timestamp: new Date().toISOString()
  });

  // 重置表單以便輸入下一題
  pollForm.value.question = '';
  pollForm.value.options = ['', ''];
  playSound('success');
};

// 監聽互動類型切換，若是簡答則不處理選項
watch(() => pollForm.value.type, (newVal) => {
  if (newVal === 'qa') {
    pollForm.value.options = ['', ''];
  }
});

const publishPoll = async () => {
  if (pollQuestions.value.length === 0) {
    if (!pollForm.value.question.trim()) return alert('請先新增題目到列表');
    addPollToQueue();
  }

  isPollPublishing.value = true;
  playSound('click');
  
  try {
    // 1. 取得目前已經在線上的題目定義（從 allPollResults 提取結構）
    const existingPolls = allPollResults.value.map(p => ({
      id: p.id,
      question: p.question,
      // 從現有的 votes 提取選項文字，確保格式正確
      options: p.type === 'poll' ? (p.votes ? p.votes.map(v => v.text) : (p.options || [])) : [],
      type: p.type,
      timestamp: p.timestamp || new Date().toISOString()
    }));

    // 2. 合併現有題目與待發佈的新題目
    const combinedPolls = [...existingPolls, ...pollQuestions.value];

    console.log('[Poll] 正在發佈完整題目清單（含舊題目）...', combinedPolls);

    const res = await fetch(POLL_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'publishPoll',
        poll: combinedPolls, // 改為發送合併後的完整清單
        sheetName: 'Polls' // 明確指定工作表名稱，確保後端能正確寫入
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`伺服器回傳錯誤 (${res.status}): ${errorText.substring(0, 100)}`);
    }

    // 成功發送後，立即在前端顯示該題目（即使後端試算表還沒有投票數據）
    const newResults = pollQuestions.value.map(q => ({
      id: q.id,
      question: q.question,
      type: q.type,
      votes: q.options ? q.options.map(opt => ({ text: opt, count: 0, percent: 0 })) : [],
      responses: []
    }));

    allPollResults.value = [...allPollResults.value, ...newResults];
    pollQuestions.value = []; // 發布成功後清空待發佈列表

    alert('即時互動已成功發佈！請確認學生端是否已更新。');
  } catch (error) {
    console.error('[Poll] 發佈發生異常:', error);
    alert(`發佈失敗：${error.message}\n\n請檢查網路連線，並確認後端 GAS 是否已正確部署為「所有人」並更新至最新版本。`);
  } finally {
    isPollPublishing.value = false;
  }
};

const fetchPollStatus = async () => {
  try {
    const response = await fetch(`${POLL_DATABASE_URL}?action=getPollResults&sheetName=PollResults&_t=${Date.now()}`);
    
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

    // 先讀取為文字，確保是有效的 JSON 格式
    const text = await response.text();
    if (!text || text.startsWith('<!DOCTYPE')) throw new Error('伺服器回傳格式不正確 (可能是 Google 登入頁面或錯誤訊息)');
    const data = JSON.parse(text);

    console.log('[Debug] 接收到的原始投票資料:', data);

    // 預期從 GAS 接收到 { definitions: [...], submissions: [...] } 格式的資料
    const pollDefinitions = data.definitions || [];
    const pollSubmissions = data.submissions || [];

    // 自動清理：如果黑名單中的 ID 在伺服器端已經徹底消失，就從黑名單移除
    const serverIds = new Set(pollDefinitions.map(p => String(p.id)));
    let cacheChanged = false;
    deletedPollIds.value.forEach(id => {
      if (!serverIds.has(id)) {
        deletedPollIds.value.delete(id);
        cacheChanged = true;
      }
    });
    if (cacheChanged) {
      localStorage.setItem('poll_deleted_ids_cache', JSON.stringify(Array.from(deletedPollIds.value)));
    }
    
    // 1. 建立一個 Map，以題目內容為鍵，儲存聚合後的投票結果結構
    const groupedMap = new Map();

    // 初始化每個題目定義的聚合結構
    pollDefinitions.forEach(def => {
      // 基礎過濾：移除本地已刪除的項目
      if (deletedPollIds.value.has(String(def.id))) return;

      const questionKey = (def.question || "").toString().trim();
      groupedMap.set(questionKey, {
        id: def.id,
        question: questionKey,
        type: def.type,
        options: def.options || [], // 保留原始選項，用於多選一投票的計數
        votes: def.type === 'poll' ? def.options.map(opt => ({ text: opt, count: 0, percent: 0 })) : [],
        responses: [] // 用於簡答題或收集原始作答
      });
    });

    // 2. 處理所有學生的作答紀錄，進行聚合
    pollSubmissions.forEach(submission => {
      const questionKey = (submission.questionContent || "").toString().trim();
      const poll = groupedMap.get(questionKey);

      if (poll) {
        if (poll.type === 'poll') {
          const submittedAnswer = String(submission.answer).trim();
          const optionIndex = poll.options.findIndex(opt => String(opt).trim() === submittedAnswer);
          if (optionIndex !== -1) {
            poll.votes[optionIndex].count++;
          }
        } else if (poll.type === 'qa') {
          poll.responses.push({
            答案: submission.answer || "",
            姓名: submission.name || "匿名",
            時間: submission.timestamp || ""
          });
        }
      }
    });

    // 3. 統計票數與處理顯示資料
    const processedPolls = Array.from(groupedMap.values()).map(poll => {
      if (poll.type === 'poll') {
        // 以題目定義中的選項為基礎，確保 0 票也會顯示
        const totalVotes = poll.votes.reduce((sum, v) => sum + v.count, 0);
        
        poll.votes.forEach(v => {
          v.percent = totalVotes > 0 ? ((v.count / totalVotes) * 100).toFixed(1) : 0;
        });
      }
      return poll; // QA 題型直接回傳 responses
    });

    // 排序：將最新的互動（ID 較大/時間較新者）排在最前面，方便管理不斷增加的題目
    allPollResults.value = processedPolls.sort((a, b) => {
      // 確保 id 是數字或可比較的值
      const idA = typeof a.id === 'string' ? parseFloat(a.id) : a.id;
      const idB = typeof b.id === 'string' ? parseFloat(b.id) : b.id;
      return idB - idA;
    });
  } catch (error) {
    console.warn('[Poll] 同步投票資料失敗:', error.message);
  }
};

const deletePollItem = async (pollId) => {
  if (!confirm('確定要刪除這筆互動題目嗎？這將會同步移除後端試算表的紀錄。')) return;
  
  // 1. 立即加入本地黑名單，防止 3 秒一次的自動同步導致資料閃回
  deletedPollIds.value.add(String(pollId));

  try {
    const res = await fetch(POLL_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'deletePoll',
        id: String(pollId)
      })
    });

    // 解析伺服器回傳的 JSON
    const result = await res.json();
    
    if (!res.ok || result.status !== 'success') {
      throw new Error(result.message || `伺服器回傳錯誤 (狀態碼: ${res.status})`);
    }

    // 本地立即過濾移除
    allPollResults.value = allPollResults.value.filter(p => p.id !== pollId);
    playSound('success');
  } catch (error) {
    console.error('刪除失敗:', error);
    alert(`刪除失敗：${error.message}\n請檢查網路連線，並確認後端 GAS 已部署為「所有人」存取。`);
  }
};

const clearPoll = async () => {
  if (!confirm('確定要結束並清空目前的投票嗎？')) return;
  try {
    const res = await fetch(POLL_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'clearPoll' })
    });
    if (!res.ok) throw new Error('重置失敗');
    allPollResults.value = [];
    deletedPollIds.value.clear(); // 清空所有黑名單
    pollQuestions.value = []; // 同步清空待發佈列表，確保資料完全重置
    pollForm.value.question = '';
    alert('投票已重置');
  } catch (e) {
    console.error(e);
  }
};

const fetchStudentResults = async () => {
  try {
    // 從統一的資料庫網址獲取資料
    const response = await fetch(`${DATABASE_URL}?action=getResults&_t=${Date.now()}`);
    const data = await response.json();
    
    console.log('[Debug] 接收到的原始學生練習成績:', data);

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
  if (!confirm('確定要刪除這筆成績紀錄嗎？刪除後將同步移除後端試算表的紀錄。')) return;
  
  isPublishing.value = true; // 顯示同步狀態
  playSound('click');

  try {
    // 1. 立即加入本地黑名單，防止非同步獲取資料時閃回
    deletedTimestamps.value.add(timestamp);
    localStorage.setItem('deleted_results_cache', JSON.stringify(Array.from(deletedTimestamps.value)));

    console.log(`[刪除請求] 準備刪除時間戳記: ${timestamp}`);

    const res = await fetch(DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'deleteResult',
        timestamp: String(timestamp), // 傳送時間戳記供後端比對
        sheetName: 'Results'
      })
    });
    
    // 檢查回傳內容是否為 JSON
    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.error('[刪除] 解析回傳失敗:', text);
      // 若失敗但 HTTP 狀態為 200，可能 GAS 已執行但回傳格式有誤，此時仍維持黑名單
      if (!res.ok) throw new Error('後端服務回傳格式錯誤 (HTML)');
      result = { status: 'success' }; 
    }
    
    if (!res.ok || result.status !== 'success') {
      throw new Error(result.message || `刪除失敗，伺服器回傳: ${res.status}`);
    }

    console.log(`[刪除成功] 時間戳記 ${timestamp} 已從後端試算表移除`);

    // 2. 立即從前端目前的顯示列表中移除
    studentScores.value = studentScores.value.filter(res => res.timestamp !== timestamp);
    playSound('success');
    alert('成績已成功刪除，後端試算表也將同步更新。');
  } catch (error) {
    console.error('[刪除失敗]:', error);
    // 發生嚴重錯誤時，將其從黑名單移除以反映真實狀態
    deletedTimestamps.value.delete(timestamp);
    localStorage.setItem('deleted_results_cache', JSON.stringify(Array.from(deletedTimestamps.value)));
    alert(`刪除失敗：${error.message}\n\n請確認網路連線正常，並檢查後端 GAS 是否已部署為「所有人」存取。`);
  } finally {
    isPublishing.value = false;
  }
};

const getGroupedQaResponses = (responses) => {
  if (!responses || responses.length === 0) return [];
  const total = responses.length;
  const grouped = {};
  responses.forEach(res => {
    console.log('[Debug] 正在處理單筆作答內容:', res);
    // 整合所有可能的作答欄位名稱 (text, answer, value, 答案)
    const val = (res.答案 || res.text || res.answer || res.value || '').toString().trim();
    if (!val) return;
    const key = val;
    if (grouped[key]) {
      grouped[key].count++;
    } else {
      grouped[key] = {
        text: val,
        count: 1,
      };
    }
  });
  return Object.values(grouped)
    .map(item => ({
      ...item,
      percent: ((item.count / total) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);
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
  fetchStudentResults(); // 初始載入立即獲取成績，不用等 5 秒
  startSync();
  fetchPollStatus(); // 頁面載入後立即同步一次，不要等 3 秒
  // 確保在組件掛載時，如果 QR Code 彈窗是開啟的，則禁用滾動
  document.body.style.overflow = showQrCodeModal.value ? 'hidden' : '';

  setInterval(fetchPollStatus, 3000); // 投票每 3 秒同步一次
});

onUnmounted(() => {
  clearInterval(timerInterval);
  clearInterval(presentationInterval);
  if (syncInterval) clearInterval(syncInterval);
  if (bgAudio) bgAudio.pause();
  document.body.style.overflow = ''; // 確保組件卸載時恢復滾動
});

// 監聽 showQrCodeModal 變化，控制 body 滾動
watch(showQrCodeModal, (newVal) => {
  document.body.style.overflow = newVal ? 'hidden' : '';
  if (newVal) playSound('click'); // 開啟時播放音效
});
</script>

<template>
  <div :class="['app-wrapper transition-all duration-500', isDarkMode ? 'dark-mode' : 'light-mode']">
    
    <!-- 首頁登入畫面 -->
    <div v-if="activeTab === 'home'" class="landing-container">
      <div class="landing-bg-circles">
        <div class="circle circle-1"></div>
        <div class="circle circle-2"></div>
      </div>
      <div class="landing-content">
        <div class="logo-wrapper">
          <img src="/0430.png" alt="Logo" class="landing-logo" />
        </div>
        <h1 class="landing-title">智慧課堂小助手</h1>
        <p class="landing-subtitle">全方位教學互動平台，讓學習更有趣、效率更提升</p>
        <button @click="activeTab = 'exam'; playSound('click')" class="enter-btn">
          進入系統
        </button>
      </div>
    </div>

    <template v-else>
    <!-- Header Section -->
    <header class="header">
      <div class="header-left" @click="activeTab = 'home'; playSound('click')">
        <img src="/0430.png" alt="Logo" class="site-logo" />
        <span class="site-title">課堂小助手</span>
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
          <button @click="activeTab = 'poll'; playSound('click')" :class="{ active: activeTab === 'poll' }">
            <ruby v-if="showZhuyin">反饋與投票<rt>ㄈㄢˇ ㄎㄨㄟˋ ㄩˇ ㄊㄡˊ ㄆㄧㄠˋ</rt></ruby>
            <span v-else>反饋與投票</span>
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
              <input v-model="examStartHour" type="number" min="0" max="24" placeholder="時" class="time-input" />
              <span class="time-separator">:</span>
              <input v-model="examStartMinute" type="number" min="0" max="60" placeholder="分" class="time-input" />
            </div>
          </div>
          <div class="form-group">
            <label><ruby v-if="showZhuyin">考試結束時間<rt>ㄎㄠˇ ㄕˋ ㄐㄧㄝˊ ㄕㄨ ㄕˊ ㄐㄧㄢ</rt></ruby><span v-else>考試結束時間</span></label>
            <div class="time-input-group">
              <input v-model="examEndHour" type="number" min="0" max="24" placeholder="時" class="time-input" />
              <span class="time-separator">:</span>
              <input v-model="examEndMinute" type="number" min="0" max="60" placeholder="分" class="time-input" />
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
          <table class="exam-table exam-list-table">
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
                <td data-label="科目">{{ item.subject }}</td>
                <td data-label="開始時間">{{ item.startTime }}</td>
                <td data-label="結束時間">{{ item.endTime }}</td>
                <td data-label="監考">{{ item.invigilator }}</td>
                <td data-label="操作">
                  <button @click="removeExam(index)" class="delete-btn">刪除</button>
                </td>
              </tr>
            </transition-group>
          </table>
        </div>
      </div>
      <div v-else class="empty-msg-card list-section">
        <p class="empty-msg">目前沒有考試項目。</p>
      </div>
    </main>

    <main class="container" v-else-if="activeTab === 'poll'">
      <div class="dashboard-card text-center mb-2">
        <h2>
          <ruby v-if="showZhuyin">📊 課堂反饋與投票系統<rt>📊 ㄎㄜˋ ㄊㄤˊ ㄈㄢˇ ㄎㄨㄟˋ ㄩˇ ㄊㄡˊ ㄆㄧㄠˋ ㄒㄧˋ ㄊㄨㄥˇ</rt></ruby>
          <span v-else>📊 課堂反饋與投票系統</span>
        </h2>
        <p class="tool-desc">發起即時互動，目前共有 <span class="highlight">{{ allPollResults.length }}</span> 個活動記錄。</p>
      </div>

      <div class="info-section">
        <!-- 投票編輯器 -->
        <div class="input-card">
          <h3>
            <ruby v-if="showZhuyin">新增互動題目<rt>ㄒㄧㄣ ㄗㄥ ㄏㄨˋ ㄉㄨㄥˋ ㄊㄧˊ ㄇㄨˋ</rt></ruby>
            <span v-else>新增互動題目</span>
          </h3>
          <div class="form-group">
            <label>
              <ruby v-if="showZhuyin">互動類型：<rt>ㄏㄨˋ ㄉㄨㄥˋ ㄌㄟˋ ㄒㄧㄥˊ ：</rt></ruby>
              <span v-else>互動類型：</span>
            </label>
            <select v-model="pollForm.type" class="type-select">
              <option value="poll">多選一投票 (單選)</option>
              <option value="qa">開放式簡答</option>
            </select>
          </div>
          <p v-if="pollForm.type === 'qa'" class="tool-desc" style="color: #6610f2; margin-top: -0.5rem;">💡 簡答模式下，學生可自由輸入文字，無需設定標準答案。</p>
          <div class="form-group">
            <label>
              <ruby v-if="showZhuyin">問題：<rt>ㄨㄣˋ ㄊㄧˊ ：</rt></ruby>
              <span v-else>問題：</span>
            </label>
            <textarea v-model="pollForm.question" placeholder="例如：這題的答案你認為是？" class="q-textarea"></textarea>
          </div>
          
          <div v-if="pollForm.type === 'poll'" class="options-edit">
            <label>
              <ruby v-if="showZhuyin">投票選項：<rt>ㄊㄡˊ ㄆㄧㄠˋ ㄒㄩㄢˇ ㄒㄧㄤˋ ：</rt></ruby>
              <span v-else>投票選項：</span>
            </label>
            <div v-for="(opt, idx) in pollForm.options" :key="idx" class="opt-row">
              <span class="q-num">{{ String.fromCharCode(65 + idx) }}.</span>
              <input v-model="pollForm.options[idx]" placeholder="選項內容" class="opt-input">
              <button @click="removePollOption(idx)" class="delete-btn-sm">✕</button>
            </div>
            <button @click="addPollOption" class="add-opt-btn" style="margin-bottom: 1rem;">
              <ruby v-if="showZhuyin">+ 新增選項<rt>ㄒㄧㄣ ㄗㄥ ㄒㄩㄢˇ ㄒㄧㄤˋ</rt></ruby>
              <span v-else>+ 新增選項</span>
            </button>
          </div>

          <button @click="addPollToQueue" class="add-btn w-full">
            <ruby v-if="showZhuyin">➕ 加入發佈列表<rt>ㄐㄧㄚ ㄖㄨˋ ㄈㄚ ㄅㄨˋ ㄌㄧㄝˋ ㄅㄧㄠˇ</rt></ruby>
            <span v-else>➕ 加入發佈列表</span>
          </button>

          <!-- 待發佈題目預覽 -->
          <div v-if="pollQuestions.length > 0" class="mt-2" style="border-top: 1px solid #eee; padding-top: 1rem;">
            <h4 class="mb-1" style="font-size: 1rem;">待發佈列表 ({{ pollQuestions.length }})</h4>
            <div v-for="(q, idx) in pollQuestions" :key="q.id" class="qa-bubble" style="font-size: 0.85rem; padding: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
               <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">{{ idx + 1 }}. {{ q.question }}</span>
               <button @click="pollQuestions.splice(idx, 1)" class="delete-link" style="color: #dc3545; font-size: 0.75rem;">移除</button>
            </div>
          </div>

          <div class="button-group-vertical">
            <button @click="publishPoll" class="publish-btn action-btn w-full" :disabled="isPollPublishing">
              <template v-if="showZhuyin">
                <ruby v-if="isPollPublishing">發佈中...<rt>ㄈㄚ ㄅㄨˋ ㄓㄨㄥ</rt></ruby>
                <ruby v-else>🚀 一次發佈所有題目<rt>🚀 ㄧ ㄘˋ ㄈㄚ ㄅㄨˋ ㄙㄨㄛˇ ㄧㄡˇ ㄊㄧˊ ㄇㄨˋ</rt></ruby>
              </template>
              <template v-else>
                {{ isPollPublishing ? '發佈中...' : '🚀 一次發佈所有題目' }}
              </template>
            </button>
            <button @click="clearPoll" class="delete-btn w-full">
              <ruby v-if="showZhuyin">清空當前資料<rt>ㄑㄧㄥ ㄎㄨㄥ ㄉㄤ ㄑㄧㄢˊ ㄗ ㄌㄧㄠˋ</rt></ruby>
              <span v-else>清空當前資料</span>
            </button>
          </div>
        </div>

        <!-- 即時統計結果 -->
        <div class="display-card">
          <h3>
            <ruby v-if="showZhuyin">📈 投票統計結果<rt>📈 ㄊㄡˊ ㄆㄧㄠˋ ㄊㄨㄥˇ ㄐㄧˋ ㄐㄧㄝˊ ㄍㄨㄛˇ</rt></ruby>
            <span v-else>📈 投票統計結果</span>
          </h3>
          <div v-if="allPollResults.length === 0 || allPollResults.every(p => p.type !== 'poll')" class="empty-msg">尚未發佈投票或目前無統計資料...</div>
          <div v-for="poll in allPollResults.filter(p => p.type === 'poll')" :key="poll.id" class="poll-result-item mb-2">
            <div class="q-header">
              <h4 class="poll-question-title">🚀 {{ poll.question }}</h4>
              <button @click="deletePollItem(poll.id)" class="delete-link">刪除題目</button>
            </div>
            <div class="poll-meta">總計回覆：<span class="highlight">{{ getPollTotal(poll) }}</span> 份</div>
            
            <div v-if="poll.type === 'poll'" class="poll-chart">
              <div v-for="(data, idx) in poll.votes" :key="idx" class="chart-item">
                <div class="chart-label">
                  <span>{{ data.text }}</span>
                  <span class="vote-count">{{ data.count }} 票 ({{ data.percent }}%)</span>
                </div>
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill" :style="{ 
                    width: data.percent + '%',
                    backgroundColor: getBarColor(idx),
                    backgroundImage: 'none'
                  }"></div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="mt-2 text-center" style="font-size: 0.8rem; opacity: 0.6;">
            每 3 秒自動同步數據
          </div>
        </div>
      </div>
      
      <div class="list-section">
        <div class="list-card">
          <h3>
            <ruby v-if="showZhuyin">💬 開放式回答回饋<rt>💬 ㄎㄞ ㄈㄤˋ ㄕˋ ㄏㄨㄟˊ ㄉㄚˊ ㄏㄨㄟˊ ㄎㄨㄟˋ</rt></ruby>
            <span v-else>💬 開放式回答回饋</span>
          </h3>
          <div v-if="allPollResults.filter(p => p.type === 'qa').length === 0" class="empty-msg">目前尚無簡答回饋資料。</div>
          <div v-for="poll in allPollResults.filter(p => p.type === 'qa')" :key="poll.id" class="mb-2">
            <div class="q-header">
              <h4 class="poll-question-title" style="color: #6610f2;">📌 {{ poll.question }} ({{ getPollTotal(poll) }} 份回答)</h4>
              <button @click="deletePollItem(poll.id)" class="delete-link">刪除題目</button>
            </div> 
            <div class="qa-results">
              <div v-if="!poll.responses || poll.responses.length === 0" class="empty-msg">等待大家的回答中...</div> 
              <div v-else> 
                <div v-for="(item, idx) in getGroupedQaResponses(poll.responses)" :key="idx" class="chart-item" style="background: rgba(102, 16, 242, 0.03); padding: 10px; border-radius: 12px; margin-bottom: 8px;">
                  <div class="chart-label">
                    <span>{{ item.text }}</span>
                    <span class="vote-count">{{ item.count }} 票 ({{ item.percent }}%)</span>
                  </div>
                  <div class="chart-bar-bg">
                    <div class="chart-bar-fill" :style="{ 
                      width: item.percent + '%',
                      backgroundColor: getBarColor(idx + 4), 
                      backgroundImage: 'none'
                    }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          <button @click="showQrCodeModal = true" class="student-link-btn">
            學生端 QRCODE
          </button>
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
          <template v-if="studentScores.length > 0">
            <table class="exam-table student-scores-table">
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
                  <td data-label="學生姓名">{{ res.name }}</td>
                  <td data-label="測驗成績" :class="{'text-success': res.score >= 60, 'text-danger': res.score < 60}">{{ res.score }} 分</td>
                  <td data-label="繳交時間">{{ res.timestamp }}</td>
                  <td data-label="狀態"><span class="status-pill">已完成</span></td>
                  <td data-label="操作">
                    <button @click="deleteResult(res.timestamp)" class="delete-btn-sm">刪除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
          <div v-else class="empty-msg-card">
            <p class="empty-msg">等待學生繳交中...</p>
          </div>
        </div>
      </div>
    </main>

    <main class="container" v-else-if="activeTab === 'tools'">
      <div class="tools-grid">
        <!-- Random Draw Machine -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">隨機抽籤機<rt>ㄙㄨㄟˊ ㄐㄧ ㄔㄡ ㄑㄧㄢ ㄐㄧ</rt></ruby><span v-else>隨機抽籤機</span></h3>
          <textarea v-model="drawNamesInput" placeholder="請輸入抽籤名單（換行分隔）" class="name-textarea"></textarea>
          <div class="draw-controls">
            <label><input type="checkbox" v-model="excludeWinner"> 抽中後排除</label>
            <button @click="clearDrawNames" class="tool-btn-sm reset-btn">清空名單</button>
            <button @click="startDraw" :disabled="isDrawing" class="action-btn">開始抽籤</button>
          </div>
          <div v-if="drawnResult" class="draw-result" :class="{ 'is-drawing': isDrawing }">
            {{ drawnResult }}
          </div>
        </section>

        <!-- Grouping Machine -->
        <section class="tool-card">
          <h3><ruby v-if="showZhuyin">隨機分組機<rt>ㄙㄨㄟˊ ㄐㄧ ㄈㄣ ㄗㄨˇ ㄐㄧ</rt></ruby><span v-else>隨機分組機</span></h3>
          <textarea v-model="groupNamesInput" placeholder="請輸入分組名單（換行分隔）" class="name-textarea"></textarea>
          <div class="group-controls">
            <div class="form-group inline">
              <label>每組人數：</label>
              <input v-model.number="groupSize" type="number" min="1" class="group-size-input" />
            </div>
            <button @click="clearGroupNames" class="tool-btn-sm reset-btn">清空名單</button>
            <button @click="startGrouping" class="action-btn">開始分組</button>
          </div>
          <div v-if="randomGroups.length > 0" class="group-results">
            <div v-for="(group, gIdx) in randomGroups" :key="gIdx" class="group-item">
              <strong>第 {{ gIdx + 1 }} 組：</strong> {{ group.join('、') }}
            </div>
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

      <!-- Scoreboard Section (Moved and Expanded) -->
      <div class="ranking-section" style="margin-top: 2rem; margin-bottom: 2.5rem;">
        <div class="list-card">
          <div class="card-header">
            <h3><ruby v-if="showZhuyin">小組競賽計分板<rt>ㄒㄧㄠˇ ㄗㄨˇ ㄐㄧㄥˋ ㄙㄞˋ ㄐㄧˋ ㄈㄣ ㄅㄢˇ</rt></ruby><span v-else>小組競賽記分板</span></h3>
            <div class="score-controls">
              <button @click="addGroup" class="tool-btn-sm">+ 新增小組</button>
              <button @click="resetScores" class="tool-btn-sm reset-btn">重設分數</button>
            </div>
          </div>
          <transition-group name="list" tag="div" class="score-list">
            <div v-for="(group, idx) in groups" :key="idx" class="score-item rank-card">
              <div class="score-main" style="display: flex; align-items: center; flex: 1; gap: 1.5rem; margin-right: 3rem;">
                <input 
                  v-if="group.isEditing" 
                  v-model="group.name" 
                  class="group-name-input" 
                  @blur="group.isEditing = false"
                  @keyup.enter="group.isEditing = false"
                  v-focus-auto
                />
                <span 
                  v-else 
                  class="rank-name" 
                  @click="group.isEditing = true"
                  style="cursor: pointer;"
                >
                  {{ group.name }} ✎
                </span>
                <div class="rank-score-pill">
                  <span class="score-num" :class="{ 'score-jump': group.scoreAnimation }">{{ group.score }}</span>
                  <span class="unit">pts</span>
                </div>
              </div>
              <div class="score-actions">
                <button @click="updateScore(idx, -1)" class="btn-sub">-1</button>
                <button @click="updateScore(idx, 1)" class="btn-add">+1</button>
                <button @click="updateScore(idx, 5)" class="btn-add-lg">+5</button>
              </div>
            </div>
          </transition-group>
        </div>
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
    </template>

    <!-- QR Code 彈出視窗 -->
    <transition name="fade">
      <div v-if="showQrCodeModal" class="qr-modal-overlay" @click.self="showQrCodeModal = false">
        <div class="qr-modal-content">
          <button class="qr-modal-close-btn" @click="showQrCodeModal = false">✕</button>
          <h3 class="qr-modal-title">掃描 QR Code 進入學生端</h3>
          <img src="/0430-2.png" alt="Student Site QR Code" class="qr-code-image" />
          <p class="qr-modal-description">請學生使用手機掃描上方 QR Code 即可進入測驗頁面。</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.landing-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.dark-mode .landing-container {
  background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
}

/* 背景裝飾圓圈 */
.landing-bg-circles .circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: 0;
  opacity: 0.4;
}

.circle-1 {
  width: 400px;
  height: 400px;
  background: #4f46e5;
  top: -100px;
  right: -100px;
  animation: float 10s infinite alternate;
}

.circle-2 {
  width: 300px;
  height: 300px;
  background: #8b5cf6;
  bottom: -50px;
  left: -50px;
  animation: float 8s infinite alternate-reverse;
}

.landing-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 800px;
  padding: 2rem;
  animation: fadeIn 0.8s ease-out;
}

.logo-wrapper {
  margin-bottom: 1rem;
  transition: transform 0.3s ease;
}

.logo-wrapper:hover {
  transform: scale(1.05);
}

.landing-logo {
  height: 120px;
  width: auto;
  filter: drop-shadow(0 10px 15px rgba(0,0,0,0.1));
}

.landing-title {
  font-size: 3.5rem;
  font-weight: 800;
  margin: 1rem 0 1.5rem;
  line-height: 1.3;
  padding: 0.5rem 0;
  background: linear-gradient(90deg, #4f46e5, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -1px;
}

.landing-subtitle {
  font-size: 1.4rem;
  color: #64748b;
  margin-bottom: 2.5rem;
  font-weight: 500;
}

.dark-mode .landing-subtitle {
  color: #94a3b8;
}

.image-wrapper {
  margin-bottom: 3rem;
  perspective: 1000px;
}

.landing-image {
  max-width: 90%;
  max-height: 35vh;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: floatImage 6s ease-in-out infinite;
  border: 8px solid rgba(255, 255, 255, 0.8);
}

.dark-mode .landing-image {
  border-color: rgba(255, 255, 255, 0.1);
}

@keyframes floatImage {
  0%, 100% { transform: translateY(0) rotateX(0); }
  50% { transform: translateY(-20px) rotateX(2deg); }
}

@keyframes float {
  0% { transform: translate(0, 0); }
  100% { transform: translate(30px, 30px); }
}

.enter-btn {
  padding: 1.2rem 4rem;
  font-size: 1.8rem;
  background: #4f46e5;
  background: linear-gradient(90deg, #4f46e5 0%, #8b5cf6 50%, #4f46e5 100%);
  background-size: 200% 100%;
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3);
  transition: all 0.3s ease;
  transition: all 0.4s ease, background-position 0.6s ease;
  position: relative; /* 為偽元素定位 */
  overflow: hidden; /* 隱藏超出按鈕範圍的掃光 */
}

.enter-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -75%; /* 初始位置在按鈕左側外部 */
  width: 50%;
  height: 100%;
  background: rgba(255, 255, 255, 0.3); /* 掃光顏色 */
  transform: skewX(-20deg); /* 傾斜效果 */
  transition: transform 0.6s ease-in-out; /* 掃光動畫 */
  z-index: 1;
}

.enter-btn:hover {
  /* 掃光效果 */
  transform: translateY(-5px) scale(1.05);
  background: #4338ca;
  box-shadow: 0 15px 30px rgba(79, 70, 229, 0.4);
}

.enter-btn:hover::before {
  transform: translateX(200%) skewX(-20deg); /* 掃光從左到右移動 */
  background-position: -100% 0; /* 懸停時移動背景位置 */
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.app-wrapper {
  min-height: 100vh;
  font-family: 'Inter', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  transition: background-color 0.4s ease, color 0.4s ease;
}

.light-mode {
  background-color: #f8fafc;
  color: #1e293b;
}

.dark-mode {
  background-color: #1a202c;
  color: #f1f5f9;
}
/* 確保所有標題在暗黑模式下都是白色 */
.dark-mode h1,
.dark-mode h2,
.dark-mode h3 {
  color: #f8fafc;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 2rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}
.dark-mode .header {
  background: rgba(26, 32, 44, 0.9);
  border-bottom: 1px solid rgba(74, 85, 104, 0.3);
}

.header-left {
  display: flex;
  align-items: center;
  cursor: pointer; /* Add this to indicate it's clickable */
  gap: 12px;
}

.site-logo {
  height: 60px;
  width: auto;
  object-fit: contain;
}

.site-title {
  font-size: 1.8rem; /* 調整字體大小以符合圖片視覺效果 */
  font-weight: bold; /* 加粗字體 */
  color: #34495e; /* 選擇一個與圖片顏色相近的深色 */
  white-space: nowrap; /* 防止文字換行 */
}

.dark-mode .site-title {
  color: #ecf0f1; /* 暗黑模式下的文字顏色 */
}

@media (max-width: 768px) {
  .site-logo {
    height: 45px; /* 在手機版上縮小 */
  }
}

.tab-nav {
  display: flex;
  gap: 0.8rem;
}

.tab-nav button {
  padding: 0.6rem 1.2rem;
  border: none;
  background: none;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  color: #64748b;
  transition: all 0.3s ease;
}
.tab-nav button.active {
  color: #4f46e5;
  position: relative;
}
.tab-nav button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 20%;
  width: 60%;
  height: 3px;
  background: #4f46e5;
  border-radius: 99px;
}

.header-left, .header-right { flex: 1; }
.title { flex: 2; text-align: center; font-size: 1.5rem; margin: 0; }

.nav-button {
  background: #007bff;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 12px;
  text-decoration: none;
  font-size: 1rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.2);
  transition: all 0.2s ease; /* Keep transition for hover effects */
  display: inline-flex;
  align-items: center;
}
.nav-button:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3); }

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.button-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.8rem;
  margin-bottom: 2rem;
}

.tool-btn {
  padding: 0.6rem 1rem;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: white;
  color: #475569;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.dark-mode .tool-btn { background: #2d3748; border-color: #4a5568; color: #e2e8f0; }
.tool-btn:hover { 
  background: #f1f5f9;
  border-color: #4f46e5;
  color: #4f46e5;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.tool-btn-sm {
  padding: 0.3rem 0.6rem;
  border-radius: 10px;
  border: 1px solid #dee2e6;
  background: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease; /* Keep transition for hover effects */
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); /* Keep shadow */
}
.dark-mode .tool-btn-sm { background: #374151; border-color: #4b5563; color: #f3f4f6; }
.tool-btn-sm:hover { border-color: #007bff; color: #007bff; transform: scale(1.05); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); } /* Keep hover effects */

.time-display {
  text-align: center;
  margin: 2rem 0;
  padding: 2rem;
  background: white;
  border-radius: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0,0,0,0.05);
}
.dark-mode .time-display { background: #2d3748; border-color: rgba(74, 85, 104, 0.5); }

.time-value { 
  font-size: 5.5rem; 
  font-weight: 800; 
  font-family: 'Courier New', monospace;
  color: #4f46e5;
  line-height: 1;
  letter-spacing: -2px;
}
.dark-mode .time-value { color: #818cf8; }

.info-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.input-card, .display-card { 
  padding: 2rem; 
  background: white;
  border-radius: 24px; 
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border: 1px solid rgba(0,0,0,0.05);
  color: inherit;
}
.dark-mode .input-card, .dark-mode .display-card { background: #2d3748; border-color: rgba(74, 85, 104, 0.5); color: #e2e8f0; }
.form-group { margin-bottom: 1rem; }

.form-group label { 
  display: block; 
  margin-bottom: 0.5rem; 
  font-weight: bold;
}

.form-group input { 
  width: 100%; 
  box-sizing: border-box;
  padding: 0.8rem 1rem; 
  border: 1px solid #e2e8f0; 
  border-radius: 12px; 
  background-color: #fff;
  color: #1e293b;
  transition: all 0.3s ease;
  max-width: 100%; /* 確保輸入框不會溢出 */
  outline: none;
}
.form-group input[type="number"]::-webkit-outer-spin-button,
.form-group input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.form-group input[type="number"] {
  -moz-appearance: textfield; /* Firefox */
}
.form-group input:focus { border-color: #007bff; box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1); }
.dark-mode .form-group input { background-color: #2d3748; border-color: #4a5568; color: #e2e8f0; }

.time-input-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
}

.time-input {
  width: 100px !important;
  padding: 0.8rem !important;
  text-align: center;
  border-radius: 12px !important;
}

.time-separator {
  font-size: 1.2rem;
  font-weight: bold;
}

.add-btn {
  width: 100%;
  padding: 1rem;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  border-radius: 14px;
  box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
  transition: all 0.2s ease;
}
.dark-mode .add-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
.add-btn:hover { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(79, 70, 229, 0.4); }
.add-btn:active { transform: scale(0.98); }

.list-section { margin-top: 2rem; }
.exam-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  color: inherit;
}
.exam-table thead th {
  background: rgba(128, 128, 128, 0.1);
  color: inherit;
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.5px;
}
.exam-table th, .exam-table td {
  padding: 1rem;
  text-align: center;
  border-bottom: 1px solid #eee;
}
.dark-mode .exam-table th, .dark-mode .exam-table td { border-color: #4a5568; }

.exam-table tr:hover { background: rgba(0, 123, 255, 0.02); }
.dark-mode .exam-table tr:hover { background: rgba(74, 85, 104, 0.15); }

.delete-btn {
  /* 確保 delete-btn-sm 的樣式不會被 delete-btn 覆蓋 */
  /* 這裡的樣式是針對大尺寸按鈕的，小尺寸按鈕使用 delete-btn-sm */
  /* 移除 style 屬性中的 padding, font-size, border-radius，改用 class */
  /* padding: 0.3rem 0.7rem; font-size: 0.8rem; border-radius: 8px; */
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 12px; /* Unified border-radius */
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.15);
}
.dark-mode .delete-btn { background-color: #ef4444; }
.delete-btn:hover { background-color: #c82333; transform: scale(1.05); box-shadow: 0 4px 12px rgba(220, 53, 69, 0.25); }

/* 統一所有編輯器輸入框與選單樣式 */
.type-select, .q-textarea, .opt-input, .explanation-input, .name-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.8rem 1rem;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  background-color: #fff;
  color: inherit;
  font-size: 1rem;
  transition: all 0.3s ease;
  max-width: 100%; /* 確保輸入框不會溢出 */
  outline: none;
}
.type-select:focus, .q-textarea:focus, .opt-input:focus, .explanation-input:focus, .name-textarea:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}
.dark-mode .type-select, .dark-mode .q-textarea, .dark-mode .opt-input, .dark-mode .explanation-input, .dark-mode .name-textarea {
  background-color: #2d3748;
  border-color: #4a5568;
  color: #e2e8f0;
}

.list-card { 
  background: white;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 24px; 
  padding: 1.5rem; 
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
.dark-mode .list-card { border-color: rgba(74, 85, 104, 0.5); background: #2d3748; color: #e2e8f0; }

/* Transitions */
.delete-btn-sm {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 0.2rem 0.5rem;
  border-radius: 8px; /* Unified border-radius for small buttons */
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 1px 4px rgba(220, 53, 69, 0.1);
}
.dark-mode .delete-btn-sm { background-color: #f87171; color: #fff; }
.delete-btn-sm:hover { transform: scale(1.05); box-shadow: 0 2px 6px rgba(220, 53, 69, 0.15); }

.list-enter-active, .list-leave-active { transition: all 0.5s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateX(30px); }
.list-move { transition: transform 0.5s ease; }

/* --- Tool Sub-sections --- */
.tool-sub-section { margin-top: 1rem; }
.tool-divider {
  margin: 1.5rem 0;
  border: none;
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}
.draw-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  row-gap: 0.8rem;
}
.group-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
  row-gap: 0.8rem;
}
.form-group.inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0;
}
.group-size-input {
  width: 80px !important;
  padding: 0.5rem !important;
  text-align: center;
}
.group-results {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(128, 128, 128, 0.05);
  border-radius: 12px;
  max-height: 200px;
  overflow-y: auto;
  text-align: left;
}
.group-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  font-size: 0.95rem;
}
.group-item:last-child { border-bottom: none; }
.dark-mode .group-results { background: #374151; border: 1px solid #4a5568; }

@media (max-width: 600px) {
  .group-controls {
    flex-direction: column;
    align-items: stretch;
  }
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
  gap: 0.8rem;
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
  border-radius: 24px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  border: 1px solid rgba(0,0,0,0.05);
  transition: transform 0.3s ease;
  position: relative;
  overflow: hidden;
  color: inherit;
}
.dark-mode .quiz-card { background: #2d3748; border-color: rgba(74, 85, 104, 0.5); color: #e2e8f0; }

.q-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.q-actions {
  display: flex;
  gap: 0.8rem;
}

.q-num { font-weight: 800; color: #007bff; font-size: 1.2rem; }
.q-type-label { background: rgba(128,128,128,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; color: inherit; }

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
.dark-mode .opt-label { border-color: #4a5568; background-color: #2d3748; color: #e2e8f0; }

.opt-label:hover:not(.is-disabled) {
  background: #f8f9fa;
  border-color: #dee2e6;
}
.dark-mode .opt-label:hover:not(.is-disabled) { background: #3f4a59; border-color: #5a6b7f; }

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
  background: #007bff;
  color: white;
  padding: 1rem 2rem;
  border-radius: 12px;
  font-weight: 600;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2); /* 統一陰影 */
  transition: all 0.2s ease;
  cursor: pointer;
}
.submit-quiz-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0, 123, 255, 0.3); } /* 統一懸停效果 */

/* 編輯器優化 */
.editor-card {
  background: transparent;
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  border: 2px solid #007bff;
  color: inherit;
}
.dark-mode .editor-card { background: #2d3748; color: #e2e8f0; border-color: #007bff; }

.q-textarea { height: 100px; margin-top: 0.5rem; resize: vertical; }

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
  background: transparent;
  padding: 1.5rem;
  border-radius: 20px;
  border: 2px solid #eee;
  box-shadow: 0 10px 25px rgba(0,0,0,0.05);
  color: inherit;
}.dark-mode .tool-card { background: #2d3748; border-color: #4a5568; color: #e2e8f0; }

.name-textarea { height: 120px; margin: 1rem 0; resize: vertical; }

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
  display: flex;
  flex-direction: column;
  margin: 1rem 0;
}

.score-controls {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.score-main {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
}

.score-val {
  font-size: 1.8rem; /* 讓分數更顯眼 */
  font-weight: 900;
  min-width: 50px; /* 確保分數顯示區域不會過度縮小 */
  text-align: right;
  transition: transform 0.3s ease-out, color 0.3s ease-out; /* 平滑過渡 */
}
.dark-mode .score-val {
  color: #60a5fa; /* 暗黑模式下使用較亮的藍色 */
}

@keyframes score-jump {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); color: #10b981; } /* 增加時放大並變綠色 */
  100% { transform: scale(1); }
}

.score-val.score-jump {
  animation: score-jump 0.3s ease-out;
}

.group-name-input {
  flex: 1;
  box-sizing: border-box;
  padding: 0.3rem;
  border: 2px solid #007bff;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  transition: all 0.3s ease;
  max-width: 100%;
}

.group-name-display {
  flex: 1;
  box-sizing: border-box;
  padding: 0.3rem;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  max-width: 100%; /* 確保輸入框不會溢出 */
  font-weight: 600;
}
.group-name-display:hover {
  background: rgba(0, 123, 255, 0.05);
  border-color: rgba(0, 123, 255, 0.1);
}
.dark-mode .group-name-input { background: #2d3748; border-color: #4a5568; color: #e2e8f0; }

.action-btn {
  padding: 0.8rem 1.5rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 12px; /* 統一圓角 */
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 8px rgba(0, 123, 255, 0.15); /* 統一陰影 */
}
.dark-mode .action-btn { background-color: #3b82f6; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3); }
.action-btn:hover { transform: scale(1.05); box-shadow: 0 6px 15px rgba(0, 123, 255, 0.25); } /* 統一懸停效果 */
.action-btn:disabled { background: #ccc; transform: none; box-shadow: none; cursor: not-allowed; }

.score-actions {
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}
.score-actions button {
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); /* Keep shadow */
}
.btn-add { background: #28a745; color: white; }
.btn-add-lg { background: #28a745; color: white; padding: 0.4rem 1.2rem !important; }
.btn-sub { background: #dc3545; color: white; }
.score-actions button:hover { opacity: 0.9; transform: scale(1.05); }

.preset-btns {
  display: flex;
  justify-content: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
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
/* Responsive adjustments */
@media (max-width: 768px) {
  .header {
    padding: 0.75rem 1rem;
  }
  .tab-nav button {
    padding: 0.5rem 0.8rem;
    font-size: 0.95rem;
  }
  .container {
    padding: 1.5rem 1rem;
  }
  .button-group, .info-section, .tools-grid {
    grid-template-columns: 1fr; /* Stack elements on smaller screens */
  }
  .time-value { font-size: 4rem; }
  .quiz-actions-top {
    flex-direction: column;
    gap: 0.8rem;
  }
  .quiz-actions-top .tool-btn-sm,
  .quiz-actions-top .student-link-btn {
    width: 100%; /* 確保按鈕和連結在堆疊時佔滿寬度 */
    text-align: center; /* 文字置中 */
    box-sizing: border-box; /* 確保 padding/border 包含在寬度內 */
  }
}

@media (max-width: 600px) {
  .header {
    padding: 0.5rem 0.8rem;
  }
  .tab-nav button {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  .nav-button { font-size: 0.9rem; padding: 0.5rem 1rem; }
  .container {
    padding: 1rem 0.8rem;
  }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.2rem; }
  .time-value { font-size: 3rem; }
  .time-display { padding: 2rem 1rem; }
  .q-text { font-size: 1rem; }
  .draw-result { font-size: 2rem; }
  .time-input {
    width: 80px !important; /* Adjust width for very small screens */
    box-sizing: border-box; /* 確保 box-sizing 應用於此 */
  }
}

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
.fs-timer-overlay.dark { background: #2d3748; color: #e2e8f0; }

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
  font-size: 1.5rem;
  padding: 1rem 4rem;
  border-radius: 15px;
  border: 3px solid #007bff;
  background: transparent;
  color: #007bff;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}
.fs-start-btn:hover { background: #007bff; color: white; transform: scale(1.05); } /* Keep hover effects */
.dark .fs-start-btn { border-color: #4da3ff; color: #4da3ff; }
.dark .fs-start-btn:hover { background: #4da3ff; color: #1e293b; }
.fs-trigger-btn { background-color: #6c757d; color: white; border: none; padding: 0.35rem 0.7rem; border-radius: 10px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); transition: all 0.2s ease; }
.fs-trigger-btn:hover { transform: scale(1.05); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); } /* Keep hover effects */

.tool-desc { font-size: 0.85rem; color: inherit; opacity: 0.7; margin-bottom: 1rem; }
.music-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.music-btn {
  padding: 0.8rem;
  border: 2px solid #dee2e6; /* Consistent border style */
  background: transparent;
  border-radius: 12px; /* Consistent border-radius */
  cursor: pointer;
  max-width: 100%; /* 確保按鈕不會溢出 */
  color: inherit;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.dark-mode .music-btn { border-color: #4a5568; background-color: #2d3748; color: #e2e8f0; }
.music-btn.active { background: #007bff; color: white; border-color: #007bff; box-shadow: 0 4px 12px rgba(0, 123, 255, 0.25); }
.music-btn:hover:not(.active) { transform: scale(1.05); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
.music-btn:nth-child(3) { grid-column: span 2; }

.refresh-btn {
  background: none;
  border: 1px solid #ddd;
  padding: 3px 8px; /* 縮小 */
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); /* 輕微陰影 */
  transition: all 0.2s ease;
}
.dark-mode .refresh-btn { border-color: #4a5568; color: #e2e8f0; background: #2d3748; }
.refresh-btn:hover { transform: scale(1.05); box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12); }

.edit-link, .delete-link {
  padding: 0.2rem 0.5rem; /* 最小化 padding */
  border-radius: 6px;
  transition: all 0.2s ease;
  text-decoration: none; /* 確保不是下劃線 */
  color: inherit; /* 繼承文字顏色 */
}
.dark-mode .edit-link { color: #60a5fa; }
.dark-mode .delete-link { color: #f87171; }
.edit-link:hover { background: rgba(0, 123, 255, 0.1); transform: scale(1.05); }
.delete-link:hover { background: rgba(220, 53, 69, 0.1); transform: scale(1.05); }

/* --- 排行榜金銀銅牌特殊樣式 --- */
.ranking-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-top: 1.5rem;
}

.rank-card {
  display: flex;
  align-items: center;
  padding: 1.2rem 1.5rem;
  border-radius: 18px;
  border: 2px solid rgba(128, 128, 128, 0.1);
  background: rgba(255, 255, 255, 0.5);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  position: relative;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
}

.dark-mode .rank-card {
  background: #2d3748;
  border-color: rgba(74, 85, 104, 0.5);
  color: #e2e8f0;
}

/* 金牌樣式 (第 1 名) */
.rank-1 {
  border-color: #FFD700 !important;
  background: rgba(255, 215, 0, 0.08) !important;
  box-shadow: 0 10px 25px rgba(255, 215, 0, 0.2) !important;
  transform: translateY(-3px) scale(1.02);
  z-index: 2;
}
.rank-1 .rank-badge { background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; }

/* 銀牌樣式 (第 2 名) */
.rank-2 {
  border-color: #C0C0C0 !important;
  background: rgba(192, 192, 192, 0.08) !important;
  box-shadow: 0 8px 20px rgba(192, 192, 192, 0.1) !important;
}
.rank-2 .rank-badge { background: linear-gradient(135deg, #C0C0C0, #8E8E8E); color: #000; }

/* 銅牌樣式 (第 3 名) */
.rank-3 {
  border-color: #CD7F32 !important;
  background: rgba(205, 127, 50, 0.08) !important;
  box-shadow: 0 8px 20px rgba(205, 127, 50, 0.1) !important;
}
.rank-3 .rank-badge { background: linear-gradient(135deg, #CD7F32, #8B4513); color: #fff; }

.rank-badge {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1.2rem;
  font-weight: 900;
  font-size: 1.2rem;
  background: #f1f3f5;
  color: #495057;
  flex-shrink: 0;
}

.rank-info { flex: 1; }
.rank-name { font-weight: 700; font-size: 1.1rem; }
.rank-score-pill { 
  font-weight: 800; 
  color: #007bff; 
  font-size: 1.2rem;
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.dark-mode .rank-score-pill { color: #4da3ff; }
.rank-score-pill .unit { font-size: 0.8rem; opacity: 0.6; }

.publish-btn { background-color: #6610f2; color: white; border: none; }
.dark-mode .publish-btn { background-color: #8b5cf6; }
.publish-btn:hover { background-color: #520dc2; }
.student-link-btn {
  font-size: 0.8rem;
  color: #007bff;
  text-decoration: none;
  padding: 0.5rem;
  border: 1px solid #007bff;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}
.student-link-btn:hover {
  background: rgba(0, 123, 255, 0.05);
  border-color: #0056b3;
  color: #0056b3;
}
.student-results-card { border-top: 4px solid #6610f2; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.card-header h3 {
  flex: 1;
  text-align: center;
  margin: 0;
}
.refresh-btn { background: none; border: 1px solid #ddd; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }

/* Poll Specific Styles */
.poll-question-title { color: #007bff; margin-bottom: 0.5rem; font-size: 1.3rem; }
.poll-meta { font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem; }
.highlight { color: #6610f2; font-weight: bold; }

/* Poll Chart Styles */
.poll-chart { margin-top: 1rem; }
.chart-item { margin-bottom: 1.2rem; }
.chart-label { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px; }
.chart-bar-bg { background: #eee; height: 12px; border-radius: 6px; overflow: hidden; }
.dark-mode .chart-bar-bg { background: #4a5568; }
.vote-count {
  color: #6610f2;
  font-family: 'Courier New', monospace;
  font-weight: 800;
}
.chart-bar-fill { 
  height: 100%; 
  border-radius: 6px;
  transition: width 0.5s ease-out; 
}
.qa-bubble {
  background: rgba(0, 123, 255, 0.05);
  border: 1px solid rgba(0, 123, 255, 0.1);
  padding: 0.8rem;
  border-radius: 12px;
  margin-bottom: 0.8rem;
}
.dark-mode .qa-bubble { background: #374151; border-color: rgba(74, 85, 104, 0.5); color: #e2e8f0; }
.student-name { color: #007bff; margin-right: 5px; }
.w-full { width: 100%; }
.mt-2 { margin-top: 1rem; }
.mt-4 { margin-top: 1.5rem; }
.mb-2 { margin-bottom: 2rem; }
.text-center { text-align: center; }
.button-group-vertical { 
  display: flex; 
  flex-direction: column; 
  gap: 0.8rem; 
  margin-top: 1rem;
}

.text-success { color: #28a745; font-weight: bold; }
.text-danger { color: #dc3545; font-weight: bold; }
.status-pill { background: #e3f2fd; color: #0d47a1; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; }
.empty-msg { padding: 2rem !important; color: #999; }
.dark-mode .empty-msg { color: #9ca3af; }
.empty-msg-card { background: white; border: 1px solid rgba(0,0,0,0.05); border-radius: 24px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
.dark-mode .empty-msg-card { background: #2d3748; border-color: rgba(74, 85, 104, 0.5); color: #e2e8f0; }

.poll-result-item {
  border-bottom: 1px dashed #eee; 
  padding-bottom: 1.5rem; 
  margin-bottom: 1.5rem;
}
.dark-mode .poll-result-item { border-bottom-color: #4a5568; background-color: rgba(45, 55, 72, 0.5); padding: 1rem; border-radius: 8px; }

.q-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.2rem;
  gap: 1.5rem;
  padding-top: 0.5rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.05);
  padding-bottom: 0.5rem;
}
.dark-mode .q-header { border-bottom-color: rgba(74, 85, 104, 0.5); }

/* QR Code Modal Styles */
.qr-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6); /* 半透明黑色背景 */
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px); /* 模糊背景 */
}

.qr-modal-content {
  background: white;
  padding: 2.5rem;
  border-radius: 20px;
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
  position: relative;
  max-width: 90%;
  max-height: 90%;
  overflow: auto;
  text-align: center;
  animation: zoomIn 0.3s ease-out; /* 彈窗進入動畫 */
}

.dark-mode .qr-modal-content {
  background: #2d3748;
  color: #e2e8f0;
}

.qr-modal-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.8rem;
  cursor: pointer;
  color: #666;
  transition: color 0.2s;
}
.dark-mode .qr-modal-close-btn { color: #ccc; }
.qr-modal-close-btn:hover { color: #dc3545; }

.qr-modal-title {
  font-size: 1.8rem;
  margin-bottom: 1.5rem;
  color: #4f46e5;
}
.dark-mode .qr-modal-title { color: #8b5cf6; }

.qr-code-image {
  max-width: 300px; /* 限制圖片大小 */
  height: auto;
  border: 5px solid #f0f0f0; /* 圖片邊框 */
  border-radius: 10px;
  margin-bottom: 1.5rem;
}
.dark-mode .qr-code-image { border-color: #4a5568; }

.qr-modal-description {
  font-size: 1rem;
  color: #666;
}
.dark-mode .qr-modal-description { color: #a0aec0; }

@keyframes zoomIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
