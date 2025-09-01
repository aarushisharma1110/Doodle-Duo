const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get("room");
const playerNumber = urlParams.get("player");

// Connect to Firebase
const db = firebase.database();
const roomRef = db.ref(`rooms/${roomCode}`);

const wordBank = [
  "apple", "banana", "car", "dog", "elephant", "flower", "orange",
  "guitar", "pencil", "house", "ice cream", "jungle", "kite", "lion",
  "mountain", "notebook", "ocean", "pizza", "queen", "rainbow", "sun",
  "tree", "umbrella", "violin", "watermelon", "zebra","robot", "castle", "spaceship", "ghost", "dragon", "snowman",
  "firetruck", "crown", "moon", "glasses", "rocket", "train",
  "cactus", "bicycle", "clock", "cloud", "ladder", "toothbrush","television","bed", "chair", "water bottle", "scissor", "spoon", "remote", "t-shirt", "shirt", "jeans", "shoes", "laptop", "vacuum", "jellyfish", "pyramid", "crown", "robot", "airplane", "hat", "balloon", "book", "heart", "pyramid", "tornado", "maze", "skateboard", "dragon", "lighthouse", "spaceship", "bin"
];

// Game state
let canvas, context;
let isDrawing = false;
let lastX = 0, lastY = 0;
let drawingHistory = [];
let historyIndex = -1;
let currentDrawer = 1;
let currentWord = "";
let isDrawer = false;
let p1Score = 0, p2Score = 0;
let currentRound = 1;
let timer;
let timeLeft = 60;
const drawerPoints = 20;
const guesserPoints = 30;
let player1Name = "Player 1";
let player2Name = "Player 2";
const CONNECTION_TIMEOUT = 10000;

// Initialize game
function init() {
    canvas = document.getElementById('drawingCanvas');
    context = canvas.getContext('2d');
    
    // Set initial drawing styles
    context.strokeStyle = '#000000';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    // Set up event listeners
    setupEventListeners();
    resizeCanvas();
    roomRef.update({
        timerRunning: false
    });

    // Initialize game state
    document.getElementById('currentRoomCode').textContent = roomCode;
    document.getElementById('loadingOverlay').style.display = 'flex';
    
    // Add connection state check
    const connectedRef = firebase.database().ref(".info/connected");
    const connectionTimeout = setTimeout(() => {
        document.getElementById('loadingOverlay').querySelector('p').textContent = 
            'Connection timed out. Please refresh the page.';
    }, CONNECTION_TIMEOUT);

    connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
            clearTimeout(connectionTimeout);
            roomRef.once('value')
                .then((snapshot) => {
                    if (!snapshot.exists() || !snapshot.val().gameStarted) {
                        // If game hasn't properly started, go back to waiting room
                        window.location.href = `waitingRoom.html?room=${roomCode}&player=${playerNumber}`;
                        return;
                    }
                    
                    document.getElementById('loadingOverlay').style.display = 'none';
                    initializeGame(snapshot);
                })
                .catch((error) => {
                    document.getElementById('loadingOverlay').style.display = 'none';
                    console.error("Firebase error:", error);
                    alert('Connection failed. Please refresh the page.');
                });
        }
    });
}

function setupEventListeners() {
    // Drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', drawing);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    // Tool events
    document.getElementById('colorPicker').addEventListener('change', (e) => {
        context.strokeStyle = e.target.value;
    });
    document.getElementById('brushSize').addEventListener('change', (e) => {
        context.lineWidth = e.target.value;
    });
    document.getElementById('clearCanvas').addEventListener('click', clearCanvas);
    document.getElementById('undo').addEventListener('click', undoLastAction);

    // Clear canvas listener
    roomRef.child('clearActions').on('child_added', (snapshot) => {
        if (snapshot.val().player !== playerNumber) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            saveDrawingState();
        }
    });

    roomRef.child('undoActions').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.player !== playerNumber) {
            undoLastAction();
        }
    });
 
    // Chat events
    document.getElementById('sendMessage').addEventListener('click', sendMessage);
    document.getElementById('MessageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Continue button - fixed event delegation
    document.getElementById('roundResultPopup').addEventListener('click', (e) => {
        if (e.target.id === 'continueButton') {
            continueToNextRound();
        }
    });
}

