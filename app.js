// MakroEval — State, Theme & Analytics Architecture

const state = {
    questions: [],
    sessionQuestions: [],
    activeTab: 'home',
    modeTitle: '',
    indices: [],
    answers: [],
    currentIdx: 0,
    startTime: 0,
    timerInt: null,
    limit: 0,
    isFeedbackMode: true,
    runKey: '',
    lastResultData: null,
    charts: {}
};

// LocalStorage Database Manager
const DB = {
    getHistory: () => {
        try { return JSON.parse(localStorage.getItem('makro_history_v1') || '[]'); }
        catch(e) { return []; }
    },
    addHistory: (record) => {
        try {
            const hist = DB.getHistory();
            hist.unshift(record);
            if(hist.length > 50) hist.pop();
            localStorage.setItem('makro_history_v1', JSON.stringify(hist));
        } catch(e) {}
    },
    clearHistory: () => {
        localStorage.removeItem('makro_history_v1');
        localStorage.removeItem('makro_blocks_v1');
    },
    getBestBlocks: () => {
        try { return JSON.parse(localStorage.getItem('makro_blocks_v1') || '{}'); }
        catch(e) { return {}; }
    },
    setBestBlock: (blockIdx, percent) => {
        try {
            const b = DB.getBestBlocks();
            b[blockIdx] = Math.max(b[blockIdx] || 0, percent);
            localStorage.setItem('makro_blocks_v1', JSON.stringify(b));
        } catch(e) {}
    }
};

// Theme Manager (Tun / Kunduz)
const Theme = {
    current: () => document.documentElement.getAttribute('data-theme') || 'dark',
    apply: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('makro_theme_v1', theme); } catch(e) {}
        const meta = document.getElementById('meta-theme-color');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#090d16' : '#f8fafc');
        const lbl = document.getElementById('theme-label-text');
        if (lbl) lbl.textContent = theme === 'dark' ? 'Kunduz' : 'Tun';
        Theme.refreshActiveCharts();
    },
    toggle: () => {
        const next = Theme.current() === 'dark' ? 'light' : 'dark';
        Theme.apply(next);
    },
    palette: () => {
        const isDark = Theme.current() === 'dark';
        return {
            primary: isDark ? '#10b981' : '#059669',
            primaryFill: isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(5, 150, 105, 0.12)',
            blue: isDark ? '#3b82f6' : '#1d4ed8',
            danger: isDark ? '#ef4444' : '#dc2626',
            muted: isDark ? '#475569' : '#94a3b8',
            grid: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
            tick: isDark ? '#94a3b8' : '#64748b'
        };
    },
    refreshActiveCharts: () => {
        if (!el('stats').classList.contains('hide')) {
            const history = DB.getHistory();
            const bestBlocks = DB.getBestBlocks();
            const nBlocks = Math.ceil(state.questions.length / 30);
            renderAnalyticsCharts(history, bestBlocks, nBlocks);
        }
        if (!el('result').classList.contains('hide') && state.lastResultData) {
            renderResultCharts(state.lastResultData);
        }
    }
};

