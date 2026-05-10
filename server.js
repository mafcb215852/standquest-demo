const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const QUESTIONS_PATH = path.join(__dirname, 'data', 'questions.json');

// --- Game Configuration ---
const ZONES = [
    { id: 0, name: 'Zone A', x: 0, y: 400, width: 266, height: 200, color: 'rgba(255, 0, 0, 0.3)' },
    { id: 1, name: 'Zone B', x: 267, y: 400, width: 266, height: 200, color: 'rgba(0, 255, 0, 0.3)' },
    { id: 2, name: 'Zone C', x: 534, y: 400, width: 266, height: 200, color: 'argba(0, 0, 255, 0.3)' }
];

// Re-fix ZONES color string typo (argba -> rgba)
ZONES[2].color = 'rgba(0, 0, 255, 0.3)';

// --- Game State ---
let questions = [];
let currentQuestionIndex = -1;
let gameState = 'LOBBY'; // LOBBY, QUESTION_ACTIVE, FREEZING, RESULT_DISPLAY, PAUSED
let timeLeft = 0;
let originalTimeLimit = 0;
let timerInterval = null;
let resultTimeout = null;
const players = {};

// --- Broadcast GM status to all connected clients ---
function broadcastGMStatus() {
    io.emit('gm_status_update', {
        state: gameState,
        currentQuestionIndex: currentQuestionIndex,
        currentQuestion: currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null,
        totalQuestions: questions.length,
        playerCount: Object.keys(players).length,
        timeLeft: gameState === 'QUESTION_ACTIVE' ? timeLeft : 0
    });
}

// --- Functions ---

function loadQuestions() {
    try {
        if (fs.existsSync(QUESTIONS_PATH)) {
            const data = fs.readFileSync(QUESTIONS_PATH, 'utf8');
            questions = JSON.parse(data);
            console.log(`✅ Loaded ${questions.length} questions.`);
        } else {
            console.error("❌ Questions file not found.");
        }
    } catch (err) {
        console.error("❌ Failed to load questions:", err.message);
    }
}

function startNextQuestion() {
    if (questions.length === 0) return;

    currentQuestionIndex = (currentQuestionIndex + 1) % questions.length;
    const question = questions[currentQuestionIndex];
    
    gameState = 'QUESTION_ACTIVE';
    timeLeft = question.timeLimit;
    originalTimeLimit = question.timeLimit;
    if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }

    console.log(`🚀 Starting Question: ${question.questionText}`);

    // Broadcast state change and new question to all clients
    io.emit('game_state_toggled', { state: gameState });
    io.emit('new_question', { ...question, zones: ZONES });
    io.emit('update_players', Object.values(players));
    broadcastGMStatus();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        io.emit('timer_tick', { timeLeft });

        if (timeLeft <= 0) {
            handleTimerEnd();
        }
    }, 1000);
}

function handleTimerEnd() {
    clearInterval(timerInterval);
    timerInterval = null;
    gameState = 'FREEZING';
    io.emit('game_state_toggled', { state: gameState });
    broadcastGMStatus();
    console.log("🛑 Time's up! Freezing players...");

    // 1. Evaluate Scores
    const currentQ = questions[currentQuestionIndex];
    const correctZoneId = currentQ.correctIndex;
    let winnersCount = 0;

    Object.values(players).forEach(player => {
        const targetZone = ZONES[correctZoneId];
        if (player.x >= targetZone.x && 
            player.x <= targetZone.x + targetZone.width &&
            player.y >= targetZone.y && 
            player.y <= targetZone.y + targetZone.height) {
            player.score = (player.score || 0) + 10;
            winnersCount++;
        }
    });

    // 2. Broadcast Verdict
    io.emit('verdict_reveal', {
        correctIndex: correctZoneId,
        winnersCount: winnersCount
    });
    io.emit('update_players', Object.values(players));

    console.log(`✅ Verdict: Zone ${ZONES[correctZoneId].name} was right. Winners: ${winnersCount}`);

    // 3. 延遲後進入 RESULT_DISPLAY
    resultTimeout = setTimeout(() => {
        gameState = 'RESULT_DISPLAY';
        broadcastGMStatus();
        // 在 RESULT_DISPLAY 停留 4 秒後自動下一題
        setTimeout(() => {
            startNextQuestion();
        }, 4000);
    }, 3000);
}

