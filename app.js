const QUESTION_BANK_URL = './question_bank.json';
const MODULES = {
  'managing-software-projects': {
    label: 'Managing Software Projects',
    file: './question_bank.json',
  },
  'human-resources-quality-management': {
    label: 'Human Resources and Quality Management',
    file: './HR questions.json',
  },
};

const STORAGE_KEYS = {
  theme: 'revision-mcq-theme',
  module: 'revision-mcq-module',
  mode: 'revision-mcq-mode',
  filters: 'revision-mcq-filters',
  history: 'revision-mcq-history',
  performance: 'revision-mcq-performance',
  bookmarks: 'revision-mcq-bookmarks',
  incorrect: 'revision-mcq-incorrect',
};

const state = {
  allQuestions: [],
  filteredQuestions: [],
  defaultSets: { A: [], B: [], C: [] },
  currentSession: null,
  currentQuestionIndex: 0,
  activeSet: 'A',
  totalQuestions: 0,
  moduleId: 'managing-software-projects',
  moduleLabel: MODULES['managing-software-projects'].label,
  mode: 'revision',
  theme: 'light',
  filters: {
    search: '',
    lecture: 'all',
    difficulty: 'all',
    type: 'all',
    priority: 'all',
    subchapter: 'all',
  },
  performance: {},
  history: [],
  bookmarks: [],
  incorrect: [],
};