// DOM Helpers
const el = (id) => document.getElementById(id);
const formatTime = (sec) => `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

function buildShuffledQuestion(q) {
    const paired = q[1].map((text, idx) => ({
        text: String(text).replace(/^[A-Da-d][\)\.]\s+/, ''),
        isCorrect: idx === q[2]
    }));
    const mixed = shuffle(paired);
    return [
        q[0],
        mixed.map(item => item.text),
        mixed.findIndex(item => item.isCorrect)
    ];
}
const escapeHTML = (str) => String(str).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const L = ['A', 'B', 'C', 'D'];

// Normalize both object format {question, options, correctIndex} and array format [q, opts, idx]
function normalizeQuestions(raw) {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.questions) ? raw.questions : []);
    return arr.map(q => {
        if (Array.isArray(q) && q.length >= 3) {
            return [String(q[0]), q[1].map(String), Number(q[2])];
        }
        if (q && q.question && Array.isArray(q.options) && q.options.length > 1) {
            return [String(q.question), q.options.map(String), Number(q.correctIndex ?? 0)];
        }
        return null;
    }).filter(Boolean);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    Theme.apply(Theme.current());
    const themeBtn = el('btn-theme-toggle');
    if (themeBtn) themeBtn.onclick = () => Theme.toggle();

    initTabNavigation();
    setupFileInputFallback();
    loadQuestions();
});

async function fetchQuestionsFile() {
    if (window.Q) {
        const list = normalizeQuestions(window.Q);
        if (list.length) return list;
    }

    const urls = ['questions.JSON', 'questions.json', './questions.JSON', './questions.json'];
    let lastErr = null;
    for (const u of urls) {
        try {
            const r = await fetch(u, { cache: 'no-cache' });
            if (!r.ok) throw new Error(`${u} -> HTTP ${r.status}`);
            const d = await r.json();
            const list = normalizeQuestions(d);
            if (!list.length) throw new Error(`${u} bo'sh yoki noto'g'ri formatda`);
            return list;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Savollar fayli topilmadi');
}

async function loadQuestions() {
    try {
        state.questions = await fetchQuestionsFile();
        renderHome();
    } catch (e) {
        console.warn('Savollarni avtomatik yuklab bo‘lmadi:', e);
        showLoaderView(e);
    }
}

function setupFileInputFallback() {
    const input = el('json-file-input');
    if (!input) return;
    input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const list = normalizeQuestions(parsed);
                if (!list.length) {
                    alert("Fayl ichida savollar topilmadi yoki format noto'g'ri.");
                    return;
                }
                state.questions = list;
                el('loader-view').classList.add('hide');
                renderHome();
            } catch (err) {
                alert("JSON faylni o'qishda xatolik: " + err.message);
            }
        };
        reader.readAsText(file, 'utf-8');
    };
}

function showLoaderView(err) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));
    const isFileProtocol = location.protocol === 'file:';
    if (!isFileProtocol && err) {
        el('loader-msg').innerHTML = `<code>questions.JSON</code> faylini yuklab bo'lmadi (${escapeHTML(err.message)}). Fayl <code>index.html</code> bilan bitta papkada ekanini tekshiring yoki qo'lda tanlang:`;
    }
    el('loader-view').classList.remove('hide');
}

// Tab Navigation Manager
function initTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            if (!state.questions.length) return;
            switchTab(tab.dataset.target);
        };
    });

    el('brand-logo').onclick = () => {
        if (!state.questions.length) return;
        switchTab('home');
    };
}

function switchTab(targetTab) {
    state.activeTab = targetTab;
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.target === targetTab);
    });

    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));

    if (targetTab === 'home') {
        renderHome();
    } else if (targetTab === 'stats') {
        renderStatsPage();
    }
}

