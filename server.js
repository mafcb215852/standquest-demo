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
let gameState = 'LOBBY'; // LOBBY, QUESTION_ACTIVE, FREEZING
let timeLeft = 0;
let timerInterval = null;
const players = {};

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

    console.log(`🚀 Starting Question: ${question.questionText}`);

    // Broadcast state change and new question to all clients
    io.emit('game_state_toggled', { state: gameState }); // Using a unique event name for reliability
    io.emit('new_question', { ...question, zones: ZONES });
    io.emit('update_players', Object.values(players));

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
    gameState = 'FREEZING';
    io.emit('game_state_toggled', { state: gameState });
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

    // 3. Transition back after delay
    setTimeout(() => {
        startNextQuestion();
    }, 4000); 
}

// --- Initialize ---
loadQuestions();
app.use(express.static(path.join(__dirname, 'public')));

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
