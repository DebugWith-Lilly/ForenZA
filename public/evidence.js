
const TRANSCRIPTION_SERVER = "http://localhost:3000/api/transcribe";
const FRAME_INTERVAL = 5;
const MAX_IMAGE_SLOTS = 6;

// ==========================================
// FORENZA EVIDENCE MANAGEMENT
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const uploadButton = document.getElementById("evidence-upload-button");
    const uploadInput = document.getElementById("evidence-upload-input");
    const uploadStatus = document.getElementById("upload-status");
    const caseDocument = document.getElementById("case-document");
    const wordCount = document.getElementById("word-count");
    const imageGallery = document.getElementById("image-gallery");

    if (!uploadButton || !uploadInput || !imageGallery) {
        console.error("FORENZA: Required evidence elements not found.");
        return;
    }

    // Select the six original placeholders.
    const imageSlots = Array.from(
        imageGallery.querySelectorAll(".image-placeholder")
    ).slice(0, MAX_IMAGE_SLOTS);

    let nextImageSlot = 0;
    let overflowImageCount = 0;

    // ==========================================
    // UPLOAD BUTTON
    // ==========================================

    uploadButton.addEventListener("click", () => {
        uploadInput.click();
    });

    uploadInput.addEventListener("change", async (event) => {

        const file = event.target.files[0];

        if (!file) return;

        uploadButton.disabled = true;
        overflowImageCount = 0;

        try {

            setStatus("PROCESSING EVIDENCE...");

            const extension = file.name.split(".").pop().toLowerCase();

            switch (extension) {

                case "pdf":
                    await processPDF(file);
                    break;

                case "docx":
                    await processDOCX(file);
                    break;

                case "txt":
                    await processTXT(file);
                    break;

                case "mp4":
                case "mov":
                case "webm":
                    await processVideo(file);
                    break;

                default:
                    throw new Error("Unsupported file format.");

            }

            if (overflowImageCount > 0) {

                setStatus(
                    `IMPORT COMPLETE. ${overflowImageCount} ADDITIONAL IMAGE(S) DID NOT FIT INTO THE SIX SLOTS.`
                );

            } else {

                setStatus("EVIDENCE IMPORTED SUCCESSFULLY.");

            }

        } catch (error) {

            console.error("FORENZA evidence error:", error);

            setStatus("IMPORT FAILED: " + error.message, "error");

        } finally {

            uploadButton.disabled = false;
            uploadInput.value = "";
            updateWordCount();

        }

    });

    // ==========================================
    // STATUS
    // ==========================================

    function setStatus(message, type = "") {

        if (!uploadStatus) return;

        uploadStatus.textContent = message;

        uploadStatus.classList.remove("is-error", "is-success");

        if (type) {
            uploadStatus.classList.add(`is-${type}`);
        }

    }

    // ==========================================
    // DOCUMENT TEXT
    // ==========================================

    function appendToDocument(text) {

        if (!caseDocument || !text.trim()) return;

        const existingText = caseDocument.value.trim();

        caseDocument.value = existingText
            ? existingText + "\n\n" + text
            : text;

        updateWordCount();

    }

    function updateWordCount() {

        if (!caseDocument || !wordCount) return;

        const text = caseDocument.value.trim();

        const words = text
            ? text.split(/\s+/).length
            : 0;

        wordCount.textContent = `${words} WORDS`;

    }

    // ==========================================
    // IMAGE DISPLAY
    // USE EXISTING PLACEHOLDERS ONLY
    // ==========================================

    function addImageToGallery(src, caption) {

        if (nextImageSlot >= imageSlots.length) {

            overflowImageCount++;

            console.warn(
                "FORENZA: All six image placeholders are occupied.",
                caption
            );

            return false;

        }

        const slot = imageSlots[nextImageSlot];

        nextImageSlot++;

        // Remove the original icon and placeholder text.
        slot.replaceChildren();

        const image = document.createElement("img");

        image.src = src;
        image.alt = caption;
        image.className = "evidence-slot-image";

        const label = document.createElement("span");

        label.className = "evidence-slot-caption";
        label.textContent = caption;
        label.title = caption;

        slot.appendChild(image);
        slot.appendChild(label);

        slot.setAttribute("aria-label", caption);

        return true;

    }

    // ==========================================
    // PDF PROCESSING
    // ==========================================

    async function processPDF(file) {

        if (!window.pdfjsLib) {
            throw new Error("PDF.js is missing. Check the HTML imports.");
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const buffer = await file.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({
            data: buffer
        }).promise;

        let extractedText = "";

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {

            setStatus(
                `PROCESSING PDF PAGE ${pageNumber}/${pdf.numPages}`
            );

            const page = await pdf.getPage(pageNumber);

            const textContent = await page.getTextContent();

            const pageText = textContent.items
                .map(item => item.str)
                .join(" ");

            extractedText +=
                `\n--- PDF PAGE ${pageNumber} ---\n${pageText}\n`;

            // Render the complete PDF page as an image.
            const viewport = page.getViewport({
                scale: 1.5
            });

            const canvas = document.createElement("canvas");

            const context = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport
            }).promise;

            addImageToGallery(
                canvas.toDataURL("image/jpeg", 0.85),
                `${file.name} - PAGE ${pageNumber}`
            );

        }

        appendToDocument(
            `IMPORTED PDF: ${file.name}\n${extractedText}`
        );

    }

    // ==========================================
    // DOCX PROCESSING
    // ==========================================

    async function processDOCX(file) {

        if (!window.mammoth || !window.JSZip) {
            throw new Error("Mammoth or JSZip is missing.");
        }

        const buffer = await file.arrayBuffer();

        const result = await mammoth.extractRawText({
            arrayBuffer: buffer
        });

        appendToDocument(
            `IMPORTED WORD DOCUMENT: ${file.name}\n${result.value}`
        );

        // Extract embedded Word images.
        const zip = await JSZip.loadAsync(buffer);

        const mediaFiles = Object.keys(zip.files).filter(name =>
            name.startsWith("word/media/") &&
            !zip.files[name].dir
        );

        for (const mediaFile of mediaFiles) {

            const blob = await zip.files[mediaFile].async("blob");

            const imageURL = URL.createObjectURL(blob);

            addImageToGallery(
                imageURL,
                `${file.name} - ${mediaFile.split("/").pop()}`
            );

        }

    }

    // ==========================================
    // TXT PROCESSING
    // ==========================================

    async function processTXT(file) {

        const text = await file.text();

        appendToDocument(
            `IMPORTED TEXT FILE: ${file.name}\n${text}`
        );

    }

    // ==========================================
    // VIDEO HELPERS
    // ==========================================

    function waitForEvent(element, eventName) {

        return new Promise((resolve, reject) => {

            const onSuccess = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(
                    new Error("The video could not be loaded or played.")
                );
            };

            const cleanup = () => {
                element.removeEventListener(eventName, onSuccess);
                element.removeEventListener("error", onError);
            };

            element.addEventListener(eventName, onSuccess, {
                once: true
            });

            element.addEventListener("error", onError, {
                once: true
            });

        });

    }

    async function seekVideo(video, time) {

        if (Math.abs(video.currentTime - time) < 0.05) {
            return;
        }

        const seekPromise = waitForEvent(video, "seeked");

        video.currentTime = time;

        await seekPromise;

    }

    function formatTimestamp(seconds) {

        const minutes = Math.floor(seconds / 60);

        const remainingSeconds = Math.floor(seconds % 60);

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(remainingSeconds).padStart(2, "0")
        );

    }

    // ==========================================
    // VIDEO FRAME EXTRACTION
    // ==========================================

    async function extractVideoFrames(video, file) {

        const canvas = document.createElement("canvas");

        const context = canvas.getContext("2d");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const duration = video.duration;

        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error("Could not determine video duration.");
        }

        const frameTimes = [];

        for (let time = 0; time < duration; time += FRAME_INTERVAL) {
            frameTimes.push(time);
        }

        if (
            frameTimes.length === 0 ||
            duration - frameTimes[frameTimes.length - 1] > 1
        ) {
            frameTimes.push(Math.max(0, duration - 0.2));
        }

        for (let i = 0; i < frameTimes.length; i++) {

            const time = frameTimes[i];

            setStatus(
                `EXTRACTING VIDEO FRAME ${i + 1}/${frameTimes.length}`
            );

            await seekVideo(video, time);

            context.drawImage(
                video,
                0,
                0,
                canvas.width,
                canvas.height
            );

            addImageToGallery(
                canvas.toDataURL("image/jpeg", 0.85),
                `${file.name} - ${formatTimestamp(time)}`
            );

        }

    }

    // ==========================================
    // VIDEO AUDIO TRANSCRIPTION
    // ==========================================

    async function transcribeVideoAudio(video) {

        if (!video.captureStream && !video.mozCaptureStream) {

            throw new Error(
                "Your browser does not support video audio capture. Use Chrome."
            );

        }

        if (!window.MediaRecorder) {
            throw new Error("Your browser does not support audio recording.");
        }

        const capture = video.captureStream || video.mozCaptureStream;

        const stream = capture.call(video);

        const audioTracks = stream.getAudioTracks();

        if (!audioTracks.length) {

            stream.getTracks().forEach(track => track.stop());

            appendToDocument(
                "AUDIO TRANSCRIPTION: No audio track was detected in this video."
            );

            return;

        }

        const audioStream = new MediaStream(audioTracks);

        let mimeType = "";

        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
        }

        const recorder = mimeType
            ? new MediaRecorder(audioStream, { mimeType })
            : new MediaRecorder(audioStream);

        const chunks = [];

        recorder.ondataavailable = event => {

            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }

        };

        const recordingFinished = new Promise((resolve, reject) => {

            recorder.onstop = resolve;

            recorder.onerror = () => {
                reject(new Error("Audio recording failed."));
            };

        });

        const videoEnded = new Promise((resolve, reject) => {

            video.addEventListener("ended", resolve, {
                once: true
            });

            video.addEventListener("error", () => {
                reject(new Error("Video playback failed during audio capture."));
            }, {
                once: true
            });

        });

        try {

            await seekVideo(video, 0);

            recorder.start(1000);

            await video.play();

            setStatus("RECORDING VIDEO AUDIO FOR TRANSCRIPTION...");

            await videoEnded;

            if (recorder.state !== "inactive") {
                recorder.stop();
            }

            await recordingFinished;

            const audioBlob = new Blob(chunks, {
                type: recorder.mimeType || "audio/webm"
            });

            if (!audioBlob.size) {
                throw new Error("No audio data was captured.");
            }

            if (audioBlob.size > 24 * 1024 * 1024) {
                throw new Error(
                    "Extracted audio exceeds the 24 MB server limit. Try a shorter video."
                );
            }

            setStatus("SENDING AUDIO TO LOCAL WHISPER...");

            const formData = new FormData();

            const extension = audioBlob.type.includes("mp4")
                ? "m4a"
                : "webm";

            formData.append(
                "audio",
                audioBlob,
                `forenza-audio.${extension}`
            );

            const response = await fetch(TRANSCRIPTION_SERVER, {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Transcription server error."
                );
            }

            if (!data.transcript || !data.transcript.trim()) {

                appendToDocument(
                    "AI TRANSCRIPTION: No clear speech was detected."
                );

                return;

            }

            appendToDocument(
                `AI AUDIO TRANSCRIPTION - ${new Date().toLocaleString()}\n\n${data.transcript}\n\nNOTE: This is an automatically generated transcript. Verify it against the original video.`
            );

        } finally {

            stream.getTracks().forEach(track => track.stop());

            audioStream.getTracks().forEach(track => track.stop());

        }

    }

    // ==========================================
    // COMPLETE VIDEO PROCESSING
    // ==========================================

    async function processVideo(file) {

        const videoURL = URL.createObjectURL(file);

        const video = document.createElement("video");

        video.preload = "auto";
        video.playsInline = true;
        video.controls = false;

        try {

            const metadataPromise = waitForEvent(
                video,
                "loadedmetadata"
            );

            video.src = videoURL;
            video.load();

            await metadataPromise;

            if (!video.videoWidth || !video.videoHeight) {
                throw new Error(
                    "This video format cannot be decoded by your browser."
                );
            }

            appendToDocument(
                `IMPORTED VIDEO: ${file.name}\nDuration: ${formatTimestamp(video.duration)}\nFrame extraction interval: ${FRAME_INTERVAL} seconds.`
            );

            // Extract frames into the six original image placeholders.
            await extractVideoFrames(video, file);

            // Transcribe video audio using local Whisper.
            await transcribeVideoAudio(video);

        } finally {

            video.pause();

            video.removeAttribute("src");

            video.load();

            URL.revokeObjectURL(videoURL);

        }

    }

    // ==========================================
    // INITIALISE
    // ==========================================

    updateWordCount();

    console.log(
        `FORENZA: Evidence upload system ready. ${imageSlots.length} original image placeholders detected.`
    );

});