// ---------------- 1. HOME VIEW ----------------
function renderHome() {
    clearInterval(state.timerInt);
    const history = DB.getHistory();
    const avg = history.length ? Math.round(history.reduce((a, b) => a + b.percent, 0) / history.length) : 0;

    el('main-stats').innerHTML = `
        <div class="stat-card"><span class="lbl">Jami savollar</span><span class="val">${state.questions.length}</span></div>
        <div class="stat-card"><span class="lbl">Mavzu bloklari</span><span class="val">${Math.ceil(state.questions.length/30)}</span></div>
        <div class="stat-card"><span class="lbl">Urinishlar soni</span><span class="val">${history.length}</span></div>
        <div class="stat-card"><span class="lbl">O'rtacha aniqlik</span><span class="val">${history.length ? avg+'%' : '—'}</span></div>
    `;

    const lastRun = history[0];
    const fixBtn = el('btn-mode-fix');
    if (lastRun && lastRun.badIndices && lastRun.badIndices.length > 0) {
        const validBad = lastRun.badIndices.filter(idx => idx >= 0 && idx < state.questions.length);
        if (validBad.length > 0) {
            fixBtn.style.display = 'flex';
            el('desc-fix').textContent = `Oxirgi testda xato qilingan ${validBad.length} ta savolni qayta yechib mustahkamlang.`;
            fixBtn.onclick = () => {
                startQuiz('Xatolar ustida ishlash', validBad, true, 0, 'fix');
            };
        } else {
            fixBtn.style.display = 'none';
        }
    } else {
        fixBtn.style.display = 'none';
    }

    const bSize = 30;
    const nBlocks = Math.ceil(state.questions.length / bSize);
    const bestBlocks = DB.getBestBlocks();
    let blocksHTML = '';

    for(let i=0; i<nBlocks; i++) {
        const start = i * bSize;
        const end = Math.min(start + bSize, state.questions.length);
        const p = bestBlocks[i] || 0;
        blocksHTML += `
            <button class="block-btn" data-b="${i}">
                <div class="bb-header">
                    <span class="bb-sub">${i+1}-Blok</span>
                    <span class="bb-pct-badge">${p ? p+'%' : '0%'}</span>
                </div>
                <span class="bb-title">${start + 1} – ${end}</span>
                <div class="bb-track"><div class="bb-fill" style="width: ${p}%"></div></div>
                <span class="bb-stat">${p ? 'Eng yuqori natija: '+p+'%' : 'Hali topshirilmagan'}</span>
            </button>
        `;
    }
    el('blocks-container').innerHTML = blocksHTML;

    el('blocks-container').onclick = (e) => {
        const btn = e.target.closest('.block-btn');
        if(!btn) return;
        const bIdx = parseInt(btn.dataset.b);
        const s = bIdx * bSize;
        const limit = Math.min(s + bSize, state.questions.length);
        const idxArr = Array.from({length: limit - s}, (_, k) => s + k);
        startQuiz(`${bIdx+1}-Blok (${s+1}–${limit})`, idxArr, true, 0, `b${bIdx}`);
    };

    el('btn-mode-all').onclick = () => {
        startQuiz(`To'liq rejim (${state.questions.length} ta)`, Array.from({length: state.questions.length}, (_, i) => i), true, 0, 'all');
    };

    el('btn-mode-rnd').onclick = () => {
        const n = Math.min(25, state.questions.length);
        startQuiz(`Imtihon (${n} ta tasodifiy)`, shuffle(Array.from({length: state.questions.length}, (_, i) => i)).slice(0, n), false, n * 60, 'rnd');
    };

    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));
    el('home').classList.remove('hide');
}