// --- Initialize ---
loadQuestions();
app.use(express.static(path.join(__dirname, 'public')));

// --- GM Control API ---

// GET /api/gm/status — 返回當前遊戲狀態給 GM 控制台
app.get('/api/gm/status', (req, res) => {
    res.json({
        state: gameState,
        currentQuestionIndex: currentQuestionIndex,
        currentQuestion: currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null,
        totalQuestions: questions.length,
        playerCount: Object.keys(players).length,
        timeLeft: gameState === 'QUESTION_ACTIVE' ? timeLeft : 0,
        players: Object.values(players)
    });
});

// POST /api/gm/start — 從 LOBBY 開始第一題
app.post('/api/gm/start', (req, res) => {
    if (gameState !== 'LOBBY') {
        return res.status(400).json({ message: `無法開始：目前狀態為 ${gameState}` });
    }
    if (questions.length === 0) {
        return res.status(400).json({ message: '題目列表為空' });
    }
    startNextQuestion();
    res.json({ message: '遊戲已開始' });
});

// POST /api/gm/next — 下一題
app.post('/api/gm/next', (req, res) => {
    if (gameState === 'QUESTION_ACTIVE' || gameState === 'FREEZING') {
        // 如果正在進行中，先清除計時器
        clearInterval(timerInterval);
        timerInterval = null;
        if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
    }
    startNextQuestion();
    res.json({ message: '已觸發下一題' });
});

// POST /api/gm/pause — 暫停遊戲
app.post('/api/gm/pause', (req, res) => {
    if (gameState === 'QUESTION_ACTIVE') {
        clearInterval(timerInterval);
        timerInterval = null;
        gameState = 'PAUSED';
        io.emit('game_state_toggled', { state: gameState });
        io.emit('gm_paused', { message: '遊戲已暫停' });
        broadcastGMStatus();
        console.log('⏸ Game paused by GM');
    } else if (gameState === 'FREEZING') {
        if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
        gameState = 'PAUSED';
        io.emit('game_state_toggled', { state: gameState });
        io.emit('gm_paused', { message: '遊戲已暫停' });
        broadcastGMStatus();
        console.log('⏸ Game paused by GM (during freezing)');
    } else if (gameState === 'RESULT_DISPLAY') {
        if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
        gameState = 'PAUSED';
        io.emit('game_state_toggled', { state: gameState });
        io.emit('gm_paused', { message: '遊戲已暫停' });
        broadcastGMStatus();
        console.log('⏸ Game paused by GM (during result display)');
    } else {
        return res.status(400).json({ message: `無法暫停：目前狀態為 ${gameState}` });
    }
    res.json({ message: '遊戲已暫停' });
});

// POST /api/gm/resume — 繼續遊戲
app.post('/api/gm/resume', (req, res) => {
    if (gameState !== 'PAUSED') {
        return res.status(400).json({ message: `無法繼續：目前狀態為 ${gameState}` });
    }
    // 恢復時回到 QUESTION_ACTIVE，使用 originalTimeLimit
    gameState = 'QUESTION_ACTIVE';
    timeLeft = originalTimeLimit || 15;
    io.emit('game_state_toggled', { state: gameState });
    io.emit('timer_tick', { timeLeft });
    io.emit('gm_resumed', { message: '遊戲已繼續' });
    broadcastGMStatus();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        io.emit('timer_tick', { timeLeft });
        if (timeLeft <= 0) handleTimerEnd();
    }, 1000);

    console.log('▶ Game resumed by GM');
    res.json({ message: '遊戲已繼續' });
});

// POST /api/gm/skip-verdict — 跳過判定，直接進入結果顯示
app.post('/api/gm/skip-verdict', (req, res) => {
    if (gameState !== 'FREEZING') {
        return res.status(400).json({ message: `無法跳過：目前狀態為 ${gameState}` });
    }
    if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
    gameState = 'RESULT_DISPLAY';
    io.emit('game_state_toggled', { state: gameState });
    broadcastGMStatus();
    console.log('⏭ Skipped verdict phase');
    res.json({ message: '已跳過判定' });
});

