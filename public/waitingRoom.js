const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerNumber = urlParams.get('player');

document.getElementById('roomCodeDisplay').textContent = roomCode;
const startBtn = document.getElementById("startGame");
const playersContainer = document.getElementById("playersContainer");
const playerNameInput = document.getElementById('playerName');
const statusMessage = document.getElementById('statusMessage');
const CONNECTION_TIMEOUT = 10000; // 10 seconds


const db = firebase.database();
const roomRef = db.ref(`rooms/${roomCode}`);

// Track player names
let playerNames = {
  '1': null,
  '2': null
};

// Listen for player updates
roomRef.child('players').on('value', (snapshot) => {
  const players = snapshot.val() || {};
  
  // Update player names
  if (players['1']?.name) playerNames['1'] = players['1'].name;
  if (players['2']?.name) playerNames['2'] = players['2'].name;
  
  updatePlayersList();
  updateUIState();
});

function updatePlayersList() {
  playersContainer.innerHTML = '';
  
  for (const [number, name] of Object.entries(playerNames)) {
    if (name) {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-card';
      playerDiv.innerHTML = `
        <span>Player ${number}: ${name}</span>
      `;
      playersContainer.appendChild(playerDiv);
    }
  }
}

function updateUIState() {
  const bothPlayersJoined = playerNames['1'] && playerNames['2'];
  
  if (bothPlayersJoined) {
    startBtn.disabled = false;
    statusMessage.textContent = '';
    statusMessage.style.color = 'green';
    statusMessage.textContent = 'Both players joined! Ready to start!';
  } else {
    startBtn.disabled = true;
    statusMessage.style.color = 'red';
    if (playerNumber === '1') {
      statusMessage.textContent = 'Waiting for Player 2 to join...';
    } else {
      statusMessage.textContent = 'Waiting for Player 1 to start the game...';
    }
  }
}


startBtn.addEventListener('click', async function() {
  const playerName = playerNameInput.value.trim();

  if (!playerName) {
    alert("Please enter your name!");
    return;
  }

  if (playerName.length < 2 || playerName.length > 12) {
    alert("Name should be 2-12 characters.");
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "Starting game...";
  
  try {
    // Save player name if not already saved
    if (!playerNames[playerNumber]) {
      await roomRef.child(`players/${playerNumber}/name`).set(playerName);
    }
    
    // Set currentDrawer to 1 when starting the game
    await roomRef.update({
      status: "playing",
      gameStarted: true,
      currentDrawer: 1, 
      wordSelected: false,  
      currentRound: 1  
    });
    
    // Redirect to game page
    window.location.href = `game.html?room=${roomCode}&player=${playerNumber}`;
    
  } catch (error) {
    console.error("Error starting game:", error);
    alert("Failed to start game. Please try again!");
    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
  }
});

roomRef.child('gameStarted').on('value', (snapshot) => {
  if (snapshot.exists() && snapshot.val() === true) {
    setTimeout(() => {
      window.location.href = `game.html?room=${roomCode}&player=${playerNumber}`;
    }, 500);
  }
});

// Handle player name input
playerNameInput.addEventListener('input', () => {
  const name = playerNameInput.value.trim();
  if (name.length >= 2 && name.length <= 12) {
    // Automatically save name when valid
    roomRef.child(`players/${playerNumber}/name`).set(name);
  }
});