const elements = {};

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeHtml(value) {
  if (!value) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function shuffleOptions(options) {
  const array = [...options];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function normalizeQuestion(question) {
  return {
    id: String(question.id || ''),
    lecture: Number(question.lecture) || 1,
    subchapter: String(question.subchapter || 'General'),
    type: String(question.type || 'single-select'),
    difficulty: String(question.difficulty || 'medium'),
    examPriority: String(question.examPriority || 'medium'),
    question: String(question.question || 'Question text missing'),
    options: Array.isArray(question.options) ? question.options.slice() : [],
    answers: Array.isArray(question.answers) ? question.answers.slice() : [],
    hint: String(question.hint || 'No hint provided.'),
    explanation: String(question.explanation || 'No explanation provided.'),
  };
}

function buildDefaultSets(questions) {
  if (!questions.length) return { A: [], B: [], C: [] };

  const sets = { A: [], B: [], C: [] };
  const setNames = ['A', 'B', 'C'];
  const remainingQuestions = [...questions];

  setNames.forEach((setName, index) => {
    const totalRemaining = remainingQuestions.length;
    const remainingSets = setNames.length - index;
    let targetSize;

    if (totalRemaining <= 180) {
      const base = Math.floor(totalRemaining / remainingSets);
      const remainder = totalRemaining % remainingSets;
      targetSize = base + (index < remainder ? 1 : 0);
    } else {
      targetSize = Math.min(60, totalRemaining);
    }

    const lectureIds = [...new Set(remainingQuestions.map((question) => question.lecture))].sort((a, b) => a - b);
    const countsByLecture = {};
    lectureIds.forEach((lectureId) => {
      countsByLecture[lectureId] = remainingQuestions.filter((question) => question.lecture === lectureId).length;
    });

    const allocations = {};
    let remainingSlots = targetSize;
    lectureIds.forEach((lectureId) => {
      const share = (countsByLecture[lectureId] / totalRemaining) * targetSize;
      allocations[lectureId] = Math.floor(share);
      remainingSlots -= allocations[lectureId];
    });

    const fractional = lectureIds
      .map((lectureId) => ({
        lectureId,
        remainder: (countsByLecture[lectureId] / totalRemaining) * targetSize - (allocations[lectureId] || 0),
      }))
      .sort((a, b) => b.remainder - a.remainder || a.lectureId - b.lectureId);

    for (let slotIndex = 0; slotIndex < remainingSlots; slotIndex += 1) {
      const lectureId = fractional[slotIndex % fractional.length].lectureId;
      allocations[lectureId] += 1;
    }

    lectureIds.forEach((lectureId) => {
      const lectureQuestions = remainingQuestions
        .filter((question) => question.lecture === lectureId)
        .slice()
        .sort((left, right) => hashString(`${left.id}|${setName}|${lectureId}`) - hashString(`${right.id}|${setName}|${lectureId}`));

      const takeCount = allocations[lectureId] || 0;
      for (let questionIndex = 0; questionIndex < takeCount && questionIndex < lectureQuestions.length; questionIndex += 1) {
        const question = lectureQuestions[questionIndex];
        sets[setName].push(question);
      }
    });

    sets[setName] = sets[setName].slice(0, targetSize);
    const idsToRemove = new Set(sets[setName].map((question) => question.id));
    for (let questionIndex = remainingQuestions.length - 1; questionIndex >= 0; questionIndex -= 1) {
      if (idsToRemove.has(remainingQuestions[questionIndex].id)) {
        remainingQuestions.splice(questionIndex, 1);
      }
    }
  });

  return sets;
}

const DataLayer = {
  async loadQuestionBank(moduleId = state.moduleId) {
    const moduleKey = MODULES[moduleId] ? moduleId : 'managing-software-projects';
    const moduleConfig = MODULES[moduleKey];
    const response = await fetch(moduleConfig.file, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Unable to load ${moduleConfig.file}`);

    const payload = await response.json();
    const questions = Array.isArray(payload.questions) ? payload.questions.map(normalizeQuestion) : [];
    state.moduleId = moduleKey;
    state.moduleLabel = moduleConfig.label;
    state.allQuestions = questions;
    state.totalQuestions = questions.length;
    state.defaultSets = buildDefaultSets(questions);
    state.filteredQuestions = [...(state.defaultSets.A || [])];
    state.filters = { search: '', lecture: 'all', difficulty: 'all', type: 'all', priority: 'all', subchapter: 'all' };
    FilterEngine.reset();
    return questions;
  },

  async switchModule(moduleId) {
    await DataLayer.loadQuestionBank(moduleId);
    populateFilters();
    updateModuleButtons();
    loadDefaultSet('A');
    ResultsEngine.renderAll();
    renderSummaryStats();
    ReviewEngine.renderQuestion();
  },

  getQuestionById(id) {
    return state.allQuestions.find((question) => question.id === String(id)) || null;
  },
};

const StorageManager = {
  loadObject(key, fallbackValue) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (error) {
      return fallbackValue;
    }
  },

  saveObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  loadState() {
    state.theme = StorageManager.loadObject(STORAGE_KEYS.theme, 'light');
    state.moduleId = StorageManager.loadObject(STORAGE_KEYS.module, state.moduleId);
    if (!MODULES[state.moduleId]) {
      state.moduleId = 'managing-software-projects';
    }
    state.moduleLabel = MODULES[state.moduleId].label;
    state.mode = StorageManager.loadObject(STORAGE_KEYS.mode, 'revision');
    state.filters = { ...state.filters, ...StorageManager.loadObject(STORAGE_KEYS.filters, state.filters) };
    state.history = StorageManager.loadObject(STORAGE_KEYS.history, []);
    state.performance = StorageManager.loadObject(STORAGE_KEYS.performance, {});
    state.bookmarks = StorageManager.loadObject(STORAGE_KEYS.bookmarks, []);
    state.incorrect = StorageManager.loadObject(STORAGE_KEYS.incorrect, []);
  },

  saveState() {
    StorageManager.saveObject(STORAGE_KEYS.theme, state.theme);
    StorageManager.saveObject(STORAGE_KEYS.module, state.moduleId);
    StorageManager.saveObject(STORAGE_KEYS.mode, state.mode);
    StorageManager.saveObject(STORAGE_KEYS.filters, state.filters);
    StorageManager.saveObject(STORAGE_KEYS.history, state.history);
    StorageManager.saveObject(STORAGE_KEYS.performance, state.performance);
    StorageManager.saveObject(STORAGE_KEYS.bookmarks, state.bookmarks);
    StorageManager.saveObject(STORAGE_KEYS.incorrect, state.incorrect);
  },
};

const SearchEngine = {
  tokenize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  },

  matches(question, searchValue) {
    if (!searchValue) return true;
    const query = SearchEngine.tokenize(searchValue);
    const haystack = [
      question.question,
      question.subchapter,
      question.hint,
      question.explanation,
      question.type,
      ...(question.options || []),
      ...(question.answers || []),
    ].join(' ');
    const tokens = SearchEngine.tokenize(haystack);
    return query.every((term) => tokens.includes(term));
  },
};

const FilterEngine = {
  memo: new Map(),

  key(filters) {
    return JSON.stringify(filters);
  },

  apply(questions, filters) {
    const cacheKey = FilterEngine.key(filters);
    if (FilterEngine.memo.has(cacheKey)) return FilterEngine.memo.get(cacheKey);

    const result = questions.filter((question) => {
      const lectureMatch = filters.lecture === 'all' || String(question.lecture) === String(filters.lecture);
      const difficultyMatch = filters.difficulty === 'all' || question.difficulty === filters.difficulty;
      const typeMatch = filters.type === 'all' || question.type === filters.type;
      const priorityMatch = filters.priority === 'all' || question.examPriority === filters.priority;
      const subchapterMatch = filters.subchapter === 'all' || question.subchapter === filters.subchapter;
      const searchMatch = SearchEngine.matches(question, filters.search);
      return lectureMatch && difficultyMatch && typeMatch && priorityMatch && subchapterMatch && searchMatch;
    });

    FilterEngine.memo.set(cacheKey, result);
    return result;
  },

  reset() {
    FilterEngine.memo.clear();
  },
};

const ResultsEngine = {
  renderHistory() {
    const items = state.history.slice(0, 6);
    if (!items.length) {
      elements.resultHistory.innerHTML = '<li class="empty-state">No recent quiz results yet.</li>';
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((entry) => {
      const row = document.createElement('li');
      row.className = 'result-item';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(entry.title)}</strong><br />
          <small>${escapeHtml(entry.date)}</small>
        </div>
        <strong>${entry.score}%</strong>
      `;
      fragment.appendChild(row);
    });

    elements.resultHistory.innerHTML = '';
    elements.resultHistory.appendChild(fragment);
  },

  renderPerformance() {
    const rows = Object.entries(state.performance)
      .map(([lectureId, stats]) => ({
        lectureId,
        attempted: Number(stats.attempted || 0),
        correct: Number(stats.correct || 0),
        accuracy: stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0,
      }))
      .sort((a, b) => b.attempted - a.attempted || b.accuracy - a.accuracy)
      .slice(0, 6);

    if (!rows.length) {
      elements.performanceList.innerHTML = '<div class="empty-state">Complete a quiz to see lecture performance.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'performance-row';
      row.innerHTML = `
        <div class="performance-meta">
          <strong>Lecture ${escapeHtml(entry.lectureId)}</strong>
          <small>${entry.correct}/${entry.attempted} correct</small>
        </div>
        <strong>${entry.accuracy}%</strong>
      `;
      fragment.appendChild(row);
    });

    elements.performanceList.innerHTML = '';
    elements.performanceList.appendChild(fragment);
  },

  renderLectureChart() {
    const counts = {};
    state.allQuestions.forEach((question) => {
      counts[question.lecture] = (counts[question.lecture] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
    const max = Math.max(...entries.map(([, count]) => count), 1);

    if (!entries.length) {
      elements.lectureChart.innerHTML = '<div class="empty-state">Chart unavailable.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    entries.forEach(([lectureId, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-row';
      row.innerHTML = `
        <span class="chart-label">L${lectureId}</span>
        <div class="chart-bar-wrap"><div class="chart-bar" style="width: ${(count / max) * 100}%"></div></div>
        <strong>${count}</strong>
      `;
      fragment.appendChild(row);
    });

    elements.lectureChart.innerHTML = '';
    elements.lectureChart.appendChild(fragment);
  },

  renderBookmarks() {
    if (!state.bookmarks.length) {
      elements.bookmarkList.innerHTML = '<li class="empty-state">No bookmarks yet.</li>';
      return;
    }

    const fragment = document.createDocumentFragment();
    state.bookmarks.forEach((questionId) => {
      const question = DataLayer.getQuestionById(questionId);
      if (!question) return;
      const item = document.createElement('li');
      item.className = 'compact-item';
      item.innerHTML = `<button type="button" data-bookmark-target="${escapeHtml(question.id)}">${escapeHtml(question.id)} · ${escapeHtml(question.subchapter)}</button>`;
      fragment.appendChild(item);
    });

    elements.bookmarkList.innerHTML = '';
    elements.bookmarkList.appendChild(fragment);
  },

  renderIncorrect() {
    if (!state.incorrect.length) {
      elements.incorrectList.innerHTML = '<li class="empty-state">No incorrect questions recorded.</li>';
      return;
    }

    const fragment = document.createDocumentFragment();
    state.incorrect.forEach((questionId) => {
      const question = DataLayer.getQuestionById(questionId);
      if (!question) return;
      const item = document.createElement('li');
      item.className = 'compact-item';
      item.innerHTML = `<button type="button" data-incorrect-target="${escapeHtml(question.id)}">${escapeHtml(question.id)} · ${escapeHtml(question.subchapter)}</button>`;
      fragment.appendChild(item);
    });

    elements.incorrectList.innerHTML = '';
    elements.incorrectList.appendChild(fragment);
  },

  renderAll() {
    ResultsEngine.renderHistory();
    ResultsEngine.renderPerformance();
    ResultsEngine.renderLectureChart();
    ResultsEngine.renderBookmarks();
    ResultsEngine.renderIncorrect();
  },
};

const ReviewEngine = {
  shouldRevealAnswer(question) {
    if (!state.currentSession || !question) return false;
    if (question.type === 'multi-select') {
      return Boolean(state.currentSession.answerMap[question.id]?.showAnswer);
    }
    if (state.mode === 'revision') return (state.currentSession.answerMap[question.id] || []).length > 0;
    return Boolean(state.currentSession.completed);
  },

  toggleShowAnswer(question) {
    if (!state.currentSession || !question) return;
    const selected = state.currentSession.answerMap[question.id] || [];
    state.currentSession.answerMap[question.id] = selected;
    state.currentSession.answerMap[question.id].showAnswer = true;
    ReviewEngine.renderQuestion();
  },

  renderQuestion() {
    const question = state.currentSession ? state.currentSession.questions[state.currentQuestionIndex] : null;
    if (!question) {
      elements.questionCard.innerHTML = '<div class="empty-state">Choose a set or filter to begin.</div>';
      elements.questionMeta.textContent = 'No question selected';
      elements.questionCounter.textContent = '0 / 0';
      return;
    }

    const currentAnswers = state.currentSession.answerMap[question.id] || [];
    const reveal = ReviewEngine.shouldRevealAnswer(question);
    const bookmarkLabel = state.bookmarks.includes(question.id) ? 'Remove bookmark' : 'Bookmark';

    if (elements.showAnswerBtn) {
      const shouldShowAnswer = question.type === 'multi-select' && !reveal;
      elements.showAnswerBtn.classList.toggle('hidden', !shouldShowAnswer);
      elements.showAnswerBtn.disabled = !shouldShowAnswer;
    }

    const optionMarkup = (question.options || []).map((option, index) => {
      const selected = Array.isArray(currentAnswers) ? currentAnswers.includes(option) : false;
      const isCorrect = (question.answers || []).includes(option);
      const classes = ['option-item'];
      if (selected) classes.push('selected');
      if (reveal && isCorrect) classes.push('correct');
      if (reveal && selected && !isCorrect) classes.push('incorrect');

      return `
        <button class="${classes.join(' ')}" type="button" data-option="${escapeHtml(option)}">
          <span class="option-index">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(option)}</span>
        </button>
      `;
    }).join('');

    const answerMarkup = reveal ? `
      <div class="answer-panel">
        <strong>Hint</strong>
        <div>${escapeHtml(question.hint || 'No hint available.')}</div>
      </div>
      <div class="explanation-box">
        <strong>Explanation</strong>
        <div>${escapeHtml(question.explanation || 'No explanation available.')}</div>
      </div>
    ` : `
      <div class="answer-panel">
        <strong>Hint</strong>
        <div>${escapeHtml(question.hint || 'No hint available.')}</div>
      </div>
    `;

    elements.questionMeta.textContent = `${question.subchapter || 'General'} • ${question.examPriority || 'medium'} priority`;
    elements.questionCounter.textContent = `${state.currentQuestionIndex + 1} / ${state.currentSession.questions.length}`;
    elements.questionCard.innerHTML = `
      <div class="question-meta">
        <span class="badge">${escapeHtml(question.type || 'single-select')}</span>
        <span class="badge">Lecture ${question.lecture}</span>
        <span class="badge">${escapeHtml(question.subchapter || 'General')}</span>
        <span class="badge">${escapeHtml(question.difficulty || 'medium')}</span>
      </div>
      <h2>${escapeHtml(question.question)}</h2>
      <div class="question-meta">
        <button class="secondary-btn bookmark-toggle" type="button" data-bookmark-id="${escapeHtml(question.id)}">${bookmarkLabel}</button>
      </div>
      <div class="options-list">${optionMarkup}</div>
      ${answerMarkup}
    `;

    elements.questionCard.querySelectorAll('.option-item').forEach((button) => {
      button.addEventListener('click', () => {
        const optionValue = decodeHtml(button.dataset.option || '');
        QuizEngine.handleOptionSelection(question, optionValue);
      });
    });

    elements.questionCard.querySelectorAll('.bookmark-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const id = decodeHtml(button.dataset.bookmarkId || '');
        QuizEngine.toggleBookmark(id);
      });
    });

  },
};