function initializeGame(snapshot) {
    const data = snapshot.val();
    currentDrawer = data.currentDrawer || 1;
    isDrawer = currentDrawer.toString() === playerNumber;

    // Get player names if they exist
    if (data.players) {
        player1Name = data.players['1']?.name || "Player 1";
        player2Name = data.players['2']?.name || "Player 2";
        updatePlayerNames();
    }
    
    updatePlayerStatus();
    updateUIForPlayerRole();
    
    // Set current round
    if (data.currentRound) {
        currentRound = data.currentRound;
        document.getElementById('currentRound').textContent = currentRound;
    }
    
    if (data.wordSelected) {
        // Word is already selected
        if (data.currentWord && data.currentWord !== 'HIDDEN') {
            currentWord = data.currentWord;
            updateWordDisplay();
            if (isDrawer && data.timerRunning) {
                startTimer();
            }
        } else {
            // For guesser
            document.getElementById('wordToDraw').textContent = '_ '.repeat(currentWord.length);
            document.getElementById('wordToDraw').classList.add('word-blank');
        }
    } else if (isDrawer) {
        // Only show word selection if this player is the drawer and no word is selected
        selectWord();
    } else {
        document.getElementById('wordToDraw').textContent = 'Waiting for word selection...';
        document.getElementById('wordToDraw').classList.add('word-blank');
    }
    
    if (data.players) {
        p1Score = data.players['1']?.score || 0;
        p2Score = data.players['2']?.score || 0;
        updateScoreDisplay();
    }
    
    // Check if timer is already running
    if (data.timerRunning && isDrawer && data.timerStart) {
        const startTime = data.timerStart;
        const duration = data.timerDuration || 60;
        const elapsed = (Date.now() - startTime) / 1000;
        timeLeft = Math.max(0, Math.floor(duration - elapsed));
        updateTimerDisplay();
        
        if (timeLeft > 0) {
            startTimer();
        }
    }
    
    setupFirebaseListeners();
}