// ---------------- 2. STATISTIKA DASHBOARD ----------------
function renderStatsPage() {
    clearInterval(state.timerInt);
    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));
    el('stats').classList.remove('hide');

    const history = DB.getHistory();
    const bestBlocks = DB.getBestBlocks();

    const totalAttempts = history.length;
    const avgScore = totalAttempts ? Math.round(history.reduce((a, b) => a + b.percent, 0) / totalAttempts) : 0;
    const bestScore = totalAttempts ? Math.max(...history.map(x => x.percent)) : 0;
    const totalSecs = history.reduce((a, b) => a + (b.elapsed || 0), 0);
    const totalMins = Math.round(totalSecs / 60);

    el('st-total-attempts').textContent = totalAttempts;
    el('st-avg-score').textContent = avgScore + '%';
    el('st-best-score').textContent = bestScore + '%';
    el('st-total-time').textContent = totalMins + ' daq';

    el('btn-reset-stats').onclick = () => {
        if (confirm("Haqiqatdan ham barcha statistika va testlar tarixini o'chirmoqchimisiz?")) {
            DB.clearHistory();
            renderStatsPage();
        }
    };

    el('btn-export-stats').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `makroeval-stats-${Date.now()}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
    };

    const bSize = 30;
    const nBlocks = Math.ceil(state.questions.length / bSize);
    let blockListHTML = '';

    for(let i=0; i<nBlocks; i++) {
        const start = i * bSize;
        const end = Math.min(start + bSize, state.questions.length);
        const p = bestBlocks[i] || 0;
        const statusText = p >= 85 ? "A'lo daraja" : p >= 65 ? "Yaxshi" : p > 0 ? "Takrorlash zarur" : "Topshirilmagan";

        blockListHTML += `
            <div class="bp-card">
                <div class="bp-top">
                    <span class="bp-title">${i+1}-Blok (${start+1}–${end})</span>
                    <span class="bp-pct">${p}%</span>
                </div>
                <div class="bp-track"><div class="bp-bar" style="width: ${p}%"></div></div>
                <div class="bp-status">
                    <span>${statusText}</span>
                    <span>${end - start} ta savol</span>
                </div>
            </div>
        `;
    }
    el('stats-blocks-detail').innerHTML = blockListHTML;

    const tbody = el('history-table-body');
    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 28px;">Hali test topshirilmagan.</td></tr>`;
    } else {
        tbody.innerHTML = history.map((r, idx) => {
            const dateStr = new Date(r.t).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            const scoreClass = r.percent >= 80 ? 'score-high' : r.percent >= 50 ? 'score-mid' : 'score-low';
            return `
                <tr>
                    <td><b>#${history.length - idx}</b></td>
                    <td>${escapeHTML(r.mode || 'Test')}</td>
                    <td>${dateStr}</td>
                    <td>${formatTime(r.elapsed || 0)}</td>
                    <td>${r.c} / ${r.n}</td>
                    <td><span class="badge-score ${scoreClass}">${r.percent}%</span></td>
                </tr>
            `;
        }).join('');
    }

    renderAnalyticsCharts(history, bestBlocks, nBlocks);
}

function renderAnalyticsCharts(history, bestBlocks, nBlocks) {
    ['statTrend', 'statBlock', 'statDist'].forEach(k => {
        if(state.charts[k]) state.charts[k].destroy();
    });

    const pal = Theme.palette();
    const last15 = [...history].reverse().slice(-15);
    const ctxTrend = el('statTrendChart').getContext('2d');

    state.charts.statTrend = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: last15.length ? last15.map((_, i) => `#${i+1}`) : ['#1'],
            datasets: [{
                label: 'Natija %',
                data: last15.length ? last15.map(h => h.percent) : [0],
                borderColor: pal.primary,
                backgroundColor: pal.primaryFill,
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: pal.primary,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: pal.grid }, ticks: { color: pal.tick } },
                x: { grid: { color: pal.grid }, ticks: { color: pal.tick } }
            },
            plugins: { legend: { display: false } }
        }
    });

    const blockLabels = Array.from({length: nBlocks}, (_, i) => `${i+1}-B`);
    const blockScores = Array.from({length: nBlocks}, (_, i) => bestBlocks[i] || 0);
    const ctxBlock = el('statBlockChart').getContext('2d');

    state.charts.statBlock = new Chart(ctxBlock, {
        type: 'bar',
        data: {
            labels: blockLabels,
            datasets: [{
                label: 'Eng yaxshi %',
                data: blockScores,
                backgroundColor: blockScores.map(val => val >= 70 ? pal.primary : val > 0 ? pal.blue : pal.muted),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: pal.grid }, ticks: { color: pal.tick } },
                x: { grid: { display: false }, ticks: { color: pal.tick } }
            },
            plugins: { legend: { display: false } }
        }
    });

    const totalCorrect = history.reduce((a, b) => a + (b.c || 0), 0);
    const totalWrong = history.reduce((a, b) => a + (b.w || 0), 0);
    const totalSkipped = history.reduce((a, b) => a + (b.s || 0), 0);
    const ctxDist = el('statDistributionChart').getContext('2d');

    state.charts.statDist = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
            labels: ['To‘g‘ri', 'Xato', 'O‘tkazilgan'],
            datasets: [{
                data: [totalCorrect || 1, totalWrong, totalSkipped],
                backgroundColor: [pal.primary, pal.danger, pal.muted],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { position: 'bottom', labels: { color: pal.tick, boxWidth: 10, padding: 14, font: { family: 'Plus Jakarta Sans', size: 12 } } }
            }
        }
    });
}

