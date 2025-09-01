let createNewRoom = document.getElementById("newRoom");
let joinRoomEl = document.getElementById("joinRoom");
let roomInput = document.getElementById("roomInput");

roomInput.style.display = "none";

// Generate 4 letter room code
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for(let i = 0; i < 4; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }
    return result;
}

createNewRoom.addEventListener('click', async function() {
    const roomCode = generateRoomCode();
    createNewRoom.disabled = true;
    createNewRoom.textContent = "Creating....";
    
    try {

        const roomRef = firebase.database().ref(`rooms/${roomCode}`);
        const snapshot = await roomRef.once('value');

        if(snapshot.exists()) {
            alert("Room exists! Try again.");
            return;
        }

        await roomRef.set({
            status: "waiting",
            players: {
                1: { 
                    id: `player_${Date.now()}`,
                    score: 0,
                    ready: false
                }
            },
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        window.location.href = `waitingRoom.html?room=${roomCode}&player=1`;
        
    } catch (error) {
        console.error(error);
        alert("Creation failed: " + error.message);
    } finally {
        createNewRoom.disabled = false;
        createNewRoom.textContent = "New Room";
    }
});

// Join Room Implementation
joinRoomEl.addEventListener('click', function() {
    if (roomInput.style.display === "none") {
        roomInput.style.display = "block";
        joinRoomEl.textContent = "Join";
    } else {
        const code = roomInput.value.trim().toUpperCase();
        if(code.length === 4) {
            joinRoom(code);
        } else {
            alert("Please enter 4 letter code!");
        }
    }
});

async function joinRoom(code) {
    joinRoomEl.disabled = true;
    joinRoomEl.textContent = "Joining...";
    
    try {
        const roomRef = firebase.database().ref(`rooms/${code}`);
        const snapshot = await roomRef.once('value');
        
        if (!snapshot.exists()) {
            alert("Room not found!");
            return;
        }
        
        const players = snapshot.val().players || {};
        if (Object.keys(players).length >= 2) {
            alert("Room is full!");
            return;
        }
        
        await roomRef.child('players').update({
            2: {
                id: `player_${Date.now()}`,
                score: 0,
                ready: false
            }
        });
        
        window.location.href = `waitingRoom.html?room=${code}&player=2`;
    } catch (error) {
        console.error(error);
        alert("Join failed: " + error.message);
    } finally {
        joinRoomEl.disabled = false;
        joinRoomEl.textContent = "Join Room";
        roomInput.value = "";
    }
}