const QuizEngine = {
  createSession(questions, mode = state.mode) {
    const uniqueIds = new Set();
    const sessionQuestions = questions.map((question) => {
      const normalizedQuestion = normalizeQuestion(question);
      if (uniqueIds.has(normalizedQuestion.id)) throw new Error(`Duplicate question ID in quiz: ${normalizedQuestion.id}`);
      uniqueIds.add(normalizedQuestion.id);
      return {
        ...normalizedQuestion,
        options: shuffleOptions(normalizedQuestion.options),
      };
    });

    state.currentSession = {
      questions: sessionQuestions,
      answerMap: {},
      completed: false,
      mode,
    };
    state.currentQuestionIndex = 0;
  },

  handleOptionSelection(question, optionValue) {
    if (!state.currentSession || !optionValue) return;
    const currentAnswers = Array.isArray(state.currentSession.answerMap[question.id])
      ? state.currentSession.answerMap[question.id]
      : [];
    const nextAnswers = question.type === 'multi-select'
      ? currentAnswers.includes(optionValue)
        ? currentAnswers.filter((value) => value !== optionValue)
        : [...currentAnswers, optionValue]
      : [optionValue];

    const answerState = { ...state.currentSession.answerMap[question.id], showAnswer: false };
    state.currentSession.answerMap[question.id] = question.type === 'multi-select'
      ? nextAnswers
      : nextAnswers;

    if (question.type === 'multi-select') {
      state.currentSession.answerMap[question.id] = nextAnswers;
      state.currentSession.answerMap[question.id].showAnswer = false;
    }

    ReviewEngine.renderQuestion();
  },

  toggleBookmark(questionId) {
    if (!questionId) return;
    state.bookmarks = state.bookmarks.includes(questionId)
      ? state.bookmarks.filter((id) => id !== questionId)
      : [...new Set([...state.bookmarks, questionId])];
    StorageManager.saveState();
    ResultsEngine.renderBookmarks();
    ReviewEngine.renderQuestion();
  },

  startQuiz(questions = state.filteredQuestions) {
    if (!questions.length) return;
    const selected = questions.slice(0, 60);
    QuizEngine.createSession(selected, state.mode);
    elements.quizActions.classList.remove('hidden');
    ReviewEngine.renderQuestion();
  },

  startDailyQuiz() {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const selected = [...state.allQuestions]
      .sort((left, right) => hashString(`${left.id}|${dateStamp}`) - hashString(`${right.id}|${dateStamp}`))
      .slice(0, 20);
    QuizEngine.createSession(selected, state.mode);
    elements.quizActions.classList.remove('hidden');
    ReviewEngine.renderQuestion();
  },

  scrollQuestionIntoView() {
    const target = elements.questionCard || document.getElementById('questionCard');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  },

  nextQuestion() {
    if (!state.currentSession) return;
    if (state.currentQuestionIndex < state.currentSession.questions.length - 1) {
      state.currentQuestionIndex += 1;
      ReviewEngine.renderQuestion();
      QuizEngine.scrollQuestionIntoView();
    }
  },

  previousQuestion() {
    if (!state.currentSession) return;
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex -= 1;
      ReviewEngine.renderQuestion();
      QuizEngine.scrollQuestionIntoView();
    }
  },

  evaluateQuestion(question, selectedAnswers) {
    const expected = [...new Set((question.answers || []).slice())].sort();
    const chosen = [...new Set((selectedAnswers || []).slice())].sort();
    return JSON.stringify(chosen) === JSON.stringify(expected);
  },

  submitQuiz() {
    if (!state.currentSession) return;

    const session = state.currentSession;
    session.completed = true;
    let correct = 0;

    session.questions.forEach((question) => {
      const selected = session.answerMap[question.id] || [];
      const isCorrect = QuizEngine.evaluateQuestion(question, selected);
      if (isCorrect) correct += 1;

      const lectureKey = String(question.lecture || 'Unassigned');
      if (!state.performance[lectureKey]) state.performance[lectureKey] = { attempted: 0, correct: 0 };
      state.performance[lectureKey].attempted += 1;
      if (isCorrect) state.performance[lectureKey].correct += 1;

      if (!isCorrect) state.incorrect = [...new Set([...state.incorrect, question.id])];
    });

    const percentage = session.questions.length ? Math.round((correct / session.questions.length) * 100) : 0;
    state.history.unshift({
      title: session.questions.length === 20 ? 'Daily Quiz' : `Set ${state.activeSet}`,
      date: new Date().toLocaleDateString(undefined, { dateStyle: 'medium' }),
      score: percentage,
    });
    state.history = state.history.slice(0, 6);
    StorageManager.saveState();
    ResultsEngine.renderAll();
    ReviewEngine.renderQuestion();
    alert(`Quiz complete: ${correct}/${session.questions.length} correct (${percentage}%)`);
  },
};