// ---------------- 3. QUIZ VIEW ----------------
function startQuiz(title, indices, isFeedbackMode, limitSeconds, runKey) {
    state.modeTitle = title;
    state.indices = indices;
    state.sessionQuestions = indices.map(idx => buildShuffledQuestion(state.questions[idx]));
    state.answers = indices.map(() => -1);
    state.currentIdx = 0;
    state.isFeedbackMode = isFeedbackMode;
    state.limit = limitSeconds;
    state.runKey = runKey;
    state.startTime = Date.now();

    el('quiz-title').textContent = title;
    el('question-map').innerHTML = indices.map((_, i) => `<button class="qm-btn" data-i="${i}">${i+1}</button>`).join('');

    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));
    el('quiz').classList.remove('hide');
    window.scrollTo(0, 0);

    renderQuestion();

    clearInterval(state.timerInt);
    state.timerInt = setInterval(updateTimer, 500);
    updateTimer();
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const timerEl = el('quiz-timer');
    if (state.limit > 0) {
        const rem = Math.max(0, state.limit - elapsed);
        timerEl.textContent = formatTime(rem);
        timerEl.classList.toggle('danger', rem < 60);
        if (rem <= 0) finishQuiz(true);
    } else {
        timerEl.textContent = formatTime(elapsed);
        timerEl.classList.remove('danger');
    }
}

function renderQuestion() {
    const qData = state.sessionQuestions[state.currentIdx];
    const currentAns = state.answers[state.currentIdx];
    const total = state.indices.length;

    el('q-counter').textContent = `SAVOL ${state.currentIdx + 1} / ${total}`;
    el('q-text').innerHTML = escapeHTML(qData[0]);

    const answeredCount = state.answers.filter(a => a !== -1).length;
    el('quiz-progress').style.width = `${(answeredCount / total) * 100}%`;

    let optsHTML = '';
    qData[1].forEach((opt, idx) => {
        let classes = 'option-btn';
        if (state.isFeedbackMode && currentAns !== -1) {
            classes += ' locked';
            if (idx === qData[2]) classes += ' correct';
            else if (idx === currentAns) classes += ' wrong';
            else classes += ' dim';
        } else {
            if (idx === currentAns) classes += ' selected';
        }
        optsHTML += `
            <button class="${classes}" data-opt="${idx}">
                <div class="ob-letter">${L[idx] || idx + 1}</div>
                <div class="ob-text">${escapeHTML(opt)}</div>
            </button>
        `;
    });
    el('options-list').innerHTML = optsHTML;

    el('btn-prev').disabled = state.currentIdx === 0;
    el('btn-next').textContent = state.currentIdx === total - 1 ? 'Testni yakunlash ✓' : 'Keyingi savol →';

    document.querySelectorAll('.qm-btn').forEach((btn, i) => {
        const v = state.answers[i];
        let c = 'qm-btn';
        if (i === state.currentIdx) c += ' active';
        if (v !== -1) {
            if (state.isFeedbackMode) {
                c += v === state.sessionQuestions[i][2] ? ' correct' : ' wrong';
            } else {
                c += ' ans';
            }
        }
        btn.className = c;
    });
}

el('options-list').onclick = (e) => {
    const btn = e.target.closest('.option-btn');
    if(!btn) return;
    if(state.isFeedbackMode && state.answers[state.currentIdx] !== -1) return;
    state.answers[state.currentIdx] = parseInt(btn.dataset.opt);
    renderQuestion();
};

el('question-map').onclick = (e) => {
    const btn = e.target.closest('.qm-btn');
    if(btn) {
        state.currentIdx = parseInt(btn.dataset.i);
        renderQuestion();
    }
};

el('btn-prev').onclick = () => {
    if(state.currentIdx > 0) { state.currentIdx--; renderQuestion(); }
};