function setupFirebaseListeners() {
    // Drawing sync
    roomRef.child('drawing').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.player !== playerNumber) {
            context.strokeStyle = data.color;
            context.lineWidth = data.width;
            context.beginPath();
            context.moveTo(data.startX, data.startY);
            context.lineTo(data.endX, data.endY);
            context.stroke();
        }
    });
    
    // Correct guess handling
    roomRef.child('correctGuess').on('value', handleCorrectGuess);
    
    // Score updates
    roomRef.child('players').on('value', (snapshot) => {
        const players = snapshot.val();
        if (players) {
            p1Score = players['1']?.score || 0;
            p2Score = players['2']?.score || 0;
            updateScoreDisplay();
        }
    });
    
    // Chat messages
    roomRef.child('messages').on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayMessage(message);
    });
    
    roomRef.child('currentWord').on('value', (snapshot) => {
        const word = snapshot.val();
        if (word && word !== 'HIDDEN') {
            currentWord = word;
            updateWordDisplay();
            
            // Only start timer if this player is the drawer
            if (isDrawer) {
                startTimer();
            }
        }
    });
    
    // Listener for word selection state
    roomRef.child('wordSelected').on('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val() === true) {
            // If word is selected and this player is not drawer, update display
            if (!isDrawer) {
                document.getElementById('wordToDraw').textContent = '_ '.repeat(currentWord.length);
                document.getElementById('wordToDraw').classList.add('word-blank');
            }
        }
    });
  
    // Timer synchronization
    roomRef.child('timerStart').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const startTime = snapshot.val();
            roomRef.child('timerDuration').once('value').then((durSnap) => {
                const duration = durSnap.val() || 60;
                const elapsed = (Date.now() - startTime) / 1000;
                // Round to avoid decimal precision issues
                timeLeft = Math.max(0, Math.floor(duration - elapsed));
                
                // Update timer display for all players
                updateTimerDisplay();
                
                // Only start timer if this player is the drawer and time is left
                if (isDrawer && timeLeft > 0) {
                    // Clear any existing timer first
                    clearInterval(timer);
                    // Start the timer
                    timer = setInterval(() => {
                        timeLeft--;
                        
                        // Prevent negative time and ensure whole numbers
                        if (timeLeft < 0) {
                            timeLeft = 0;
                            clearInterval(timer);
                            handleTimeOut();
                            roomRef.update({
                                timerRunning: false,
                                currentTimeLeft: 0
                            });
                            return;
                        }
                        
                        updateTimerForAllPlayers();

                        if (timeLeft <= 0) {
                            clearInterval(timer);
                            handleTimeOut();
                            roomRef.update({
                                timerRunning: false,
                                currentTimeLeft: 0
                            });
                        }
                    }, 1000);
                }
            });
        }
    });

    roomRef.child('currentTimeLeft').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const newTimeLeft = snapshot.val();
            
            // If time reaches 0 for any player, show time's up
            if (newTimeLeft === 0 && timeLeft > 0) {
                timeLeft = 0;
                updateTimerDisplay();
                
                // Show time's up message for guessers too
                if (!isDrawer) {
                    // Create a temporary notification for guessers
                    const timerElement = document.getElementById('timer');
                    timerElement.textContent = "Time's Up!";
                    timerElement.style.color = '#dc3545';
                    timerElement.style.fontWeight = 'bold';
                    
                    // Show a brief notification for guessers
                    setTimeout(() => {
                        updateTimerDisplay(); // Restore normal display
                    }, 2000);
                }
            } else if (!isDrawer) {
                timeLeft = newTimeLeft;
                updateTimerDisplay();
            }
        }
    });
    
    // Listen for timer stop (when correct guess is made)
    roomRef.child('timerRunning').on('value', (snapshot) => {
        if (snapshot.exists() && snapshot.val() === false) {
            clearInterval(timer);
        }
    });
}

function updateTimerForAllPlayers() {
    // Ensure we're working with whole numbers
    timeLeft = Math.max(0, Math.floor(timeLeft));
    
    // Update the timer display
    updateTimerDisplay();
    
    // Also update Firebase so other players can sync
    if (isDrawer) {
        roomRef.update({
            currentTimeLeft: timeLeft
        });
    }
}

function updatePlayerNames() {
    document.getElementById('player1Name').textContent = player1Name;
    document.getElementById('player2Name').textContent = player2Name;
    
    // Update chat messages display
    const messages = document.querySelectorAll('.message .player-name');
    messages.forEach(el => {
        if (el.textContent.includes('Player 1')) {
            el.textContent = player1Name + ':';
        } else if (el.textContent.includes('Player 2')) {
            el.textContent = player2Name + ':';
        }
    });
}

function updatePlayerStatus() {
    const statusElement = document.getElementById('playerStatus');
    statusElement.textContent = isDrawer 
        ? `You are drawing` 
        : `You are guessing`;
}

function updateUIForPlayerRole() {
    if (isDrawer) {
        canvas.style.cursor = 'crosshair';
        document.getElementById('drawingTools').style.display = 'flex';
    } else {
        canvas.style.cursor = 'not-allowed';
        document.getElementById('drawingTools').style.display = 'none';
    }
}

function updateWordDisplay() {
    const wordDisplay = document.getElementById('wordToDraw');
    if (isDrawer) {
        wordDisplay.textContent = `Draw: ${currentWord}`;
        wordDisplay.classList.remove('word-blank');
    } else {
        wordDisplay.textContent = '_ '.repeat(currentWord.length);
        wordDisplay.classList.add('word-blank');
    }
}