const PwaManager = {
  clearStaleServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    }).catch(() => {});
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  },

  setupInstallPrompt() {
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      elements.installButton.classList.remove('hidden');
    });

    elements.installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      elements.installButton.classList.add('hidden');
    });
  },
};

function setTheme(themeName) {
  document.body.classList.toggle('dark', themeName === 'dark');
  state.theme = themeName;
  if (elements.themeToggle) {
    elements.themeToggle.textContent = themeName === 'dark' ? 'Light mode' : 'Dark mode';
  }
  StorageManager.saveState();
}

function populateFilters() {
  const lectureValues = [...new Set(state.allQuestions.map((question) => question.lecture))].sort((a, b) => a - b);
  const subchapterValues = [...new Set(state.allQuestions.map((question) => question.subchapter))].sort();

  elements.lectureFilter.innerHTML = '<option value="all">All lectures</option>' + lectureValues.map((lecture) => `<option value="${lecture}">Lecture ${lecture}</option>`).join('');
  elements.subchapterFilter.innerHTML = '<option value="all">All subchapters</option>' + subchapterValues.map((subchapter) => `<option value="${subchapter}">${subchapter}</option>`).join('');

  elements.lectureFilter.value = state.filters.lecture;
  elements.difficultyFilter.value = state.filters.difficulty;
  elements.typeFilter.value = state.filters.type;
  elements.priorityFilter.value = state.filters.priority;
  elements.subchapterFilter.value = state.filters.subchapter;
  elements.questionSearch.value = state.filters.search;
}

