
import { auth, onAuthStateChanged } from "./firebase.js";

const RECEIVER_ID = "forenza-drone-unit-01";

// ELEMENTS

const startButton = document.getElementById("start-phone-camera");
const stopButton = document.getElementById("stop-phone-camera");
const switchButton = document.getElementById("switch-phone-camera");

const video = document.getElementById("phone-preview");
const placeholder = document.getElementById("phone-placeholder");

const statusText = document.getElementById("phone-status");
const recordingText = document.getElementById("recording-status");
const recordingIndicator = document.getElementById("recording-indicator");

// STATE

let peer = null;
let activeCall = null;

let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];

let recordingMimeType = "";

let currentFacingMode = "environment";

let isStreaming = false;
let isStarting = false;
let isStopping = false;

let reconnectTimer = null;
let reconnectAttempts = 0;


// STATUS

function setStatus(message) {
    statusText.textContent = message;
    console.log("FORENZA STATUS:", message);
}

function setRecordingStatus(message) {
    recordingText.textContent = message;
}

function setRecordingActive(active) {
    recordingIndicator.classList.toggle("active", active);
}


// CAMERA

async function getCameraStream(facingMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
            "Camera unavailable. Open FORENZA using HTTPS and allow camera access."
        );
    }

    return navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: true
    });
}

async function startCamera() {
    cameraStream = await getCameraStream(currentFacingMode);

    video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;
    video.style.display = "block";

    placeholder.style.display = "none";

    await video.play();
}


// RECORDING FORMAT

function getRecordingOptions() {
    if (!window.MediaRecorder) {
        throw new Error("Video recording is not supported by this browser.");
    }

    const supportedFormats = [
        // Try genuine MP4 first.
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",

        // WebM fallback.
        "video/webm;codecs=vp8,opus",
        "video/webm"
    ];

    for (const mimeType of supportedFormats) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            console.log("FORENZA recording format:", mimeType);

            return { mimeType };
        }
    }

    // Let the browser choose its default supported format.
    console.warn("FORENZA: Browser will choose the recording format.");

    return {};
}

function getFileExtension(mimeType) {
    if (mimeType && mimeType.toLowerCase().includes("mp4")) {
        return "mp4";
    }

    if (mimeType && mimeType.toLowerCase().includes("webm")) {
        return "webm";
    }

    return "webm";
}


// RECORDING

function startRecording() {
    const options = getRecordingOptions();

    mediaRecorder = new MediaRecorder(cameraStream, options);

    if (!recordingMimeType) {
        recordingMimeType =
            mediaRecorder.mimeType ||
            options.mimeType ||
            "video/webm";
    }

    mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstart = () => {
        setRecordingStatus(
            recordingMimeType.toLowerCase().includes("mp4")
                ? "RECORDING MP4"
                : "RECORDING WEBM"
        );

        setRecordingActive(true);
    };

    mediaRecorder.onerror = event => {
        console.error("FORENZA recording error:", event.error);
        setRecordingStatus("RECORDING ERROR");
    };

    mediaRecorder.onstop = () => {
        setRecordingActive(false);
    };

    mediaRecorder.start(1000);
}

function stopRecordingSegment() {
    return new Promise(resolve => {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            resolve();
            return;
        }

        const recorder = mediaRecorder;

        recorder.addEventListener("stop", resolve, { once: true });

        recorder.stop();
    });
}

