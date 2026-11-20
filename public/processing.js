import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase.js";

/* =========================================
   FORENZA AI SUMMARY
========================================= */

const DB_NAME = "forenzaEvidenceDB";
const DB_VERSION = 1;
const STORE_NAME = "investigations";

const REFRESH_INTERVAL = 2000;

let currentInvestigation = null;
let lastInvestigationSignature = null;
let refreshInterval = null;
let isLoading = false;
let isAuthenticated = false;

/* =========================================
   ELEMENTS
========================================= */

const typingElement =
    document.getElementById("typing-title");

const summaryContainer =
    document.getElementById("summary-container");

const previousCasesContainer =
    document.getElementById("previous-cases-container");

const downloadButton =
    document.getElementById("download-report-button");

const logoutLink =
    document.querySelector(".logout-link");

/* =========================================
   PAGE TITLE ANIMATION
========================================= */

const pageTitle = "AI OVERVIEW";

let titleIndex = 0;

function typeTitle() {

    if (!typingElement) return;

    if (titleIndex < pageTitle.length) {

        typingElement.textContent +=
            pageTitle.charAt(titleIndex);

        titleIndex++;

        setTimeout(typeTitle, 120);
    }
}

window.addEventListener("load", () => {
    setTimeout(typeTitle, 400);
});


/* =========================================
   LUCIDE ICONS
========================================= */

function refreshIcons() {

    if (window.lucide) {
        window.lucide.createIcons();
    }
}


/* =========================================
   INDEXEDDB
========================================= */

function openDatabase() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };

        request.onblocked = () => {
            reject(
                new Error("The FORENZA evidence database is blocked.")
            );
        };

    });
}


async function getSavedInvestigations() {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        let finished = false;

        function closeDatabase() {

            if (!finished) {
                finished = true;
                db.close();
            }
        }

        let transaction;

        try {

            transaction = db.transaction(
                STORE_NAME,
                "readonly"
            );

            const store = transaction.objectStore(STORE_NAME);

            const request = store.getAll();

            request.onsuccess = () => {

                const records = request.result || [];

                records.sort((a, b) => {

                    return new Date(
                        b.updatedAt || b.createdAt || 0
                    ) - new Date(
                        a.updatedAt || a.createdAt || 0
                    );

                });

                closeDatabase();

                resolve(records);
            };

            request.onerror = () => {

                closeDatabase();

                reject(request.error);
            };

            transaction.onerror = () => {

                closeDatabase();

                reject(transaction.error);
            };

        } catch (error) {

            closeDatabase();

            reject(error);
        }

    });
}


/* =========================================
   INVESTIGATION SIGNATURE
   Detects changes to saved evidence
========================================= */

function getInvestigationSignature(records) {

    /*
       We compare the saved record details rather than
       only checking the case ID.

       This means removing a PDF, changing notes,
       removing an image or deleting an investigation
       can all trigger a refresh.
    */

    return JSON.stringify(
        records.map(record => ({

            id: record.id,

            title: record.title,

            createdAt: record.createdAt,

            updatedAt: record.updatedAt,

            text: record.text,

            files: (record.files || []).map(file => ({
                name: file.name,
                type: file.type,
                size: file.size,
                uploadedAt: file.uploadedAt
            })),

            images: (record.images || []).map(image => ({
                caption: image.caption,
                dataLength: image.dataUrl
                    ? image.dataUrl.length
                    : 0
            })),

            imageCount: record.imageCount,

            wordCount: record.wordCount

        }))
    );
}


/* =========================================
   EMPTY STATE
========================================= */

function showSummaryEmptyState() {

    currentInvestigation = null;

    summaryContainer.innerHTML = `
        <div class="empty-state">

            <div class="empty-icon">
                <i data-lucide="file-search"></i>
            </div>

            <h3>No Saved Investigation</h3>

            <p>
                There is currently no saved investigation.
                Return to the Evidence page, upload your
                investigation material and save it to
                generate a new overview.
            </p>

        </div>
    `;

    downloadButton.disabled = true;

    refreshIcons();
}


