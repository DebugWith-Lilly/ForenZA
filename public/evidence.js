import { auth, onAuthStateChanged, signOut } from "./firebase.js";

/* =========================================
   FORENZA EVIDENCE MANAGER
========================================= */

const DB_NAME = "forenzaEvidenceDB";
const DB_VERSION = 1;
const STORE_NAME = "investigations";

const TRANSCRIPTION_SERVER = "http://localhost:3000/api/transcribe";
const FRAME_INTERVAL = 5;
const MAX_IMAGE_SLOTS = 6;

let evidenceImages = [];
let importedFiles = [];
let hasUnsavedChanges = false;

/*
    This counter controls the gallery separately
    from the evidenceImages array.

    The first image ALWAYS goes into IMAGE 01.
*/
let nextImageSlot = 1;

const uploadButton = document.getElementById("evidence-upload-button");
const uploadInput = document.getElementById("evidence-upload-input");
const uploadStatus = document.getElementById("upload-status");

const saveButton = document.getElementById("save-evidence-button");
const saveNote = document.getElementById("save-note");

const caseDocument = document.getElementById("case-document");
const wordCount = document.getElementById("word-count");
const imageGallery = document.getElementById("image-gallery");

/* =========================================
   DATABASE
========================================= */

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => reject(request.error);
    });
}

async function saveInvestigation(record) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).put(record);

        transaction.oncomplete = () => {
            db.close();
            resolve();
        };

        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };

        transaction.onabort = () => {
            db.close();
            reject(transaction.error);
        };
    });
}

/* =========================================
   STATUS AND DOCUMENT HELPERS
========================================= */

function setStatus(message, type = "") {
    uploadStatus.textContent = message;

    uploadStatus.classList.remove(
        "is-error",
        "is-success"
    );

    if (type) {
        uploadStatus.classList.add(`is-${type}`);
    }
}

function markUnsaved() {
    hasUnsavedChanges = true;
    saveNote.textContent = "UNSAVED CHANGES";
}

function updateWordCount() {
    const text = caseDocument.value.trim();

    const count = text
        ? text.split(/\s+/).length
        : 0;

    wordCount.textContent = `${count} WORDS`;
}

function appendToDocument(text) {
    if (!text || !text.trim()) return;

    caseDocument.value = caseDocument.value.trim()
        ? `${caseDocument.value.trim()}\n\n${text}`
        : text;

    updateWordCount();
    markUnsaved();
}

/* =========================================
   IMAGE GALLERY
   IMAGE 01 IS ALWAYS THE FIRST SLOT
========================================= */

function addImageToGallery(dataUrl, caption) {

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        console.warn("FORENZA: Invalid image was skipped.", caption);
        return;
    }

    /*
       Select the next empty numbered slot directly.

       Do not use evidenceImages.length to select
       the placeholder. This keeps gallery placement
       independent from the image storage array.
    */

    let slot = null;

    if (nextImageSlot <= MAX_IMAGE_SLOTS) {
        slot = imageGallery.querySelector(
            `.image-placeholder[data-slot="${nextImageSlot}"]`
        );
    }

    /*
       Once the six original placeholders are full,
       create additional slots.
    */

    if (!slot) {
        slot = document.createElement("div");

        slot.className = "image-placeholder";
        slot.dataset.extraSlot = "true";

        imageGallery.appendChild(slot);
    }

    const currentSlotNumber = nextImageSlot;

    nextImageSlot++;

    /*
       Store the image for IndexedDB and AI Summary.
    */

    evidenceImages.push({
        dataUrl,
        caption,
        slot: currentSlotNumber
    });

    /*
       Clear the placeholder.
    */

    slot.replaceChildren();

    /*
       Create the image.
    */

    const image = document.createElement("img");

    image.src = dataUrl;
    image.alt = caption;
    image.className = "evidence-slot-image";

    image.style.position = "absolute";
    image.style.inset = "0";
    image.style.display = "block";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
    image.style.objectFit = "cover";
    image.style.objectPosition = "center";

    /*
       Create the caption.
    */

    const label = document.createElement("span");

    label.className = "evidence-slot-caption";
    label.textContent = caption;
    label.title = caption;

    slot.append(image, label);

    slot.setAttribute("aria-label", caption);

    markUnsaved();

    console.log(
        `FORENZA: ${caption} added to IMAGE ${String(currentSlotNumber).padStart(2, "0")}`
    );
}

