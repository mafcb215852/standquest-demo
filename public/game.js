const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerCounterEl = document.getElementById('player-int'); // Wait, I used 'player-count' in HTML
// Let me check the HTML again... Ah, I used 'player-count'. Fixed below.

const playerCounterEl = document.querySelector('#player-count');
const loginOverlay = document.getElementById('login-overlay');
const joinBtn = document.getElementById('join-btn');
const nicknameInput = document.getElementById('nickname-input');

let players = [];
let myId = null;
let myPosition = { x: 400, y: 300 };
let keys = {};

// Game State Variables (Client Side)
let gameState = 'LOBBY';
let currentQuestion = null;
let timeLeft = 0;

// --- Initialization ---
joinBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || 'Anonymous';
    myId = socket.id;
    socket.emit('player_join', { nickname });
    loginOverlay.style.display = 'none';
});

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// --- Socket.io Events ---
socket.on('connect', () => { console.log("Connected to server"); });

socket.on('update_players', (updatedPlayers) => {
    players = updatedPlayers;
    const counter = document.getElementById('player-count');
    if(counter) counter.innerText = `玩家人數: ${players.length}`;
});

socket.on('game_state_change', (data) => {
    gameState = data.state;
    console.log("Game state changed to:", gameState);
});

socket.on('new_question', (question) => {
    currentQuestion = question;
    console.log("New Question received:", question.questionText);
});

socket.on('timer_tick', (data) => {
    timeLeft = data.timeLeft;
});

// --- Game Loop ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (!myId) return;

    // Movement only allowed in QUESTION_ACTIVE state
    if (gameState === 'QUESTION_ACTIVE') {
        let moved = false;
        const speed = 4;

        if (keys['KeyW'] || keys['ArrowUp'])    { myPosition.y -= speed; moved = true; }
        if (keys['KeyS'] || keys['ArrowDown'])  { myPosition.y += speed; moved = true; }
        if (keys['KeyA'] || keys['ArrowLeft'])  { myPosition.x -= speed; moved = true; }
        if (keys['KeyD'] || keys['ArrowRight']) { myPosition.x += speed; moved = true; }

        // Boundary check
        if (myPosition.x < 15) myPosition.x = 15;
        if (myPosition.y < 15) myPosition.y = 15;
        if (myPosition.x > canvas.width - 15) myPosition.x = canvas.width - 15;
        if (myPosition.y > canvas.height - 15) myPosition.y = canvas.height - 15;

        if (moved) {
            socket.emit('player_move', { x: myPosition.x, y: myPosition.y });
        }
    }
}

function draw() {
    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background based on state
    if (gameState === 'FREEZING') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Red tint for freeze
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (gameState === 'LOBBY') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Players
    players.forEach(player => {
        ctx.beginPath();
        ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.strokeStyle = (player.id === socket.id) ? 'white' : '#444';
        ctx.lineWidth = (player.id === socket.id) ? 4 : 1;
        ctx.stroke();
        ctx.closePath();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.nickname, player.x, player.y - 25);
    });

    // Draw Question UI Overlay
    if (currentQuestion) {
        // Question Box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(100, 20, 600, 80);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(100, 20, 600, 80);

        // Question Text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentQuestion.questionText, 400, 50);

        // Timer Text
        ctx.fillStyle = (timeLeft <= 5) ? 'red' : '#ffcc00';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`剩餘時間: ${timeLeft}s`, 400, 85);
    }

    if (gameState === 'FREEZING') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("TIME'S UP!", 400, 300);
    }
}

gameLoop();