function renderSummaryStats() {
  elements.totalQuestions.textContent = String(state.totalQuestions);
  elements.filteredQuestions.textContent = String(state.filteredQuestions.length);
  elements.activeMode.textContent = state.mode === 'revision' ? 'Revision' : 'Exam';
  elements.dailyQuizCount.textContent = '20';
}

function updateModuleButtons() {
  document.querySelectorAll('.module-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.module === state.moduleId);
  });
}

function applyFilters() {
  state.filters = {
    search: elements.questionSearch.value.trim(),
    lecture: elements.lectureFilter.value,
    difficulty: elements.difficultyFilter.value,
    type: elements.typeFilter.value,
    priority: elements.priorityFilter.value,
    subchapter: elements.subchapterFilter.value,
  };

  FilterEngine.reset();
  state.filteredQuestions = FilterEngine.apply(state.allQuestions, state.filters);
  renderSummaryStats();
  StorageManager.saveState();
}

function loadDefaultSet(setName) {
  const normalized = ['A', 'B', 'C'].includes(setName) ? setName : 'A';
  state.activeSet = normalized;
  state.filteredQuestions = [...state.defaultSets[normalized]];
  state.filters = { search: '', lecture: 'all', difficulty: 'all', type: 'all', priority: 'all', subchapter: 'all' };
  populateFilters();
  document.querySelectorAll('.set-btn').forEach((button) => button.classList.toggle('active', button.dataset.set === normalized));
  renderSummaryStats();
  ResultsEngine.renderAll();
  QuizEngine.startQuiz(state.filteredQuestions);
}