// Drawing functions
function startDrawing(e) {
    if (!isDrawer) return;
    isDrawing = true;
    [lastX, lastY] = getPosition(e);
    saveDrawingState();
}

function drawing(e) {
    if (!isDrawing || !isDrawer) return;
    const [x, y] = getPosition(e);
    
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
    
    sendDrawingData(lastX, lastY, x, y);
    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function getPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;    // Scale factor for X
    const scaleY = canvas.height / rect.height;  // Scale factor for Y
    
    // Handle both mouse and touch events
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    return [
        (clientX - rect.left) * scaleX,
        (clientY - rect.top) * scaleY
    ];
}

function handleTouchStart(e) {
    if (!isDrawer) return;
    e.preventDefault();
    const [x, y] = getPosition(e);
    
    // Simulate mouse events with correct coordinates
    const mouseDown = new MouseEvent('mousedown', {
        clientX: x,
        clientY: y
    });
    canvas.dispatchEvent(mouseDown);
    
    document.body.style.overflow = 'hidden';
}

function handleTouchMove(e) {
    if (!isDrawer) return;
    e.preventDefault();
    const [x, y] = getPosition(e);
    
    const mouseMove = new MouseEvent('mousemove', {
        clientX: x,
        clientY: y
    });
    canvas.dispatchEvent(mouseMove);
}

function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
    
    // Re-enable scrolling
    document.body.style.overflow = '';
}

// Drawing tools
function saveDrawingState() {
    drawingHistory = drawingHistory.slice(0, historyIndex + 1);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    drawingHistory.push(imageData);
    historyIndex = drawingHistory.length - 1;
}