/* =========================================
   TEXT HELPERS
========================================= */

function cleanText(value) {

    return String(value || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .trim();
}


function getWordCount(text) {

    const cleaned = cleanText(text);

    return cleaned
        ? cleaned.split(/\s+/).length
        : 0;
}


function getSentences(text) {

    return cleanText(text)
        .split(/(?<=[.!?])\s+|\n+/)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 15);
}


function formatDate(dateValue) {

    if (!dateValue) return "Not recorded";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Not recorded";
    }

    return date.toLocaleString("en-ZA", {
        dateStyle: "long",
        timeStyle: "short"
    });
}


/* =========================================
   GENERATE INVESTIGATION SUMMARY
========================================= */

function generateSummary(record) {

    const investigationText = cleanText(record.text);

    const files = Array.isArray(record.files)
        ? record.files
        : [];

    const images = Array.isArray(record.images)
        ? record.images
        : [];

    const sentences = getSentences(investigationText);

    const summaryParagraphs = [];

    if (investigationText) {

        const overview = sentences
            .slice(0, 5)
            .join(" ");

        summaryParagraphs.push(
            overview || investigationText.slice(0, 900)
        );

    } else {

        summaryParagraphs.push(
            "No written investigation notes were provided. " +
            "The saved record contains imported evidence files " +
            "that require investigator review."
        );

    }

    const fileNames = files.map(file => file.name);

    const imageCaptions = images
        .map(image => image.caption)
        .filter(Boolean);

    return {

        title: record.title || "Untitled Investigation",

        date: formatDate(record.createdAt),

        overview: summaryParagraphs.join("\n\n"),

        wordCount: getWordCount(investigationText),

        fileCount: files.length,

        imageCount: images.length,

        fileNames,

        imageCaptions,

        fullText: investigationText

    };
}


/* =========================================
   DISPLAY SUMMARY HELPERS
========================================= */

function addSummaryHeading(parent, text) {

    const heading = document.createElement("h3");

    heading.className = "summary-heading";
    heading.textContent = text;

    parent.appendChild(heading);
}


function addSummaryParagraph(parent, text) {

    const paragraph = document.createElement("p");

    paragraph.className = "summary-text";
    paragraph.textContent = text;

    parent.appendChild(paragraph);
}


/* =========================================
   DISPLAY SUMMARY
========================================= */

function displaySummary(record) {

    summaryContainer.replaceChildren();

    const summary = generateSummary(record);

    const meta = document.createElement("div");

    meta.className = "summary-meta";

    const tags = [
        `SAVED: ${summary.date}`,
        `${summary.imageCount} IMAGES`,
        `${summary.fileCount} FILES`,
        `${summary.wordCount} WORDS`
    ];

    tags.forEach(text => {

        const tag = document.createElement("span");

        tag.className = "summary-tag";
        tag.textContent = text;

        meta.appendChild(tag);

    });

    summaryContainer.appendChild(meta);


    /* CASE OVERVIEW */

    addSummaryHeading(
        summaryContainer,
        "CASE OVERVIEW"
    );

    addSummaryParagraph(
        summaryContainer,
        summary.overview
    );


    /* IMPORTED EVIDENCE */

    addSummaryHeading(
        summaryContainer,
        "IMPORTED EVIDENCE"
    );

    if (summary.fileNames.length) {

        const fileList = document.createElement("ul");

        fileList.className = "summary-list";

        summary.fileNames.forEach(name => {

            const item = document.createElement("li");

            item.textContent = name;

            fileList.appendChild(item);

        });

        summaryContainer.appendChild(fileList);

    } else {

        addSummaryParagraph(
            summaryContainer,
            "No imported files were recorded."
        );

    }


    /* VISUAL EVIDENCE */

    addSummaryHeading(
        summaryContainer,
        "VISUAL EVIDENCE"
    );

    if (summary.imageCaptions.length) {

        const imageList = document.createElement("ul");

        imageList.className = "summary-list";

        summary.imageCaptions.forEach(caption => {

            const item = document.createElement("li");

            item.textContent = caption;

            imageList.appendChild(item);

        });

        summaryContainer.appendChild(imageList);

    } else {

        addSummaryParagraph(
            summaryContainer,
            "No image evidence was recorded."
        );

    }


    /* INVESTIGATOR NOTES */

    addSummaryHeading(
        summaryContainer,
        "INVESTIGATOR NOTES"
    );

    addSummaryParagraph(
        summaryContainer,
        summary.fullText
            ? summary.fullText
            : "No written investigator notes were saved."
    );


    downloadButton.disabled = false;

    refreshIcons();
}


