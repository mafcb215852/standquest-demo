const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerCounterEl = document.getElementById('player-count');
const loginOverlay = document.getElementById('login-overlay');
const joinBtn = document.getElementById('join-btn');
const nicknameInput = document.getElementById('nickname-input');

// 虛擬搖桿元素
const joystickContainer = document.getElementById('joystick-container');
const joystickBase = document.getElementById('joystick-base');
const joystickHandle = document.getElementById('joystick-handle');

let players = [];
let myId = null;
let myPosition = { x: 400, y: 300 };
let keys = {};
let gameState = 'LOBBY';
let currentQuestion = null;
let timeLeft = 0;

// 虛擬搖桿狀態
let joystickActive = false;
let joystickDirection = { x: 0, y: 0 }; // -1 到 1 之間的值
const JOYSTICK_MAX_RADIUS = 35; // 控制柄最大移動半徑

if (joinBtn) {
    joinBtn.addEventListener('click', function() {
        const nickname = nicknameInput ? nicknameInput.value.trim() : 'Anonymous';
        myId = socket.id;
        socket.emit('player_join', { nickname: nickname });
        if (loginOverlay) loginOverlay.style.display = 'none';
    });
}

// ==================== 虛擬搖桿功能 ====================

/**
 * 檢測是否為觸控裝置
 */
function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 初始化虛擬搖桿（僅在觸控裝置上）
 */
function initJoystick() {
    if (!isTouchDevice()) {
        joystickContainer.style.display = 'none';
        return;
    }

    // 顯示虛擬搖桿
    joystickContainer.style.display = 'block';

    let startX, startY;

    /**
     * 處理搖桿開始觸控
     */
    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        joystickActive = true;
        updateJoystickPosition(touch.clientX, touch.clientY);
    }

    /**
     * 處理搖桿移動觸控
     */
    function handleTouchMove(e) {
        e.preventDefault();
        if (!joystickActive) return;
        const touch = e.touches[0];
        updateJoystickPosition(touch.clientX, touch.clientY);
    }

    /**
     * 處理搖桿結束觸控
     */
    function handleTouchEnd(e) {
        e.preventDefault();
        joystickActive = false;
        joystickDirection = { x: 0, y: 0 };
        // 重置控制柄位置
        joystickHandle.style.left = '50%';
        joystickHandle.style.top = '50%';
    }

    /**
     * 更新控制柄位置並計算方向
     */
    function updateJoystickPosition(clientX, clientY) {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = clientX - centerX;
        let dy = clientY - centerY;

        // 計算距離並限制在最大半徑內
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > JOYSTICK_MAX_RADIUS) {
            dx = (dx / distance) * JOYSTICK_MAX_RADIUS;
            dy = (dy / distance) * JOYSTICK_MAX_RADIUS;
        }

        // 更新控制柄視覺位置
        joystickHandle.style.left = `calc(50% + ${dx}px)`;
        joystickHandle.style.top = `calc(50% + ${dy}px)`;

        // 計算方向向量（-1 到 1）
        joystickDirection.x = dx / JOYSTICK_MAX_RADIUS;
        joystickDirection.y = dy / JOYSTICK_MAX_RADIUS;
    }

    // 綁定事件監聽器
    joystickBase.addEventListener('touchstart', handleTouchStart, { passive: false });
    joystickBase.addEventListener('touchmove', handleTouchMove, { passive: false });
    joystickBase.addEventListener('touchend', handleTouchEnd, { passive: false });
    joystickBase.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // 也支援滑鼠測試（開發用）
    let mouseDown = false;
    joystickBase.addEventListener('mousedown', (e) => {
        mouseDown = true;
        joystickActive = true;
        updateJoystickPosition(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
        if (!mouseDown || !joystickActive) return;
        updateJoystickPosition(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
        mouseDown = false;
        joystickActive = false;
        joystickDirection = { x: 0, y: 0 };
        joystickHandle.style.left = '50%';
        joystickHandle.style.top = '50%';
    });

    console.log('🎮 虛擬搖桿已啟用');
}

// 初始化搖桿
initJoystick();

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
    if (!myId) return;
    
    // 只有在 QUESTION_ACTIVE 狀態才允許移動（LOBBY 階段自由閒逛，FREEZING 凍結）
    const canMove = gameState === 'QUESTION_ACTIVE';
    let moved = false;
    const speed = 4;
    
    // PC 鍵盤控制
    if (canMove) {
        if (keys['KeyW'] || keys['ArrowUp'])    { myPosition.y -= speed; moved = true; }
        if (keys['KeyS'] || keys['ArrowDown'])  { myPosition.y += speed; moved = true; }
        if (keys['KeyA'] || keys['ArrowLeft'])  { myPosition.x -= speed; moved = true; }
        if (keys['KeyD'] || keys['ArrowRight']) { myPosition.x += speed; moved = true; }
    }
    
    // 虛擬搖桿控制（與鍵盤輸入合併）
    if (joystickActive && (Math.abs(joystickDirection.x) > 0.1 || Math.abs(joystickDirection.y) > 0.1)) {
        myPosition.x += joystickDirection.x * speed;
        myPosition.y += joystickDirection.y * speed;
        moved = true;
    }

    // 邊界檢查
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

    // ==================== 繪製答題區域 ====================
    if (currentQuestion && currentQuestion.zones) {
        const zones = currentQuestion.zones;
        
        // 繪製每個區域的彩色背景
        zones.forEach(function(zone, index) {
            ctx.fillStyle = zone.color || 'rgba(128, 128, 128, 0.3)';
            ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            
            // 區域邊框
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
            ctx.setLineDash([]);
            
            // 區域標籤（A、B、C）
            const labels = ['A', 'B', 'C'];
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(labels[index], zone.x + zone.width / 2, zone.y + zone.height / 2 - 10);
            
            // 區域名稱
            ctx.font = 'bold 18px Arial';
            ctx.fillText(zone.name, zone.x + zone.width / 2, zone.y + zone.height / 2 + 30);
        });
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
