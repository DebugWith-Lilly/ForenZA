
const RECEIVER_ID = "forenza-drone-unit-01";

const video = document.getElementById("drone-feed");
const cameraMessage = document.getElementById("camera-message");

const cameraStatus = document.getElementById("camera-status");
const connectionStatus = document.getElementById("connection-status");
const connectionIndicator = document.getElementById("connection-indicator");

let peer = null;
let activeCall = null;
let reconnectTimer = null;
let receiverReady = false;
let startingReceiver = false;


// UPDATE STATUS

function updateStatus(status, message, indicator) {
    if (cameraStatus) cameraStatus.textContent = status;
    if (connectionStatus) connectionStatus.textContent = message;
    if (connectionIndicator) connectionIndicator.textContent = indicator;
}


// WAITING SCREEN

function showWaiting(message = "AWAITING DRONE TRANSMISSION") {
    if (video) {
        video.pause();
        video.srcObject = null;
        video.style.display = "none";
    }

    if (cameraMessage) {
        cameraMessage.style.display = "block";
    }

    updateStatus("WAITING", message, "● ONLINE");
}


// DISPLAY VIDEO

async function showLive(stream) {
    if (!video || !stream) return;

    console.log("FORENZA: Incoming video stream received.");

    video.srcObject = stream;

    // Fill the entire drone screen.
    video.style.display = "block";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.objectPosition = "center";

    if (cameraMessage) {
        cameraMessage.style.display = "none";
    }

    updateStatus(
        "LIVE",
        "RECEIVING LIVE CAMERA TRANSMISSION",
        "● LIVE"
    );

    try {
        await video.play();
        console.log("FORENZA: Live video playing.");
    } catch (error) {
        console.error("FORENZA playback error:", error);

        updateStatus(
            "PLAYBACK ERROR",
            "UNABLE TO DISPLAY VIDEO",
            "● ERROR"
        );
    }
}


// HANDLE PHONE CONNECTION

function handleIncomingCall(call) {
    console.log("FORENZA: Incoming phone call:", call.peer);

    if (activeCall) {
        activeCall.close();
    }

    activeCall = call;

    updateStatus(
        "CONNECTING",
        "ESTABLISHING VIDEO CONNECTION",
        "● CONNECTING"
    );

    call.on("stream", remoteStream => {
        if (activeCall !== call) return;

        showLive(remoteStream);
    });

    call.on("close", () => {
        if (activeCall !== call) return;

        console.log("FORENZA: Phone transmission ended.");

        activeCall = null;
        showWaiting();
    });

    call.on("error", error => {
        console.error("FORENZA call error:", error);

        if (activeCall !== call) return;

        activeCall = null;

        showWaiting("VIDEO CONNECTION FAILED");

        updateStatus(
            "ERROR",
            "VIDEO CONNECTION FAILED",
            "● ERROR"
        );
    });

    try {
        call.answer();
        console.log("FORENZA: Answered phone call.");
    } catch (error) {
        console.error("FORENZA: Could not answer call:", error);

        activeCall = null;

        updateStatus(
            "ERROR",
            "COULD NOT ANSWER PHONE",
            "● ERROR"
        );
    }
}


// RECONNECT

function scheduleReconnect() {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        if (!peer || peer.destroyed) {
            initialiseReceiver();
            return;
        }

        if (peer.disconnected) {
            console.log("FORENZA: Reconnecting...");
            peer.reconnect();
        }
    }, 3000);
}


// INITIALISE RECEIVER

function initialiseReceiver() {
    if (startingReceiver) return;

    if (!window.Peer) {
        updateStatus(
            "ERROR",
            "PEERJS FAILED TO LOAD",
            "● ERROR"
        );

        console.error("FORENZA: PeerJS library not found.");
        return;
    }

    if (peer && !peer.destroyed) return;

    startingReceiver = true;
    receiverReady = false;

    updateStatus(
        "INITIALISING",
        "CONNECTING TO FORENZA NETWORK",
        "● CONNECTING"
    );

    console.log("FORENZA: Registering receiver:", RECEIVER_ID);

    peer = new window.Peer(RECEIVER_ID, {
        debug: 2
    });

    peer.on("open", id => {
        startingReceiver = false;
        receiverReady = true;

        console.log("FORENZA RECEIVER READY:", id);

        updateStatus(
            "READY",
            "AWAITING DRONE TRANSMISSION",
            "● ONLINE"
        );
    });

    peer.on("call", handleIncomingCall);

    peer.on("disconnected", () => {
        console.warn("FORENZA: PeerJS disconnected.");

        receiverReady = false;

        updateStatus(
            "RECONNECTING",
            "RECONNECTING TO FORENZA NETWORK",
            "● OFFLINE"
        );

        scheduleReconnect();
    });

    peer.on("error", error => {
        console.error("FORENZA PEER ERROR:", error);

        startingReceiver = false;

        if (error.type === "unavailable-id") {
            updateStatus(
                "ID IN USE",
                "CLOSE OTHER DRONE RECEIVER TABS",
                "● ERROR"
            );
            return;
        }

        if (
            error.type === "network" ||
            error.type === "socket-error" ||
            error.type === "server-error"
        ) {
            updateStatus(
                "NETWORK ERROR",
                "CHECK INTERNET - RETRYING",
                "● OFFLINE"
            );

            scheduleReconnect();
            return;
        }

        updateStatus(
            "CONNECTION ERROR",
            error.message || "UNABLE TO CONNECT",
            "● ERROR"
        );
    });

    peer.on("close", () => {
        startingReceiver = false;
        receiverReady = false;

        showWaiting("RECEIVER DISCONNECTED");
    });
}


// INTERNET RECOVERY

window.addEventListener("online", () => {
    if (!receiverReady) {
        scheduleReconnect();
    }
});


// CLEAN UP

window.addEventListener("beforeunload", () => {
    if (activeCall) {
        activeCall.close();
    }

    if (peer && !peer.destroyed) {
        peer.destroy();
    }
});


// START RECEIVER

showWaiting();
initialiseReceiver();

console.log("FORENZA drone receiver initialised.");