el('btn-next').onclick = () => {
    if(state.currentIdx < state.indices.length - 1) {
        state.currentIdx++; renderQuestion();
    } else {
        finishQuiz(false);
    }
};

el('btn-exit').onclick = () => {
    if(confirm("Testdan chiqmoqchimisiz? Joriy urinish saqlanmaydi.")) {
        switchTab('home');
    }
};

document.addEventListener('keydown', (e) => {
    if(!el('quiz').classList.contains('hide')) {
        const k = e.key.toLowerCase();
        if(['a','b','c','d','1','2','3','4'].includes(k)) {
            const map = {'a':0, '1':0, 'b':1, '2':1, 'c':2, '3':2, 'd':3, '4':3};
            const btn = document.querySelector(`.option-btn[data-opt="${map[k]}"]`);
            if(btn) btn.click();
        } else if(k === 'arrowright' || k === 'enter') el('btn-next').click();
        else if(k === 'arrowleft') el('btn-prev').click();
    }
});

// ---------------- 4. RESULT VIEW ----------------
function finishQuiz(force) {
    const unanswered = state.answers.filter(a => a === -1).length;
    if(!force && unanswered > 0) {
        if(!confirm(`${unanswered} ta savolga javob berilmadi. Baribir yakunlaysizmi?`)) return;
    }
    clearInterval(state.timerInt);

    const elapsed = Math.min(Math.floor((Date.now() - state.startTime) / 1000), state.limit || Infinity);
    const n = state.indices.length;

    let c = 0, w = 0, s = 0;
    const badIndices = [];

    const resArray = state.answers.map((ans, i) => {
        if(ans === -1) { s++; badIndices.push(state.indices[i]); return -1; }
        const isCorr = ans === state.sessionQuestions[i][2];
        if(isCorr) { c++; return 1; }
        w++; badIndices.push(state.indices[i]); return 0;
    });

    const percent = Math.round((c / n) * 100);

    DB.addHistory({ t: Date.now(), percent, mode: state.modeTitle, c, w, s, n, elapsed, badIndices });
    if(state.runKey && state.runKey.startsWith('b')) {
        DB.setBestBlock(parseInt(state.runKey.substring(1)), percent);
    }

    state.lastResultData = { n, c, w, s, percent, elapsed, resArray, badIndices };
    renderResultView(state.lastResultData);
}

