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

// Canvas 內部渲染解析度（保持 4:3 比例）
const CANVAS_INTERNAL_WIDTH = 800;
const CANVAS_INTERNAL_HEIGHT = 600;

/**
 * 調整 Canvas 大小以適應螢幕
 */
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_INTERNAL_WIDTH;
    canvas.height = CANVAS_INTERNAL_HEIGHT;
    // CSS 縮放到全螢幕
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    
    // 更新邊界檢查用的寬高
    // myPosition 的座標系統維持在 800x600
}

// 初始調整
resizeCanvas();
// 視窗大小改變時重新調整
window.addEventListener('resize', resizeCanvas);

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

// 隱藏積分事件處理
let verdictData = null;
let resultDisplayTimer = null;

socket.on('verdict_reveal', function(data) {
    verdictData = data;
});

socket.on('result_display', function(data) {
    // 回合結束，顯示得分
    if (resultDisplayTimer) clearTimeout(resultDisplayTimer);
    const myPlayer = players.find(p => p.id === socket.id);
    if (myPlayer && verdictData) {
        const hiddenScore = myPlayer.hiddenScore || 0;
        const totalScore = myPlayer.score || 0;
        const inCorrectZone = verdictData.winnersCount > 0;
        
        // 在畫面上顯示得分
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(250, 200, 300, 150);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(250, 200, 300, 150);
        
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('回合結束！', 400, 240);
        
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText(`隱藏積分: ${hiddenScore}`, 400, 280);
        ctx.fillText(`基礎分數: +10`, 400, 310);
        ctx.fillText(`總分: ${totalScore}`, 400, 340);
    }
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
    ctx.clearRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
    if (gameState === 'FREEZING') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
    } else if (gameState === 'LOBBY') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
    } else if (gameState === 'PAUSED') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
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
        // 題目框位置：使用相對於內部解析度的座標
        const titleX = 50;
        const titleY = 15;
        const titleW = 700;
        const titleH = 70;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(titleX, titleY, titleW, titleH);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(titleX, titleY, titleW, titleH);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        // 文字自動換行
        const questionText = currentQuestion.questionText;
        const maxCharsPerLine = 35;
        const lines = [];
        for (let i = 0; i < questionText.length; i += maxCharsPerLine) {
            lines.push(questionText.substring(i, i + maxCharsPerLine));
        }
        lines.forEach(function(line, idx) {
            ctx.fillText(line, titleX + titleW / 2, titleY + 25 + idx * 22);
        });

        ctx.fillStyle = (timeLeft <= 5) ? 'red' : '#ffcc00';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('剩餘時間: ' + timeLeft + 's', titleX + titleW / 2, titleY + titleH - 10);
    }

    if (gameState === 'FREEZING') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
        ctx.fillStyle = 'red';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("TIME'S UP!", CANVAS_INTERNAL_WIDTH / 2, CANVAS_INTERNAL_HEIGHT / 2);
    } else if (gameState === 'PAUSED') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, CANVAS_INTERNAL_WIDTH, CANVAS_INTERNAL_HEIGHT);
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⏸ 暫停中', CANVAS_INTERNAL_WIDTH / 2, CANVAS_INTERNAL_HEIGHT / 2 - 30);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText('等待 GM 繼續...', CANVAS_INTERNAL_WIDTH / 2, CANVAS_INTERNAL_HEIGHT / 2 + 30);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