/* =========================================
   THREE REFERENCE CASES
========================================= */

const referenceCases = [

    {
        id: "FZ-REF-104",

        title: "Firearm Recovery Investigation",

        category: "FIREARM",

        icon: "crosshair",

        description:
            "An investigation involving the recovery of a firearm " +
            "at a residential scene. The reference case demonstrates " +
            "how firearm exhibits may be documented, packaged and " +
            "submitted for forensic examination.",

        evidence:
            "Reference evidence: recovered firearm, scene photographs " +
            "and exhibit documentation.",

        relevance:
            "Firearm evidence documentation"
    },

    {
        id: "FZ-REF-217",

        title: "Footwear Impression Investigation",

        category: "FOOTWEAR",

        icon: "footprints",

        description:
            "An investigation involving footwear impressions " +
            "documented near a possible point of entry. Investigators " +
            "would preserve the impression and assess whether suitable " +
            "comparison material is available.",

        evidence:
            "Reference evidence: footwear impression photographs, " +
            "scale measurements and comparison records.",

        relevance:
            "Footwear impression documentation"
    },

    {
        id: "FZ-REF-309",

        title: "School Bag Evidence Investigation",

        category: "SCHOOL BAG",

        icon: "backpack",

        description:
            "An investigation involving a school bag recovered " +
            "during a scene examination. The item is documented and " +
            "handled as an exhibit, with its contents recorded separately.",

        evidence:
            "Reference evidence: school bag photographs, item inventory " +
            "and exhibit handling records.",

        relevance:
            "Personal property evidence documentation"
    }

];


/* =========================================
   RANDOMISE REFERENCE CASE ORDER
========================================= */

function shuffleCases(cases) {

    const shuffled = [...cases];

    for (let i = shuffled.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];

    }

    return shuffled;
}


/* =========================================
   DISPLAY PREVIOUS CASES
========================================= */

function displayPreviousCases() {

    previousCasesContainer.replaceChildren();

    const list = document.createElement("div");

    list.className = "case-list";

    const selectedCases = shuffleCases(referenceCases);

    selectedCases.forEach(caseData => {

        const item = document.createElement("article");

        item.className = "case-item";

        const top = document.createElement("div");

        top.className = "case-item-top";

        const titleGroup = document.createElement("div");

        const heading = document.createElement("h3");

        heading.textContent = caseData.title;

        const id = document.createElement("span");

        id.className = "case-id";
        id.textContent = caseData.id;

        titleGroup.append(heading, id);

        const category = document.createElement("span");

        category.className = "case-category";
        category.textContent = caseData.category;

        top.append(titleGroup, category);

        const description = document.createElement("p");

        description.textContent = caseData.description;

        const evidence = document.createElement("p");

        evidence.style.marginTop = "9px";
        evidence.textContent = caseData.evidence;

        const relevance = document.createElement("span");

        relevance.className = "case-link";
        relevance.textContent = caseData.relevance.toUpperCase();

        item.append(
            top,
            description,
            evidence,
            relevance
        );

        list.appendChild(item);

    });

    previousCasesContainer.appendChild(list);

    const note = document.createElement("div");

    note.className = "demo-note";

    note.textContent =
        "These reference records provide examples of different " +
        "evidence categories for comparison during an investigation.";

    previousCasesContainer.appendChild(note);

}