function renderResultView(data) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hide'));
    el('result').classList.remove('hide');
    window.scrollTo(0, 0);

    el('score-percent').textContent = `${data.percent}%`;
    el('kpi-correct').textContent = data.c;
    el('kpi-wrong').textContent = data.w;
    el('kpi-skipped').textContent = data.s;
    el('kpi-time').textContent = formatTime(data.elapsed);

    const gObj = data.percent >= 90 ? { t: 'Yuqori darajadagi o‘zlashtirish', d: 'Barcha asosiy tushunchalar bo‘yicha natijangiz a’lo.' }
               : data.percent >= 70 ? { t: 'Yaxshi natija', d: 'Asosiy mavzular o‘zlashtirilgan, xato qilingan savollarni ko‘rib chiqing.' }
               : data.percent >= 50 ? { t: 'Qoniqarli ko‘rsatkich', d: 'Xatolar tahlili orqali bilimlarni mustahkamlash tavsiya etiladi.' }
               : { t: 'Qo‘shimcha tayyorgarlik zarur', d: 'Quyidagi xatolar ro‘yxatini o‘rganib, testni qayta topshiring.' };

    el('res-greeting').textContent = gObj.t;
    el('res-msg').textContent = gObj.d;

    el('fc-all').textContent = data.w + data.s;
    el('fc-wrong').textContent = data.w;
    el('fc-skipped').textContent = data.s;

    const renderErrors = (filter) => {
        let html = '';
        data.resArray.forEach((status, i) => {
            if(status === 1) return;
            if(filter === 'wrong' && status !== 0) return;
            if(filter === 'skipped' && status !== -1) return;

            const realQIdx = state.indices[i];
            const qData = state.sessionQuestions[i];
            const userAns = state.answers[i];
            const corrAns = qData[2];

            html += `
                <div class="error-item ${status === -1 ? 'skipped' : ''}">
                    <div class="ei-meta">SAVOL ${i+1} &bull; BAZA RAQAMI №${realQIdx+1}</div>
                    <div class="ei-q">${escapeHTML(qData[0])}</div>
                    ${status === -1
                        ? `<div class="ei-ans user-skip">Javob belgilanmagan</div>`
                        : `<div class="ei-ans user-wrong">✕ Sizning javobingiz: <b>${L[userAns]}) ${escapeHTML(qData[1][userAns])}</b></div>`
                    }
                    <div class="ei-ans correct">✓ To‘g‘ri javob: <b>${L[corrAns]}) ${escapeHTML(qData[1][corrAns])}</b></div>
                </div>
            `;
        });
        el('errors-container').innerHTML = html || '<div style="padding: 20px; text-align:center; color: var(--text-muted)">Ushbu toifada savollar mavjud emas.</div>';
    };

    renderErrors('all');

    el('error-filters').onclick = (e) => {
        const btn = e.target.closest('.ft-btn');
        if(!btn) return;
        document.querySelectorAll('.ft-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderErrors(btn.dataset.filter);
    };

    el('btn-retry').onclick = () => {
        if(state.runKey === 'rnd') el('btn-mode-rnd').click();
        else startQuiz(state.modeTitle, [...state.indices], state.isFeedbackMode, state.limit, state.runKey);
    };

    const fixBtn = el('btn-fix-errors');
    if(data.badIndices.length > 0) {
        fixBtn.style.display = 'inline-flex';
        fixBtn.onclick = () => {
            startQuiz('Xatolar ustida ishlash', data.badIndices, true, 0, 'fix');
        };
    } else {
        fixBtn.style.display = 'none';
    }

    el('btn-view-full-stats').onclick = () => switchTab('stats');
    el('btn-home').onclick = () => switchTab('home');

    renderResultCharts(data);
}

function renderResultCharts(data) {
    if(state.charts.resScore) state.charts.resScore.destroy();
    if(state.charts.resTrend) state.charts.resTrend.destroy();
    if(state.charts.resBar) state.charts.resBar.destroy();

    const pal = Theme.palette();
    const ctxScore = el('scoreChart').getContext('2d');
    state.charts.resScore = new Chart(ctxScore, {
        type: 'doughnut',
        data: {
            labels: ['To‘g‘ri', 'Xato', 'O‘tkazilgan'],
            datasets: [{
                data: [data.c, data.w, data.s],
                backgroundColor: [pal.primary, pal.danger, pal.muted],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '76%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    const history = DB.getHistory().slice(-8).reverse();
    const ctxTrend = el('resTrendChart').getContext('2d');
    state.charts.resTrend = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: history.map((_, i) => `#${i+1}`),
            datasets: [{
                label: '%',
                data: history.map(h => h.percent),
                borderColor: pal.primary,
                backgroundColor: pal.primaryFill,
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: pal.grid }, ticks: { color: pal.tick } },
                x: { grid: { color: pal.grid }, ticks: { color: pal.tick } }
            },
            plugins: { legend: { display: false } }
        }
    });

    const groupSize = Math.max(5, Math.ceil(data.n / 5));
    const labels = [];
    const accData = [];
    for(let i=0; i<data.n; i+=groupSize) {
        const end = Math.min(i + groupSize, data.n);
        labels.push(`${i+1}-${end}`);
        const slice = data.resArray.slice(i, end);
        const corrs = slice.filter(x => x===1).length;
        accData.push(Math.round((corrs / slice.length) * 100));
    }

    const ctxBar = el('resBarChart').getContext('2d');
    state.charts.resBar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: accData,
                backgroundColor: accData.map(v => v >= 70 ? pal.primary : pal.blue),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: pal.grid }, ticks: { color: pal.tick } },
                x: { grid: { display: false }, ticks: { color: pal.tick } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