/* =========================================
   FILE READING
========================================= */

function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);

        reader.readAsDataURL(blob);
    });
}

/* =========================================
   IMAGE FILE IMPORT
   JPG, JPEG, PNG, WEBP AND GIF
========================================= */

async function processImage(file) {
    setStatus(`IMPORTING IMAGE: ${file.name.toUpperCase()}...`);

    const dataUrl = await readAsDataURL(file);

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        throw new Error(`Could not read image: ${file.name}`);
    }

    addImageToGallery(dataUrl, file.name);

    appendToDocument(
        `IMPORTED IMAGE: ${file.name}\n` +
        `Image type: ${file.type || "Unknown"}\n` +
        `File size: ${(file.size / 1024).toFixed(1)} KB`
    );
}

/* =========================================
   FILE INFORMATION
========================================= */

function recordImportedFile(file) {
    importedFiles.push({
        name: file.name,
        type: file.type || "unknown",
        size: file.size,
        uploadedAt: new Date().toISOString()
    });

    markUnsaved();
}

/* =========================================
   PDF PROCESSING
========================================= */

async function processPDF(file) {

    if (!window.pdfjsLib) {
        throw new Error("PDF.js could not be loaded.");
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const pdf = await pdfjsLib.getDocument({
        data: await file.arrayBuffer()
    }).promise;

    let extractedText = "";

    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {

        setStatus(
            `PROCESSING PDF PAGE ${pageNumber}/${pdf.numPages}`
        );

        const page = await pdf.getPage(pageNumber);

        const content = await page.getTextContent();

        extractedText +=
            `\n--- ${file.name} | PAGE ${pageNumber} ---\n`;

        extractedText +=
            content.items.map(item => item.str).join(" ") + "\n";

        /*
           Render each PDF page as an image.
        */

        const viewport = page.getViewport({
            scale: 1.35
        });

        const canvas = document.createElement("canvas");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext("2d");

        await page.render({
            canvasContext: context,
            viewport
        }).promise;

        addImageToGallery(
            canvas.toDataURL("image/jpeg", 0.82),
            `${file.name} - PAGE ${pageNumber}`
        );
    }

    appendToDocument(
        `IMPORTED PDF: ${file.name}\n${extractedText}`
    );
}

/* =========================================
   WORD DOCUMENT PROCESSING
========================================= */

async function processDOCX(file) {

    if (!window.mammoth || !window.JSZip) {
        throw new Error(
            "Word document libraries could not be loaded."
        );
    }

    const buffer = await file.arrayBuffer();

    const result = await mammoth.extractRawText({
        arrayBuffer: buffer
    });

    appendToDocument(
        `IMPORTED WORD DOCUMENT: ${file.name}\n${result.value}`
    );

    /*
       Extract embedded images from the Word document.
    */

    const zip = await JSZip.loadAsync(buffer);

    const media = Object.keys(zip.files).filter(name =>
        name.startsWith("word/media/") &&
        !zip.files[name].dir
    );

    for (const name of media) {

        const blob = await zip.files[name].async("blob");

        const dataUrl = await readAsDataURL(blob);

        if (dataUrl.startsWith("data:image/")) {
            addImageToGallery(
                dataUrl,
                `${file.name} - ${name.split("/").pop()}`
            );
        }
    }
}

/* =========================================
   TEXT FILE PROCESSING
========================================= */

async function processTXT(file) {

    const text = await file.text();

    appendToDocument(
        `IMPORTED TEXT FILE: ${file.name}\n${text}`
    );
}

/* =========================================
   VIDEO HELPERS
========================================= */

function waitForEvent(element, eventName) {
    return new Promise((resolve, reject) => {

        const success = () => {
            cleanup();
            resolve();
        };

        const failure = () => {
            cleanup();
            reject(
                new Error("The video could not be loaded.")
            );
        };

        const cleanup = () => {
            element.removeEventListener(eventName, success);
            element.removeEventListener("error", failure);
        };

        element.addEventListener(eventName, success, {
            once: true
        });

        element.addEventListener("error", failure, {
            once: true
        });
    });
}

function seekVideo(video, time) {

    if (Math.abs(video.currentTime - time) < 0.05) {
        return Promise.resolve();
    }

    const promise = waitForEvent(video, "seeked");

    video.currentTime = time;

    return promise;
}

function formatTimestamp(seconds) {

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return (
        `${String(mins).padStart(2, "0")}:` +
        `${String(secs).padStart(2, "0")}`
    );
}

/* =========================================
   EXTRACT VIDEO FRAMES
========================================= */

async function extractVideoFrames(video, file) {

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const times = [];

    /*
       Capture the first frame at 0 seconds.
       Then capture another frame every 5 seconds.
    */

    for (
        let time = 0;
        time < video.duration;
        time += FRAME_INTERVAL
    ) {
        times.push(time);
    }

    /*
       Include the final frame if it is not already
       close to the last sampled frame.
    */

    if (
        !times.length ||
        video.duration - times[times.length - 1] > 1
    ) {
        times.push(
            Math.max(0, video.duration - 0.2)
        );
    }

    for (let i = 0; i < times.length; i++) {

        setStatus(
            `EXTRACTING VIDEO FRAME ${i + 1}/${times.length}`
        );

        await seekVideo(video, times[i]);

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        /*
           addImageToGallery assigns the next available
           slot, starting with IMAGE 01.
        */

        addImageToGallery(
            canvas.toDataURL("image/jpeg", 0.82),
            `${file.name} - ${formatTimestamp(times[i])}`
        );
    }
}

/* =========================================
   VIDEO AUDIO TRANSCRIPTION
========================================= */

async function transcribeVideoAudio(video, file) {

    const capture =
        video.captureStream ||
        video.mozCaptureStream;

    if (!capture || !window.MediaRecorder) {

        appendToDocument(
            `AUDIO TRANSCRIPTION: Browser audio capture is unavailable for ${file.name}.`
        );

        return;
    }

    /*
       Return to the beginning before recording audio.
    */

    await seekVideo(video, 0);

    const stream = capture.call(video);

    const tracks = stream.getAudioTracks();

    if (!tracks.length) {

        stream.getTracks().forEach(track => track.stop());

        appendToDocument(
            `AUDIO TRANSCRIPTION: No audio track was detected in ${file.name}.`
        );

        return;
    }

    const audioStream = new MediaStream(tracks);

    let mime = "audio/webm";

    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mime = "audio/webm;codecs=opus";
    }

    const recorder = new MediaRecorder(audioStream, {
        mimeType: mime
    });

    const chunks = [];

    recorder.ondataavailable = event => {
        if (event.data?.size) {
            chunks.push(event.data);
        }
    };

    const stopped = new Promise((resolve, reject) => {

        recorder.onstop = resolve;

        recorder.onerror = () => {
            reject(
                new Error("Audio recording failed.")
            );
        };
    });

    try {

        recorder.start(1000);

        const ended = new Promise(resolve => {
            video.addEventListener("ended", resolve, {
                once: true
            });
        });

        /*
           The video element is not muted here because
           muted video can prevent audio capture in
           some browsers.

           Volume is set to zero to avoid playback noise.
        */

        video.muted = false;
        video.volume = 0;

        await video.play();

        setStatus("CAPTURING VIDEO AUDIO...");

        await ended;

        if (recorder.state !== "inactive") {
            recorder.stop();
        }

        await stopped;

        const audioBlob = new Blob(chunks, {
            type: recorder.mimeType || "audio/webm"
        });

        if (!audioBlob.size) {

            appendToDocument(
                `AUDIO TRANSCRIPTION: No audio data was captured from ${file.name}.`
            );

            return;
        }

        if (audioBlob.size > 24 * 1024 * 1024) {

            appendToDocument(
                `AUDIO TRANSCRIPTION: Audio from ${file.name} was too large for the local transcription endpoint.`
            );

            return;
        }

        setStatus("SENDING AUDIO TO LOCAL WHISPER...");

        const formData = new FormData();

        formData.append(
            "audio",
            audioBlob,
            "forenza-audio.webm"
        );

        let response;

        try {

            response = await fetch(
                TRANSCRIPTION_SERVER,
                {
                    method: "POST",
                    body: formData
                }
            );

        } catch {

            appendToDocument(
                `AUDIO TRANSCRIPTION: Local Whisper server was unavailable. Start your local server and retry the video if a transcript is required.`
            );

            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Whisper transcription failed."
            );
        }

        const transcript = (data.transcript || "").trim();

        appendToDocument(
            transcript
                ? `VIDEO AUDIO TRANSCRIPT - ${file.name}\n${transcript}\n\nVerify this automatic transcript against the original recording.`
                : `VIDEO AUDIO TRANSCRIPT - ${file.name}\nNo clear speech was detected.`
        );

    } finally {

        stream.getTracks().forEach(track => track.stop());

        audioStream.getTracks().forEach(track => track.stop());
    }
}