function bindEvents() {
  document.querySelectorAll('.module-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const selectedModule = button.dataset.module || state.moduleId;
      if (selectedModule === state.moduleId) return;
      await DataLayer.switchModule(selectedModule);
    });
  });

  elements.questionSearch.addEventListener('input', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });

  elements.lectureFilter.addEventListener('change', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });
  elements.difficultyFilter.addEventListener('change', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });
  elements.typeFilter.addEventListener('change', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });
  elements.priorityFilter.addEventListener('change', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });
  elements.subchapterFilter.addEventListener('change', () => {
    applyFilters();
    ResultsEngine.renderAll();
  });

  elements.startQuizBtn.addEventListener('click', () => {
    if (state.filteredQuestions.length) QuizEngine.startQuiz(state.filteredQuestions);
  });
  elements.dailyQuizBtn.addEventListener('click', () => QuizEngine.startDailyQuiz());
  elements.showAnswerBtn.addEventListener('click', () => {
    const question = state.currentSession ? state.currentSession.questions[state.currentQuestionIndex] : null;
    if (question) ReviewEngine.toggleShowAnswer(question);
  });
  elements.prevQuestionBtn.addEventListener('click', QuizEngine.previousQuestion);
  elements.nextQuestionBtn.addEventListener('click', QuizEngine.nextQuestion);
  elements.submitQuizBtn.addEventListener('click', QuizEngine.submitQuiz);

  elements.resetFiltersBtn.addEventListener('click', () => {
    state.filters = { search: '', lecture: 'all', difficulty: 'all', type: 'all', priority: 'all', subchapter: 'all' };
    populateFilters();
    state.filteredQuestions = [...state.defaultSets[state.activeSet] || []];
    renderSummaryStats();
    ResultsEngine.renderAll();
    StorageManager.saveState();
  });

  elements.themeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach((node) => node.classList.toggle('active', node === button));
      elements.activeMode.textContent = state.mode === 'revision' ? 'Revision' : 'Exam';
      StorageManager.saveState();
      if (state.currentSession) ReviewEngine.renderQuestion();
    });
  });

  document.querySelectorAll('.set-btn').forEach((button) => {
    button.addEventListener('click', () => {
      loadDefaultSet(button.dataset.set || 'A');
    });
  });

  elements.bookmarkList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-bookmark-target]');
    if (!target) return;
    const id = decodeHtml(target.dataset.bookmarkTarget || '');
    QuizEngine.toggleBookmark(id);
  });

  elements.incorrectList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-incorrect-target]');
    if (!target) return;
    const id = decodeHtml(target.dataset.incorrectTarget || '');
    const question = DataLayer.getQuestionById(id);
    if (!question) return;
    QuizEngine.createSession([question], state.mode);
    elements.quizActions.classList.remove('hidden');
    ReviewEngine.renderQuestion();
  });
}

