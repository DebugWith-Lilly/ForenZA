
import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase.js";


// =====================================
// ELEMENTS
// =====================================

const workspace = document.getElementById("workspace");
const caseNotFound = document.getElementById("caseNotFound");

const STORAGE_KEY = "forenzaCases";


// =====================================
// GET SELECTED CASE ID
// =====================================

const urlParams = new URLSearchParams(window.location.search);

const caseId = urlParams.get("caseId");


// =====================================
// LOAD CASES FROM LOCAL STORAGE
// =====================================

function getCases() {

    try {

        const savedCases = JSON.parse(
            localStorage.getItem(STORAGE_KEY)
        );

        return Array.isArray(savedCases) ? savedCases : [];

    } catch (error) {

        console.error("FORENZA: Unable to load cases.", error);

        return [];

    }

}


// =====================================
// FIND SELECTED CASE
// =====================================

function loadCase() {

    const cases = getCases();

    const selectedCase = cases.find(
        item => String(item.id) === String(caseId)
    );


    if (!selectedCase) {

        workspace.style.display = "none";

        caseNotFound.style.display = "block";

        lucide.createIcons();

        return;

    }


    displayCase(selectedCase);

}


// =====================================
// DISPLAY CASE INFORMATION
// =====================================

function displayCase(item) {


    // CASE NAME

    document.getElementById("caseName").textContent =
        item.name || "Untitled Investigation";


    // CASE REFERENCE

    document.getElementById("caseReference").textContent =
        `CASE REFERENCE: ${item.number || "N/A"}`;


    document.getElementById("overviewReference").textContent =
        item.number || "N/A";


    // LOCATION

    document.getElementById("overviewLocation").textContent =
        item.location || "Location not specified";


    // DESCRIPTION

    document.getElementById("caseDescription").textContent =
        item.description || "No case description provided.";


    // DATE CREATED

    const date = new Date(item.createdAt);

    document.getElementById("overviewDate").textContent =
        Number.isNaN(date.getTime())
            ? "Date unavailable"
            : date.toLocaleDateString("en-ZA", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });


    // CASE STATUS

    const statusElement = document.getElementById("caseStatus");

    const status = ["Active", "Pending", "Closed"].includes(item.status)
        ? item.status
        : "Pending";

    statusElement.textContent = status.toUpperCase();

    statusElement.className =
        `case-status ${status.toLowerCase()}`;


    // CASE ACTIVITY

    displayActivity(item);


    // INITIALISE ICONS

    lucide.createIcons();

}


// =====================================
// CASE ACTIVITY
// =====================================

function displayActivity(item) {

    const activityList = document.getElementById("activityList");

    activityList.replaceChildren();


    const activityItem = document.createElement("div");

    activityItem.className = "activity-item";


    const iconContainer = document.createElement("div");

    iconContainer.className = "activity-icon";


    const icon = document.createElement("i");

    icon.setAttribute("data-lucide", "folder-plus");


    iconContainer.appendChild(icon);


    const activityDetails = document.createElement("div");

    activityDetails.className = "activity-details";


    const heading = document.createElement("strong");

    heading.textContent = "Investigation case created";


    const description = document.createElement("span");

    const date = new Date(item.createdAt);

    description.textContent = Number.isNaN(date.getTime())
        ? "Case record created."
        : `Case created on ${date.toLocaleString("en-ZA")}`;


    activityDetails.append(heading, description);

    activityItem.append(iconContainer, activityDetails);

    activityList.appendChild(activityItem);


    lucide.createIcons();

}


// =====================================
// OPEN INVESTIGATION MODULES
// =====================================

// DRONE LIVE FEED

document.getElementById("openDrone").addEventListener("click", () => {

    window.location.href = "drone.html";

});


// EVIDENCE FILES

document.getElementById("openEvidence").addEventListener("click", () => {

    window.location.href = "evidence.html";

});


// AI SUMMARY

document.getElementById("openSummary").addEventListener("click", () => {

    window.location.href = "processing.html";

});


// =====================================
// FIREBASE SIGN OUT
// =====================================

const logoutLink = document.querySelector(".logout-link");

if (logoutLink) {

    logoutLink.addEventListener("click", async (event) => {

        event.preventDefault();

        try {

            await signOut(auth);

            window.location.replace("login.html");

        } catch (error) {

            console.error("FORENZA sign-out error:", error);

            alert("Unable to sign out. Please try again.");

        }

    });

}


// =====================================
// FIREBASE AUTHENTICATION
// =====================================

onAuthStateChanged(auth, (user) => {

    if (!user) {

        window.location.replace("login.html");

        return;

    }

    console.log("FORENZA: Investigator authenticated.");

    if (!caseId) {

        workspace.style.display = "none";

        caseNotFound.style.display = "block";

        lucide.createIcons();

        return;

    }

    loadCase();

});