/* =========================================
   VIDEO PROCESSING
========================================= */

async function processVideo(file) {

    const url = URL.createObjectURL(file);

    const video = document.createElement("video");

    video.preload = "auto";
    video.playsInline = true;

    /*
       Do not mute the video before captureStream().
       Some browsers omit audio when the video is muted.
    */

    video.muted = false;
    video.volume = 0;

    try {

        const loaded = waitForEvent(
            video,
            "loadedmetadata"
        );

        video.src = url;
        video.load();

        await loaded;

        if (
            !video.videoWidth ||
            !video.videoHeight ||
            !Number.isFinite(video.duration)
        ) {
            throw new Error(
                "This video could not be decoded by the browser."
            );
        }

        appendToDocument(
            `IMPORTED VIDEO: ${file.name}\n` +
            `Duration: ${formatTimestamp(video.duration)}\n` +
            `Frames sampled every ${FRAME_INTERVAL} seconds.`
        );

        /*
           First extract the frames.
        */

        await extractVideoFrames(video, file);

        /*
           Then capture and transcribe the audio.
        */

        await transcribeVideoAudio(video, file);

    } finally {

        video.pause();

        video.removeAttribute("src");
        video.load();

        URL.revokeObjectURL(url);
    }
}

/* =========================================
   FILE TYPE ROUTER
========================================= */