function saveRecording() {
    if (!recordedChunks.length) {
        setRecordingStatus("NO RECORDING DATA");
        return;
    }

    const mimeType =
        recordingMimeType ||
        recordedChunks.find(chunk => chunk.type)?.type ||
        "video/webm";

    const blob = new Blob(recordedChunks, {
        type: mimeType
    });

    const extension = getFileExtension(mimeType);

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    link.href = url;
    link.download = `forenza-recording-${timestamp}.${extension}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 60000);

    recordedChunks = [];
    recordingMimeType = "";

    setRecordingStatus(
        extension === "mp4"
            ? "MP4 RECORDING SAVED"
            : "WEBM RECORDING SAVED"
    );

    console.log("FORENZA: Recording saved as", extension);
}


// PEERJS

function createPeer() {
    return new Promise((resolve, reject) => {
        if (!window.Peer) {
            reject(
                new Error("PeerJS did not load. Check your internet connection.")
            );
            return;
        }

        if (peer && peer.open && !peer.destroyed) {
            resolve(peer);
            return;
        }

        peer = new Peer(undefined, {
            debug: 1
        });

        let completed = false;

        const timeout = setTimeout(() => {
            if (!completed) {
                completed = true;

                reject(
                    new Error(
                        "Could not connect to the FORENZA network. Please retry."
                    )
                );
            }
        }, 15000);

        peer.on("open", id => {
            console.log("FORENZA phone Peer ID:", id);

            clearTimeout(timeout);

            if (!completed) {
                completed = true;
                resolve(peer);
            }

            connectToLaptop();
        });

        peer.on("error", error => {
            console.error("PeerJS error:", error);

            if (!completed) {
                clearTimeout(timeout);
                completed = true;
                reject(error);
                return;
            }

            if (error.type === "peer-unavailable") {
                setStatus("LAPTOP NOT READY");
                scheduleReconnect();
            } else {
                setStatus("NETWORK ERROR");
            }
        });

        peer.on("disconnected", () => {
            setStatus("RECONNECTING NETWORK");

            if (isStreaming && peer && !peer.destroyed) {
                peer.reconnect();
            }
        });
    });
}


// CONNECT TO DRONE RECEIVER

function connectToLaptop() {
    if (
        !peer ||
        !peer.open ||
        !cameraStream ||
        !isStreaming ||
        activeCall
    ) {
        return;
    }

    setStatus("CONNECTING TO LAPTOP");

    const call = peer.call(RECEIVER_ID, cameraStream);

    if (!call) {
        setStatus("WAITING FOR LAPTOP");
        scheduleReconnect();
        return;
    }

    activeCall = call;

    call.on("stream", () => {
        setStatus("LIVE - CONNECTED TO LAPTOP");
        reconnectAttempts = 0;
    });

    call.on("close", () => {
        if (activeCall !== call) return;

        activeCall = null;

        if (isStreaming) {
            setStatus("CONNECTION LOST - RETRYING");
            scheduleReconnect();
        }
    });

    call.on("error", error => {
        console.error("Video call error:", error);

        if (activeCall !== call) return;

        activeCall = null;

        if (isStreaming) {
            setStatus("CONNECTION ERROR - RETRYING");
            scheduleReconnect();
        }
    });
}


// RECONNECT

function scheduleReconnect() {
    if (!isStreaming || reconnectTimer) return;

    reconnectAttempts++;

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;

        if (!isStreaming) return;

        try {
            if (!peer || peer.destroyed) {
                await createPeer();
            } else if (peer.disconnected) {
                peer.reconnect();
            }

            if (peer?.open) {
                connectToLaptop();
            }

        } catch (error) {
            console.error("Reconnect error:", error);
            scheduleReconnect();
        }

    }, Math.min(3000 * reconnectAttempts, 15000));
}

function clearReconnect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}


// START

async function startLiveCamera() {
    if (isStarting || isStreaming) return;

    isStarting = true;
    startButton.disabled = true;

    recordedChunks = [];
    recordingMimeType = "";

    try {
        setStatus("STARTING CAMERA");

        await startCamera();

        startRecording();

        isStreaming = true;

        setStatus("CONNECTING TO FORENZA NETWORK");

        await createPeer();

        connectToLaptop();

        startButton.style.display = "none";

        stopButton.style.display = "flex";
        stopButton.disabled = false;

        switchButton.disabled = false;

    } catch (error) {
        console.error("FORENZA START ERROR:", error);

        setStatus("START FAILED");

        alert(error.message || "Unable to start the camera.");

        await stopCamera(false);

    } finally {
        isStarting = false;

        if (!isStreaming) {
            startButton.disabled = false;
        }
    }
}


// SWITCH CAMERA

async function switchCamera() {
    if (!cameraStream || !isStreaming || isStopping) return;

    switchButton.disabled = true;

    const nextFacingMode =
        currentFacingMode === "environment"
            ? "user"
            : "environment";

    let newStream = null;

    try {
        setStatus("SWITCHING CAMERA");

        newStream = await getCameraStream(nextFacingMode);

        const newVideoTrack = newStream.getVideoTracks()[0];

        if (!newVideoTrack) {
            throw new Error("Could not access the selected camera.");
        }

        // Replace the video track being sent to the laptop.
        if (activeCall) {
            const sender = activeCall.peerConnection
                ?.getSenders()
                .find(item => item.track?.kind === "video");

            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }
        }

        // Finish the current recording segment.
        await stopRecordingSegment();

        const oldStream = cameraStream;

        const oldVideoTracks = oldStream.getVideoTracks();

        // Keep the original microphone track.
        const audioTracks = oldStream.getAudioTracks();

        cameraStream = new MediaStream([
            newVideoTrack,
            ...audioTracks
        ]);

        video.srcObject = cameraStream;

        await video.play();

        oldVideoTracks.forEach(track => track.stop());

        // Stop the unused audio track from the newly opened stream.
        newStream.getAudioTracks().forEach(track => track.stop());

        currentFacingMode = nextFacingMode;

        // Start another recording segment.
        startRecording();

        setStatus("CAMERA SWITCHED");

    } catch (error) {
        console.error("Camera switch error:", error);

        if (newStream) {
            newStream.getTracks().forEach(track => track.stop());
        }

        setStatus("CAMERA SWITCH FAILED");

        alert(error.message || "Could not switch camera.");

    } finally {
        switchButton.disabled = false;
    }
}


// STOP AND SAVE

async function stopCamera(shouldSave = true) {
    if (isStopping) return;

    isStopping = true;
    isStreaming = false;

    clearReconnect();

    if (activeCall) {
        const call = activeCall;
        activeCall = null;
        call.close();
    }

    await stopRecordingSegment();

    if (shouldSave) {
        saveRecording();
    } else {
        recordedChunks = [];
        recordingMimeType = "";
        setRecordingStatus("RECORDING INACTIVE");
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    video.srcObject = null;
    video.style.display = "none";

    placeholder.style.display = "flex";

    if (peer && !peer.destroyed) {
        peer.destroy();
    }

    peer = null;

    startButton.style.display = "flex";
    startButton.disabled = false;

    stopButton.style.display = "none";
    stopButton.disabled = true;

    switchButton.disabled = true;

    setRecordingActive(false);

    if (shouldSave) {
        setStatus("TRANSMISSION STOPPED");
    } else {
        setStatus("STANDBY");
    }

    isStopping = false;
}


// BUTTONS

startButton.addEventListener("click", () => {
    console.log("FORENZA: START BUTTON CLICKED");
    startLiveCamera();
});

switchButton.addEventListener("click", switchCamera);

stopButton.addEventListener("click", () => {
    stopCamera(true);
});


// INITIAL STATE

stopButton.style.display = "none";
stopButton.disabled = true;

switchButton.disabled = true;

setStatus("READY");
setRecordingStatus("RECORDING INACTIVE");
setRecordingActive(false);


// FIREBASE AUTHENTICATION

onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.replace("login.html");
        return;
    }

    console.log("FORENZA: Phone drone unit authenticated.");
});

console.log("FORENZA phone.js loaded successfully.");