function undoLastAction() {
    if (historyIndex <= 0) {
        clearCanvas(); // This will sync the clear
    } else {
        historyIndex--;
        context.putImageData(drawingHistory[historyIndex], 0, 0);
        
        // Send undo action to Firebase
        roomRef.child('undoActions').push({
            player: playerNumber,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

function clearCanvas() {
    // Clear locally first for immediate feedback
    context.clearRect(0, 0, canvas.width, canvas.height);
    saveDrawingState();
    
    // Send clear action to Firebase
    roomRef.child('clearActions').push({
        player: playerNumber,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // After sending, we can clear the local clearActions to prevent buildup
        roomRef.child('clearActions').remove();
    });
}

function sendDrawingData(startX, startY, endX, endY) {
    roomRef.child('drawing').push({
        player: playerNumber,
        startX, startY, endX, endY,
        color: context.strokeStyle,
        width: context.lineWidth,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

// Game logic
function selectWord() {
    if (isDrawer) {
        showWordChoicePopup();
    } else {
        document.getElementById('wordToDraw').textContent = 'Waiting for word selection...';
        document.getElementById('wordToDraw').classList.add('word-blank');
    }
}

function showWordChoicePopup() {
    const word1 = wordBank[Math.floor(Math.random() * wordBank.length)];
    let word2;
    do {
        word2 = wordBank[Math.floor(Math.random() * wordBank.length)];
    } while (word2 === word1);
    
    document.getElementById('wordOption1').textContent = word1;
    document.getElementById('wordOption2').textContent = word2;
    
    document.getElementById('wordOption1').onclick = () => chooseWord(word1);
    document.getElementById('wordOption2').onclick = () => chooseWord(word2);
    
    // Show with animation
    const popup = document.getElementById('wordChoicePopup');
    const content = popup.querySelector('.popup-content');
    
    content.classList.remove('show');
    void content.offsetWidth; // Trigger reflow
    content.classList.add('show');
    
    popup.classList.remove('hidden');
}

function chooseWord(word) {
    currentWord = word;
    document.getElementById('wordChoicePopup').classList.add('hidden');
    
    // Update Firebase with the selected word
    roomRef.update({
        currentWord: word,
        wordSelected: true,
        drawing: {}, // Clear previous drawing
        clearActions: {}, // Clear any existing clear actions
        undoActions: {},
        timerStart: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        updateWordDisplay();
        startTimer();
    });
}

function startTimer() {
    clearInterval(timer);
    timeLeft = 60;
    updateTimerForAllPlayers();

    // Only the drawer should control the timer
    if (isDrawer) {
        // Set the start time in Firebase for synchronization
        roomRef.update({
            timerStart: firebase.database.ServerValue.TIMESTAMP,
            timerDuration: 60,
            timerRunning: true,
            currentTimeLeft: timeLeft
        }).then(() => {
            // Start the timer interval
            timer = setInterval(() => {
                timeLeft--;
                updateTimerForAllPlayers();

                if (timeLeft <= 0) {
                    clearInterval(timer);
                    handleTimeOut();
                    // Update Firebase to indicate timer has stopped
                    roomRef.update({
                        timerRunning: false
                    });
                }
            }, 1000);
        });
    }
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    // Round to nearest whole number to avoid decimal values
    const displayTime = Math.max(0, Math.round(timeLeft));
    timerElement.textContent = `Time: ${displayTime}s`;
    
    // Add warning styling when time is low
    if (timeLeft <= 10) {
        timerElement.style.color = '#dc3545';
        timerElement.style.fontWeight = 'bold';
        timerElement.classList.add('warning');
    } else {
        timerElement.style.color = '#333';
        timerElement.style.fontWeight = 'normal';
        timerElement.classList.remove('warning');
    }
}

function handleTimeOut() {
    // Ensure timeLeft is not negative
    const validTimeLeft = Math.max(0, timeLeft);
    const drawerPointsEarned = drawerPoints;
    
    // Update scores locally
    if (currentDrawer === 1) {
        p1Score += drawerPointsEarned;
    } else {
        p2Score += drawerPointsEarned;
    }
    
    // Update Firebase - this will trigger the time's up notification for all players
    roomRef.update({
        'players/1/score': p1Score,
        'players/2/score': p2Score,
        timerRunning: false,
        currentTimeLeft: 0
    }).then(() => {
        // Show timeout message - pass the correct points values
        showRoundResult(
            'Time\'s Up! ⏰',
            `The word was: ${currentWord}`,
            currentDrawer === 1 ? drawerPointsEarned : 0,
            currentDrawer === 2 ? drawerPointsEarned : 0
        );
    });
}

// Score and round management
function updateScoreDisplay() {
    document.getElementById('player1Score').textContent = p1Score;
    document.getElementById('player2Score').textContent = p2Score;
}

function updateRoundCounter() {
    document.getElementById('currentRound').textContent = currentRound;
    currentRound++;
    checkGameOver();
}

function checkGameOver() {
    if (currentRound > 3) {
        roomRef.once('value').then(snapshot => {
            const players = snapshot.val().players;
            showGameOverScreen({
                '1': players['1'].score,
                '2': players['2'].score
            });
        });
    }
}

function handleCorrectGuess(snapshot) {
    if (!snapshot.exists()) return;
    
    const data = snapshot.val();
    if (data.word !== currentWord) return;

    // Prevent negative time from affecting scores
    const validTimeLeft = Math.max(0, timeLeft);
    const guesserPointsEarned = calculateScore(validTimeLeft);
    const drawerPointsEarned = 20 + Math.floor(guesserPointsEarned * 0.5);
    
    // Update scores locally first for immediate feedback
    if (data.player === '1') {
        // Player 1 guessed correctly
        p1Score += guesserPointsEarned; // Player 1 gets guesser points
        p2Score += drawerPointsEarned;  // Player 2 gets drawer points
    } else {
        // Player 2 guessed correctly
        p2Score += guesserPointsEarned; // Player 2 gets guesser points
        p1Score += drawerPointsEarned;  // Player 1 gets drawer points
    }
    
    // Stop the timer immediately
    clearInterval(timer);
    
    // Update Firebase to stop timer for all players and sync final time
    roomRef.update({
        timerRunning: false,
        currentTimeLeft: validTimeLeft
    }).then(() => {
        // Show round result - pass the correct points values
        showRoundResult(
            `${data.player === '1' ? player1Name : player2Name} guessed correctly!`,
            `The word was: ${currentWord}`,
            data.player === '1' ? guesserPointsEarned : drawerPointsEarned,
            data.player === '2' ? guesserPointsEarned : drawerPointsEarned
        );
        
        // Update scores in Firebase
        roomRef.update({
            'players/1/score': p1Score,
            'players/2/score': p2Score,
            correctGuess: null
        });
    });
}

function calculateScore(timeLeft) {
    const baseScore = 30;
    const validTimeLeft = Math.max(0, timeLeft); // Ensure no negative time
    const timeBonus = Math.floor(validTimeLeft / 5);
    return baseScore + timeBonus;
}    

function validateTimer() {
    if (timeLeft < 0) {
        console.warn("Timer validation: Correcting negative time value");
        timeLeft = 0;
        updateTimerDisplay();
        
        // Sync the correction with Firebase
        if (isDrawer) {
            roomRef.update({
                currentTimeLeft: 0
            });
        }
    }
}

// Call the validation function periodically
setInterval(validateTimer, 1000);

function showRoundResult(title, message, p1PointsEarned, p2PointsEarned) {
    const popup = document.getElementById('roundResultPopup');
    const popupContent = popup.querySelector('.popup-content');
    
    popupContent.innerHTML = `
        <div class="result-header">
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
            <div class="confetti"></div>
            <h3>${title}</h3>
        </div>
        <div class="result-body">
            <p class="revealed-word">The word was: <span class="word-highlight">${currentWord}</span></p>
            
            <div class="points-breakdown">
                <div class="player-points ${playerNumber === '1' ? 'highlight' : ''}">
                    <span class="player-name">${player1Name}</span>
                    <span class="points-badge">+${p1PointsEarned}</span>
                </div>
                <div class="player-points ${playerNumber === '2' ? 'highlight' : ''}">
                    <span class="player-name">${player2Name}</span>
                    <span class="points-badge">+${p2PointsEarned}</span>
                </div>
            </div>
            
            <div class="total-scores">
                <div class="score-display">
                    <span>${player1Name}</span>
                    <span class="score-value">${p1Score}</span>
                </div>
                <div class="score-display">
                    <span>${player2Name}</span>
                    <span class="score-value">${p2Score}</span>
                </div>
            </div>
        </div>
        <button id="continueButton" class="glow-button">Continue →</button>
    `;

    // Show popup with animation
    popup.classList.remove('hidden');
    setTimeout(() => {
        popup.classList.add('visible');
    }, 10);
    
    // Add confetti effect
    createConfetti();
}

function createConfetti() {
    const confettiContainer = document.querySelector('.result-header');
    const colors = ['#00b4d8', '#0077b6', '#ff6b6b', '#4ecdc4', '#ffd166'];
    
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animation = `confettiFall ${Math.random() * 2 + 1}s ease-out forwards`;
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confettiContainer.appendChild(confetti);
    }
}

function continueToNextRound() {
    document.getElementById('roundResultPopup').classList.add('hidden');
    clearInterval(timer);
    
    // Switch drawer role
    currentDrawer = currentDrawer === 1 ? 2 : 1;
    isDrawer = currentDrawer.toString() === playerNumber;
    
    // Update Firebase with new drawer and clear word
    roomRef.update({
        currentDrawer: currentDrawer,
        currentRound: currentRound,
        currentWord: '',
        wordSelected: false,
        correctGuess: null,
        drawing: {},
        clearActions: {},
        undoActions: {},
        timerStart: null,
        timerRunning: false
    }).then(() => {
        updatePlayerStatus();
        updateUIForPlayerRole();
        
        // Only show word selection if this player is now the drawer
        if (isDrawer) {
            selectWord();
        } else {
            document.getElementById('wordToDraw').textContent = 'Waiting for word selection...';
            document.getElementById('wordToDraw').classList.add('word-blank');
        }
        
        updateRoundCounter();
        clearCanvas();
    });
}

function showGameOverScreen(scores) {
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    
    // Determine winner message
    let resultText;
    if (scores['1'] > scores['2']) {
        resultText = playerNumber === '1' ? ' You win! ✨' : `${player1Name} wins!`;
    } else if (scores['2'] > scores['1']) {
        resultText = playerNumber === '2' ? ' You win! ✨' : `${player2Name} wins!`;
    } else {
        resultText = '🤝 It\'s a tie!';
    }

    overlay.innerHTML = `
        <div class="game-over-content">
            <h2> Game Over! </h2>
            <div class="final-scores">
                <p>🏆 <strong>Final Scores:</strong></p>
                <p>${player1Name} (${playerNumber === '1' ? 'You' : 'Opponent'}): <strong>${scores['1']}</strong> points</p>
                <p>${player2Name} (${playerNumber === '2' ? 'You' : 'Opponent'}): <strong>${scores['2']}</strong> points</p>
            </div>
            <div class="result-message">
                <p> <strong>Result:</strong> </p>
                <p>${resultText} ${scores['1'] === scores['2'] ? '' : playerNumber === '1' && scores['1'] < scores['2'] ? '/n (Better luck next time!)' : ''}</p>
            </div>
            <div class="game-over-buttons">
                <button id="rematchButton"> Rematch</button>
                <button id="newGameButton"> New Game</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Button event listeners
    document.getElementById('rematchButton').addEventListener('click', () => {
        // Reset game state in Firebase
        roomRef.update({
            'players/1/score': 0,
            'players/2/score': 0,
            currentRound: 1,
            currentDrawer: 1,
            wordSelected: false,
            correctGuess: null,
            drawing: {},
            clearActions: {},
            undoActions: {}
        }).then(() => {
            document.querySelector('.game-over-overlay').remove();
            // Force page reload to sync state
            window.location.reload();
        });
    });
    
    document.getElementById('newGameButton').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

// Chat functions
function sendMessage() {
    const messageInput = document.getElementById('MessageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    if (!isDrawer && message.toLowerCase() === currentWord.toLowerCase()) {
        // Send correct guess to Firebase
        roomRef.child('correctGuess').set({
            player: playerNumber,
            word: currentWord,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
    
    // Always send the message to chat
    roomRef.child('messages').push({
        player: playerNumber,
        text: message,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    messageInput.value = '';
}

function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    
    const playerName = message.player === '1' ? player1Name : player2Name;
    
    messageElement.className = `message ${message.player === playerNumber ? 'own-message' : 'other-message'}`;
    messageElement.innerHTML = `
        <span class="player-name">${playerName}:</span>
        <span class="message-text">${message.text}</span>
    `;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Canvas resizing
function resizeCanvas() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth - 40; // Account for padding
    const containerHeight = container.clientHeight - 40;
    
    // Maintain aspect ratio (600x400 = 3:2)
    const aspectRatio = 3/2;
    let newWidth, newHeight;
    
    if (containerWidth / containerHeight > aspectRatio) {
        newHeight = containerHeight;
        newWidth = containerHeight * aspectRatio;
    } else {
        newWidth = containerWidth;
        newHeight = containerWidth / aspectRatio;
    }
    
    // Set canvas display size
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    
    // Set canvas drawing buffer size
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Redraw existing content if needed
    if (historyIndex >= 0) {
        context.putImageData(drawingHistory[historyIndex], 0, 0);
    }
}

// Initialize the game when the page loads
window.onload = init;

// Event listener for window resize
window.addEventListener('resize', resizeCanvas);