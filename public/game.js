const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerCounterEl = document.getElementById('player-count');
const loginOverlay = document.getElementById('login-overlay');
const joinBtn = document.getElementById('join-btn');
const nicknameInput = document.getElementById('nickname-input');

let players = [];
let myId = null;
let myPosition = { x: 400, y: 300 };
let keys = {};
let gameState = 'LOBBY';
let currentQuestion = null;
let timeLeft = 0;

if (joinBtn) {
    joinBtn.addEventListener('click', function() {
        const nickname = nicknameInput ? nicknameInput.value.trim() : 'Anonymous';
        myId = socket.id;
        socket.emit('player_join', { nickname: nickname });
        if (loginOverlay) loginOverlay.style.display = 'none';
    });
}

window.addEventListener('keydown', function(e) { keys[e.code] = true; });
window.addEventListener('keyup', function(e) { keys[e.code] = false; });

socket.on('update_players', function(updatedPlayers) {
    players = updatedPlayers;
    if (playerCounterEl) playerCounterEl.innerText = '玩家人數: ' + players.length;
});

socket.on('game_state_toggled', function(data) {
    gameState = data.state;
});

socket.on('new_question', function(q) {
    currentQuestion = q;
});

socket.on('timer_tick', function(d) {
    timeLeft = d.timeLeft;
});

function update() {
    if (!myId || gameState !== 'QUESTION_ACTIVE') return;
    let moved = false;
    const speed = 4;
    if (keys['KeyW'] || keys['ArrowUp'])    { myPosition.y -= speed; moved = true; }
    if (keys['KeyS'] || keys['ArrowDown'])  { myPosition.y += speed; moved = true; }
    if (keys['KeyA'] || keys['ArrowLeft'])  { myPosition.x -= speed; moved = true; }
    if (keys['KeyD'] || keys['ArrowRight']) { myPosition.x += speed; moved = true; }

    if (myPosition.x < 15) myPosition.x = 15;
    if (myPosition.y < 15) myPosition.y = 15;
    if (myPosition.x > canvas.width - 15) myPosition.x = canvas.width - 15;
    if (myPosition.y > canvas.height - 15) myPosition.y = canvas.height - 15;

    if (moved) {
        socket.emit('player_move', { x: myPosition.x, y: myPosition.y });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'FREEZING') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (gameState === 'LOBBY') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    players.forEach(function(p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = (p.id === socket.id) ? 'white' : '#444';
        ctx.lineWidth = (p.id === socket.id) ? 4 : 1;
        ctx.stroke();
        ctx.closePath();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.nickname, p.x, p.y - 25);
    });

    if (currentQuestion) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(100, 20, 600, 80);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(100, 20, 600, 80);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(currentQuestion.questionText, 400, 50);

        ctx.fillStyle = (timeLeft <= 5) ? 'red' : '#ffcc00';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('剩餘時間: ' + timeLeft + 's', 400, 85);
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

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