function captureElements() {
  elements.themeToggle = document.getElementById('themeToggle');
  elements.installButton = document.getElementById('installButton');
  elements.questionSearch = document.getElementById('questionSearch');
  elements.lectureFilter = document.getElementById('lectureFilter');
  elements.difficultyFilter = document.getElementById('difficultyFilter');
  elements.typeFilter = document.getElementById('typeFilter');
  elements.priorityFilter = document.getElementById('priorityFilter');
  elements.subchapterFilter = document.getElementById('subchapterFilter');
  elements.totalQuestions = document.getElementById('totalQuestions');
  elements.filteredQuestions = document.getElementById('filteredQuestions');
  elements.activeMode = document.getElementById('activeMode');
  elements.dailyQuizCount = document.getElementById('dailyQuizCount');
  elements.questionMeta = document.getElementById('questionMeta');
  elements.questionCounter = document.getElementById('questionCounter');
  elements.questionCard = document.getElementById('questionCard');
  elements.quizActions = document.getElementById('quizActions');
  elements.prevQuestionBtn = document.getElementById('prevQuestionBtn');
  elements.nextQuestionBtn = document.getElementById('nextQuestionBtn');
  elements.showAnswerBtn = document.getElementById('showAnswerBtn');
  elements.submitQuizBtn = document.getElementById('submitQuizBtn');
  elements.startQuizBtn = document.getElementById('startQuizBtn');
  elements.dailyQuizBtn = document.getElementById('dailyQuizBtn');
  elements.resetFiltersBtn = document.getElementById('resetFiltersBtn');
  elements.performanceList = document.getElementById('performanceList');
  elements.lectureChart = document.getElementById('lectureChart');
  elements.bookmarkList = document.getElementById('bookmarkList');
  elements.incorrectList = document.getElementById('incorrectList');
  elements.resultHistory = document.getElementById('resultHistory');
}

async function initializeApp() {
  captureElements();
  StorageManager.loadState();
  setTheme(state.theme);
  PwaManager.clearStaleServiceWorker();
  PwaManager.registerServiceWorker();
  PwaManager.setupInstallPrompt();

  try {
    updateModuleButtons();
    await DataLayer.loadQuestionBank(state.moduleId);
    populateFilters();
    loadDefaultSet('A');
    bindEvents();
    ResultsEngine.renderAll();
    renderSummaryStats();
    ReviewEngine.renderQuestion();
  } catch (error) {
    elements.questionCard.innerHTML = `<div class="empty-state">Could not load question bank: ${escapeHtml(error.message || 'Unknown error')}</div>`;
  }

  window.__revisionAudit = { state, DataLayer, SearchEngine, FilterEngine, QuizEngine, ResultsEngine, ReviewEngine, StorageManager };
}

window.addEventListener('DOMContentLoaded', initializeApp);