async function processFile(file) {

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    if (
        ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)
    ) {
        await processImage(file);
    }

    else if (extension === "pdf") {
        await processPDF(file);
    }

    else if (extension === "docx") {
        await processDOCX(file);
    }

    else if (extension === "txt") {
        await processTXT(file);
    }

    else if (
        ["mp4", "mov", "webm"].includes(extension)
    ) {
        await processVideo(file);
    }

    else {
        throw new Error(
            `Unsupported file type: ${extension}`
        );
    }

    recordImportedFile(file);
}

/* =========================================
   SAVE EVIDENCE
========================================= */

async function saveCurrentEvidence() {

    const text = caseDocument.value.trim();

    if (
        !text &&
        evidenceImages.length === 0 &&
        importedFiles.length === 0
    ) {
        setStatus(
            "THERE IS NO EVIDENCE TO SAVE.",
            "error"
        );

        return;
    }

    saveButton.disabled = true;
    saveNote.textContent = "SAVING...";

    try {

        const now = new Date().toISOString();

        const record = {
            id: `investigation-${Date.now()}`,

            title:
                importedFiles[0]?.name ||
                `Investigation ${new Date().toLocaleDateString()}`,

            createdAt: now,
            updatedAt: now,

            text,

            images: evidenceImages,
            files: importedFiles,

            imageCount: evidenceImages.length,

            wordCount: text
                ? text.split(/\s+/).length
                : 0
        };

        await saveInvestigation(record);

        hasUnsavedChanges = false;

        saveNote.textContent = "EVIDENCE SAVED";

        setStatus(
            "EVIDENCE SAVED. OPEN AI SUMMARY TO VIEW THE RESULTS.",
            "success"
        );

    } catch (error) {

        console.error("FORENZA save error:", error);

        saveNote.textContent = "SAVE FAILED";

        setStatus(
            `SAVE FAILED: ${error.message}`,
            "error"
        );

    } finally {

        saveButton.disabled = false;

        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

/* =========================================
   UPLOAD BUTTON
========================================= */

uploadButton.addEventListener("click", () => {
    uploadInput.click();
});

/* =========================================
   HANDLE UPLOADED FILES
========================================= */

uploadInput.addEventListener("change", async event => {

    const files = Array.from(
        event.target.files || []
    );

    if (!files.length) return;

    uploadButton.disabled = true;

    let successfulFiles = 0;
    let failedFiles = [];

    try {

        for (const file of files) {

            try {

                setStatus(
                    `IMPORTING ${file.name.toUpperCase()}...`
                );

                await processFile(file);

                successfulFiles++;

            } catch (error) {

                console.error(
                    `FORENZA could not process ${file.name}:`,
                    error
                );

                failedFiles.push(
                    `${file.name}: ${error.message}`
                );
            }
        }

        updateWordCount();

        if (successfulFiles > 0 && failedFiles.length === 0) {

            setStatus(
                `${successfulFiles} FILE(S) IMPORTED SUCCESSFULLY. CLICK SAVE EVIDENCE TO SEND THEM TO AI SUMMARY.`,
                "success"
            );
        }

        else if (successfulFiles > 0 && failedFiles.length > 0) {

            setStatus(
                `${successfulFiles} FILE(S) IMPORTED. ${failedFiles.length} FILE(S) FAILED. CHECK THE BROWSER CONSOLE.`,
                "error"
            );
        }

        else {

            setStatus(
                "NO FILES COULD BE IMPORTED. CHECK THE BROWSER CONSOLE.",
                "error"
            );
        }

    } finally {

        uploadButton.disabled = false;

        uploadInput.value = "";

        updateWordCount();

        if (window.lucide) {
            lucide.createIcons();
        }
    }
});

/* =========================================
   DOCUMENT INPUT
========================================= */

caseDocument.addEventListener("input", () => {

    updateWordCount();

    markUnsaved();
});

/* =========================================
   SAVE BUTTON
========================================= */

saveButton.addEventListener(
    "click",
    saveCurrentEvidence
);

/* =========================================
   PAGE TITLE ANIMATION
========================================= */

const titleElement = document.getElementById("typing-title");

const titleText = "EVIDENCE";

let titleIndex = 0;

function typeTitle() {

    if (titleIndex < titleText.length) {

        titleElement.textContent +=
            titleText.charAt(titleIndex++);

        setTimeout(typeTitle, 120);
    }
}

window.addEventListener("load", () => {
    setTimeout(typeTitle, 500);
});

/* =========================================
   FIREBASE AUTHENTICATION
========================================= */

onAuthStateChanged(auth, user => {

    if (!user) {
        window.location.replace("login.html");
    }
});

document
    .querySelector(".logout-link")
    ?.addEventListener("click", async event => {

        event.preventDefault();

        try {

            await signOut(auth);

            window.location.replace("login.html");

        } catch (error) {

            console.error(
                "FORENZA sign-out error:",
                error
            );

            alert(
                "Unable to sign out. Please try again."
            );
        }
    });

/* =========================================
   UNSAVED CHANGES WARNING
========================================= */

window.addEventListener("beforeunload", event => {

    if (hasUnsavedChanges) {

        event.preventDefault();

        event.returnValue = "";
    }
});

/* =========================================
   INITIALISE PAGE
========================================= */

updateWordCount();

if (window.lucide) {
    lucide.createIcons();
}

console.log("FORENZA evidence manager ready.");