/* =========================================
   REFRESH SAVED INVESTIGATION
========================================= */

async function refreshInvestigation(force = false) {

    if (isLoading || !isAuthenticated) {
        return;
    }

    isLoading = true;

    try {

        const records = await getSavedInvestigations();

        const newSignature =
            getInvestigationSignature(records);

        /*
           If nothing changed, do not rebuild the page.
        */

        if (
            !force &&
            newSignature === lastInvestigationSignature
        ) {
            return;
        }

        lastInvestigationSignature = newSignature;


        /*
           If every saved investigation has been deleted,
           clear the old information from Processing.
        */

        if (!records.length) {

            showSummaryEmptyState();

            console.log(
                "FORENZA: No saved investigations remain."
            );

            return;
        }


        /*
           The most recently updated investigation is displayed.
           If the latest one is deleted, the next saved record
           becomes the current investigation.
        */

        currentInvestigation = records[0];

        displaySummary(currentInvestigation);

        console.log(
            "FORENZA: Investigation data refreshed.",
            currentInvestigation
        );

    } catch (error) {

        console.error(
            "FORENZA: Could not refresh saved investigation.",
            error
        );

    } finally {

        isLoading = false;
    }
}


/* =========================================
   AUTOMATIC DATABASE MONITORING
========================================= */

function startInvestigationMonitoring() {

    if (refreshInterval) {
        clearInterval(refreshInterval);
    }

    /*
       IndexedDB does not automatically notify another page
       when its records are deleted or changed.

       This checks the database every 2 seconds so Processing
       can detect changes made on the Evidence page.
    */

    refreshInterval = setInterval(() => {

        refreshInvestigation(false);

    }, REFRESH_INTERVAL);

}


/* =========================================
   OPTIONAL CROSS-PAGE NOTIFICATION
========================================= */

let evidenceChannel = null;

if ("BroadcastChannel" in window) {

    evidenceChannel = new BroadcastChannel(
        "forenza-evidence-updates"
    );

    evidenceChannel.addEventListener("message", event => {

        if (
            event.data &&
            (
                event.data.type === "EVIDENCE_UPDATED" ||
                event.data.type === "EVIDENCE_DELETED" ||
                event.data.type === "INVESTIGATION_DELETED"
            )
        ) {

            refreshInvestigation(true);

        }

    });

}


/* =========================================
   PDF HELPERS
========================================= */

function addPdfText(
    doc,
    text,
    x,
    y,
    maxWidth,
    lineHeight = 6
) {

    const lines = doc.splitTextToSize(
        String(text || ""),
        maxWidth
    );

    for (const line of lines) {

        if (y > 275) {

            doc.addPage();

            y = 20;
        }

        doc.text(line, x, y);

        y += lineHeight;
    }

    return y;
}


function addPdfHeading(doc, heading, y) {

    if (y > 265) {

        doc.addPage();

        y = 20;
    }

    y += 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(150, 108, 62);

    doc.text(heading.toUpperCase(), 15, y);

    return y + 8;
}


function loadImage(dataUrl) {

    return new Promise((resolve, reject) => {

        const image = new Image();

        image.onload = () => resolve(image);

        image.onerror = () => {
            reject(new Error("An evidence image could not be loaded."));
        };

        image.src = dataUrl;

    });
}


async function imageToJpeg(dataUrl) {

    const image = await loadImage(dataUrl);

    const canvas = document.createElement("canvas");

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");

    context.fillStyle = "#FFFFFF";

    context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return {
        data: canvas.toDataURL("image/jpeg", 0.85),
        width: canvas.width,
        height: canvas.height
    };
}