// POST /api/gm/skip-result — 跳過結果顯示，立即下一題
app.post('/api/gm/skip-result', (req, res) => {
    if (gameState !== 'RESULT_DISPLAY') {
        return res.status(400).json({ message: `無法跳過：目前狀態為 ${gameState}` });
    }
    if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
    startNextQuestion();
    res.json({ message: '已跳過結果顯示，進入下一題' });
});

// POST /api/gm/freeze — 強制凍結（立即進入判定）
app.post('/api/gm/freeze', (req, res) => {
    if (gameState !== 'QUESTION_ACTIVE') {
        return res.status(400).json({ message: `無法強制凍結：目前狀態為 ${gameState}` });
    }
    clearInterval(timerInterval);
    timerInterval = null;
    handleTimerEnd();
    res.json({ message: '已強制凍結' });
});

// POST /api/gm/clear-scores — 清空所有玩家分數
app.post('/api/gm/clear-scores', (req, res) => {
    Object.values(players).forEach(p => { p.score = 0; });
    io.emit('update_players', Object.values(players));
    broadcastGMStatus();
    console.log('🗑 Scores cleared');
    res.json({ message: '所有玩家分數已清空' });
});

// POST /api/gm/set-time — 設定自訂倒數時間
app.post('/api/gm/set-time', (req, res) => {
    if (gameState !== 'QUESTION_ACTIVE') {
        return res.status(400).json({ message: `無法設定時間：目前狀態為 ${gameState}` });
    }
    const seconds = req.body.seconds;
    if (!seconds || seconds < 3 || seconds > 120) {
        return res.status(400).json({ message: '時間必須在 3-120 秒之間' });
    }
    originalTimeLimit = seconds;
    timeLeft = seconds;
    io.emit('timer_tick', { timeLeft });
    broadcastGMStatus();
    console.log(`⏱ Time set to ${seconds}s`);
    res.json({ message: `時間已設定為 ${seconds} 秒` });
});

// POST /api/gm/add-time — 加時 10 秒
app.post('/api/gm/add-time', (req, res) => {
    if (gameState !== 'QUESTION_ACTIVE') {
        return res.status(400).json({ message: `無法加時：目前狀態為 ${gameState}` });
    }
    timeLeft += 10;
    originalTimeLimit += 10;
    io.emit('timer_tick', { timeLeft });
    broadcastGMStatus();
    console.log(`⏱ +10s added, now ${timeLeft}s`);
    res.json({ message: `已加時 10 秒，剩餘 ${timeLeft} 秒` });
});

// POST /api/gm/reset — 重置遊戲
app.post('/api/gm/reset', (req, res) => {
    clearInterval(timerInterval);
    timerInterval = null;
    if (resultTimeout) { clearTimeout(resultTimeout); resultTimeout = null; }
    currentQuestionIndex = -1;
    gameState = 'LOBBY';
    timeLeft = 0;
    Object.values(players).forEach(p => { p.score = 0; });
    io.emit('game_state_toggled', { state: gameState });
    io.emit('update_players', Object.values(players));
    io.emit('gm_reset', { message: '遊戲已重置' });
    broadcastGMStatus();
    console.log('🔄 Game reset by GM');
    res.json({ message: '遊戲已重置' });
});

// POST /api/gm/reload — 重新載入題目
app.post('/api/gm/reload', (req, res) => {
    loadQuestions();
    res.json({ message: `已重新載入 ${questions.length} 題題目` });
});

// --- Legacy API (backward compatibility) ---
// API for GM (Admin Control)
app.get('/api/game/next', (req, res) => {
    startNextQuestion();
    res.json({ message: "Next question triggered" });
});

app.post('/api/game/reload', (req, res) => {
    loadQuestions();
    res.json({ message: "Questions reloaded" });
});

// --- Socket.io Logic ---
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on('player_join', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || 'Anonymous',
            x: 400,
            y: 300,
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            score: 0
        };
        console.log(`Player joined: ${players[socket.id].nickname}`);
        io.emit('update_players', Object.values(players));
    });

    socket.on('player_move', (data) => {
        if (!players[socket.id]) return;
        
        // 只有在 QUESTION_ACTIVE 狀態才允許移動（LOBBY 階段自由閒逛，FREEZING 凍結）
        const canMove = gameState === 'QUESTION_ACTIVE';
        if (canMove) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit('update_players', Object.values(players));
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('update_players', Object.values(players));
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
