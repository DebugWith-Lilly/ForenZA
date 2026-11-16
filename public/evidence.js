/* =========================================================
   FORENZA — EVIDENCE DOCUMENT IMPORT

   PDF:
   - Extracts written text.
   - Creates a visual preview of each PDF page.

   DOCX:
   - Extracts written text.
   - Extracts embedded images separately.

   TXT:
   - Extracts written content.
========================================================= */

(() => {
    "use strict";

    const uploadInput = document.getElementById("evidence-upload-input");
    const uploadButton = document.getElementById("evidence-upload-button");
    const uploadStatus = document.getElementById("upload-status");
    const documentArea = document.getElementById("case-document");
    const imageGallery = document.getElementById("image-gallery");

    if (
        !uploadInput ||
        !uploadButton ||
        !uploadStatus ||
        !documentArea ||
        !imageGallery
    ) {
        console.error("FORENZA: Evidence upload elements could not be found.");
        return;
    }

    const createdImageUrls = [];

    // Open the file selector when the upload button is clicked.
    uploadButton.addEventListener("click", () => {
        uploadInput.click();
    });

    // Process the selected document.
    uploadInput.addEventListener("change", async () => {

        const file = uploadInput.files && uploadInput.files[0];

        if (!file) return;

        setBusy(true);
        setStatus(`IMPORTING ${file.name.toUpperCase()}...`);

        try {

            const extension = file.name
                .split(".")
                .pop()
                .toLowerCase();

            let extractedText = "";
            let extractedImages = [];

            // PDF DOCUMENT
            if (extension === "pdf") {

                ({
                    text: extractedText,
                    images: extractedImages
                } = await readPdf(file));

            }

            // WORD DOCUMENT
            else if (extension === "docx") {

                ({
                    text: extractedText,
                    images: extractedImages
                } = await readDocx(file));

            }

            // TEXT DOCUMENT
            else if (extension === "txt") {

                extractedText = await file.text();

            }

            else {

                throw new Error(
                    "Unsupported file type. Please choose a PDF, DOCX or TXT file."
                );

            }

            // Check whether anything was extracted.
            if (!extractedText.trim() && extractedImages.length === 0) {

                throw new Error(
                    "No readable text or images were found in this document."
                );

            }

            // ADD WRITTEN CONTENT TO CASE DOCUMENT.
            if (extractedText.trim()) {

                const heading =
                    `\n\n========== IMPORTED DOCUMENT: ${file.name} ==========\n\n`;

                documentArea.value = documentArea.value.trim()
                    ? `${documentArea.value.trim()}${heading}${extractedText.trim()}`
                    : `${file.name}\n${"-".repeat(Math.min(file.name.length, 60))}\n\n${extractedText.trim()}`;

                // Update the word counter.
                documentArea.dispatchEvent(
                    new Event("input", { bubbles: true })
                );

            }

            // ADD EXTRACTED IMAGES TO THE IMAGE GALLERY.
            if (extractedImages.length) {

                addImages(extractedImages);

            }

            const imageCount = extractedImages.length;

            const importedWords = extractedText.trim()
                ? extractedText.trim().split(/\s+/).length
                : 0;

            setStatus(
                `IMPORT COMPLETE · ${importedWords} WORDS · ${imageCount} IMAGE${imageCount === 1 ? "" : "S"} ADDED`,
                "success"
            );

        } catch (error) {

            console.error("FORENZA document import error:", error);

            setStatus(
                error.message || "Unable to import this document.",
                "error"
            );

        } finally {

            setBusy(false);

            // Allow the same file to be selected again.
            uploadInput.value = "";

        }

    });


    /* =====================================================
       PDF READER
    ===================================================== */

    async function readPdf(file) {

        if (!window.pdfjsLib) {

            throw new Error(
                "PDF reader could not load. Check your internet connection and refresh the page."
            );

        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const buffer = await file.arrayBuffer();

        const pdf = await window.pdfjsLib.getDocument({
            data: new Uint8Array(buffer)
        }).promise;

        const textParts = [];
        const images = [];

        // Process every PDF page.
        for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber++
        ) {

            setStatus(
                `READING PDF PAGE ${pageNumber} OF ${pdf.numPages}...`
            );

            const page = await pdf.getPage(pageNumber);

            // Extract text from the current page.
            const textContent = await page.getTextContent();

            const pageText = textContent.items
                .map(item => item.str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();

            if (pageText) {

                textParts.push(
                    `PAGE ${pageNumber}\n${pageText}`
                );

            }

            // Render the PDF page as a visual evidence preview.
            const viewport = page.getViewport({
                scale: 1.35
            });

            const canvas = document.createElement("canvas");

            const context = canvas.getContext("2d", {
                alpha: false
            });

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);

            await page.render({
                canvasContext: context,
                viewport
            }).promise;

            const blob = await new Promise(resolve => {

                canvas.toBlob(
                    resolve,
                    "image/jpeg",
                    0.88
                );

            });

            if (blob) {

                images.push({
                    blob,
                    name: `${file.name} — PAGE ${String(pageNumber).padStart(2, "0")}`
                });

            }

            // Release the canvas memory.
            canvas.width = 0;
            canvas.height = 0;

        }

        return {
            text: textParts.join("\n\n"),
            images
        };

    }


    /* =====================================================
       WORD DOCUMENT READER
    ===================================================== */

    async function readDocx(file) {

        if (!window.mammoth || !window.JSZip) {

            throw new Error(
                "Word document reader could not load. Check your internet connection and refresh the page."
            );

        }

        const buffer = await file.arrayBuffer();

        // Extract written content.
        const result = await window.mammoth.extractRawText({
            arrayBuffer: buffer
        });

        // Open the DOCX archive to locate embedded images.
        const zip = await window.JSZip.loadAsync(buffer);

        const mediaFiles = Object.keys(zip.files).filter(path =>

            path.startsWith("word/media/") &&
            !zip.files[path].dir &&
            /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(path)

        );

        const images = [];

        // Extract each embedded image.
        for (const path of mediaFiles) {

            const blob = await zip.files[path].async("blob");

            images.push({
                blob,
                name: path.split("/").pop()
            });

        }

        return {
            text: result.value || "",
            images
        };

    }


    /* =====================================================
       ADD IMAGES TO CASE IMAGES GALLERY
    ===================================================== */

    function addImages(images) {

        // Remove the original empty placeholders on first import.
        imageGallery
            .querySelectorAll(".image-placeholder")
            .forEach(node => node.remove());

        images.forEach((item, index) => {

            const url = URL.createObjectURL(item.blob);

            createdImageUrls.push(url);

            const card = document.createElement("div");

            card.className = "image-evidence-card";

            const image = document.createElement("img");

            image.src = url;

            image.alt = `Imported evidence ${item.name}`;

            image.loading = "lazy";

            const caption = document.createElement("span");

            caption.textContent =
                item.name || `IMPORTED IMAGE ${index + 1}`;

            card.append(image, caption);

            imageGallery.appendChild(card);

        });

    }


    /* =====================================================
       UPLOAD BUTTON STATE
    ===================================================== */

    function setBusy(isBusy) {

        uploadButton.disabled = isBusy;

        uploadButton.querySelector("span").textContent =
            isBusy ? "IMPORTING..." : "UPLOAD DOCUMENT";

    }


    /* =====================================================
       UPLOAD STATUS
    ===================================================== */

    function setStatus(message, type = "") {

        uploadStatus.textContent = message;

        uploadStatus.classList.toggle(
            "is-error",
            type === "error"
        );

        uploadStatus.classList.toggle(
            "is-success",
            type === "success"
        );

    }


    /* =====================================================
       CLEAN UP IMAGE PREVIEWS
    ===================================================== */

    window.addEventListener("beforeunload", () => {

        createdImageUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });

    });

})();