/* =========================================
   GENERATE PDF CASE REPORT
========================================= */

async function downloadCaseReport() {

    if (!currentInvestigation) {

        alert(
            "No saved investigation is available. Please save evidence first."
        );

        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {

        alert(
            "The PDF library could not be loaded. Please refresh the page and try again."
        );

        return;
    }

    downloadButton.disabled = true;

    const buttonText =
        downloadButton.querySelector("span");

    const originalButtonText = buttonText.textContent;

    buttonText.textContent = "GENERATING PDF...";

    try {

        const { jsPDF } = window.jspdf;

        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        const record = currentInvestigation;

        const summary = generateSummary(record);

        const pageWidth = 210;
        const margin = 15;
        const maxWidth = pageWidth - margin * 2;

        let y = 20;


        /* REPORT HEADER */

        doc.setFillColor(12, 11, 10);

        doc.rect(
            0,
            0,
            pageWidth,
            42,
            "F"
        );

        doc.setTextColor(205, 164, 91);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);

        doc.text("FORENZA", margin, 18);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        doc.setTextColor(230, 220, 205);

        doc.text(
            "FORENSIC INVESTIGATION REPORT",
            margin,
            27
        );

        doc.setFontSize(8);

        doc.text(
            "CONFIDENTIAL - INVESTIGATOR WORKSPACE",
            margin,
            34
        );

        y = 53;


        /* CASE INFORMATION */

        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);

        doc.text("CASE INFORMATION", margin, y);

        y += 9;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const caseInfo = [
            ["Case title", record.title || "Untitled Investigation"],
            ["Record reference", record.id || "Not assigned"],
            ["Date saved", summary.date],
            ["Report generated", new Date().toLocaleString("en-ZA")],
            ["Evidence files", String(summary.fileCount)],
            ["Visual exhibits", String(summary.imageCount)]
        ];

        for (const [label, value] of caseInfo) {

            doc.setFont("helvetica", "bold");

            doc.text(`${label}:`, margin, y);

            doc.setFont("helvetica", "normal");

            const wrapped = doc.splitTextToSize(
                String(value),
                maxWidth - 38
            );

            doc.text(wrapped, margin + 38, y);

            y += Math.max(6, wrapped.length * 5);
        }


        /* OVERVIEW */

        y = addPdfHeading(
            doc,
            "Investigation Overview",
            y
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(45, 45, 45);

        y = addPdfText(
            doc,
            summary.overview,
            margin,
            y,
            maxWidth,
            5
        );


        /* INVESTIGATOR NOTES */

        y = addPdfHeading(
            doc,
            "Investigator Notes and Imported Text",
            y
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(45, 45, 45);

        y = addPdfText(
            doc,
            summary.fullText || "No written investigator notes were saved.",
            margin,
            y,
            maxWidth,
            5
        );


        /* FILE REGISTER */

        y = addPdfHeading(
            doc,
            "Imported Evidence Register",
            y
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(45, 45, 45);

        const files = Array.isArray(record.files)
            ? record.files
            : [];

        if (files.length) {

            files.forEach((file, index) => {

                y = addPdfText(
                    doc,
                    `${index + 1}. ${file.name || "Evidence file"} | Type: ${file.type || "Unknown"} | Size: ${((file.size || 0) / 1024).toFixed(1)} KB`,
                    margin,
                    y,
                    maxWidth,
                    5
                );

            });

        } else {

            y = addPdfText(
                doc,
                "No imported files were recorded.",
                margin,
                y,
                maxWidth,
                5
            );

        }


        /* IMAGE REGISTER */

        y = addPdfHeading(
            doc,
            "Visual Evidence Register",
            y
        );

        const images = Array.isArray(record.images)
            ? record.images
            : [];

        if (!images.length) {

            y = addPdfText(
                doc,
                "No visual evidence was saved.",
                margin,
                y,
                maxWidth,
                5
            );

        }


        /* IMAGE PAGES */

        for (let index = 0; index < images.length; index++) {

            const evidenceImage = images[index];

            if (!evidenceImage.dataUrl) {
                continue;
            }

            doc.addPage();

            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.setTextColor(150, 108, 62);

            doc.text(
                `VISUAL EXHIBIT ${String(index + 1).padStart(2, "0")}`,
                margin,
                20
            );

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(45, 45, 45);

            const captionLines = doc.splitTextToSize(
                evidenceImage.caption || `Evidence image ${index + 1}`,
                maxWidth
            );

            doc.text(
                captionLines,
                margin,
                29
            );

            try {

                const converted = await imageToJpeg(
                    evidenceImage.dataUrl
                );

                const maxImageWidth = maxWidth;
                const maxImageHeight = 215;

                const ratio = Math.min(
                    maxImageWidth / converted.width,
                    maxImageHeight / converted.height
                );

                const imageWidth = converted.width * ratio;
                const imageHeight = converted.height * ratio;

                doc.addImage(
                    converted.data,
                    "JPEG",
                    margin,
                    42,
                    imageWidth,
                    imageHeight
                );

            } catch (imageError) {

                console.warn(
                    "FORENZA PDF image error:",
                    imageError
                );

                doc.setFontSize(9);

                doc.text(
                    "This image could not be embedded in the PDF.",
                    margin,
                    45
                );

            }

        }


        /* FINAL DISCLAIMER */

        doc.addPage();

        y = 22;

        y = addPdfHeading(
            doc,
            "Report Disclaimer",
            y
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(45, 45, 45);

        addPdfText(
            doc,
            "This document has been compiled from the investigation " +
            "information and evidence files saved in FORENZA. The " +
            "overview is a computer-generated organisation of the " +
            "provided information and is not a verified forensic " +
            "conclusion, expert opinion or determination of guilt. " +
            "All original evidence must be preserved and independently " +
            "examined by authorised personnel. Any investigative " +
            "findings must be verified before official use.",
            margin,
            y,
            maxWidth,
            6
        );


        /* PAGE NUMBERS */

        const pageCount = doc.internal.getNumberOfPages();

        for (let page = 1; page <= pageCount; page++) {

            doc.setPage(page);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);

            doc.text(
                `FORENZA | Investigation Report | Page ${page} of ${pageCount}`,
                margin,
                290
            );

        }


        /* DOWNLOAD */

        const safeName = (record.title || "FORENZA-Case-Report")
            .replace(/[^a-z0-9-_]/gi, "_")
            .slice(0, 60);

        doc.save(`${safeName}_Report.pdf`);

    } catch (error) {

        console.error(
            "FORENZA PDF generation error:",
            error
        );

        alert(
            "The case report could not be generated. Please check the browser console for details."
        );

    } finally {

        downloadButton.disabled = !currentInvestigation;

        buttonText.textContent = originalButtonText;

        refreshIcons();
    }
}


/* =========================================
   DOWNLOAD BUTTON
========================================= */

downloadButton.addEventListener(
    "click",
    downloadCaseReport
);


/* =========================================
   AUTHENTICATION
========================================= */

onAuthStateChanged(auth, user => {

    if (!user) {

        isAuthenticated = false;

        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }

        window.location.replace("login.html");

        return;
    }

    isAuthenticated = true;

    console.log(
        "FORENZA: AI Summary workspace authenticated."
    );

    refreshInvestigation(true);

    startInvestigationMonitoring();

});


/* =========================================
   SIGN OUT
========================================= */

if (logoutLink) {

    logoutLink.addEventListener(
        "click",
        async event => {

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

        }
    );

}


/* =========================================
   INITIALISE
========================================= */

displayPreviousCases();

refreshIcons();

console.log(
    "FORENZA AI Summary module initialised."
);