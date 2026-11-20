import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase.js";

// =====================================
// ELEMENTS
// =====================================

const caseModal = document.getElementById("caseModal");
const caseForm = document.getElementById("caseForm");
const caseList = document.getElementById("caseList");

const openCreateModal = document.getElementById("openCreateModal");
const emptyCreateButton = document.getElementById("emptyCreateButton");
const closeCaseModal = document.getElementById("closeCaseModal");
const cancelCase = document.getElementById("cancelCase");

const totalCases = document.getElementById("totalCases");
const activeCases = document.getElementById("activeCases");
const closedCases = document.getElementById("closedCases");
const caseCount = document.getElementById("caseCount");

const searchCases = document.getElementById("searchCases");
const filterStatus = document.getElementById("filterStatus");
const emptyState = document.getElementById("emptyState");

const editingCaseId = document.getElementById("editingCaseId");
const caseModalTitle = document.getElementById("caseModalTitle");
const caseSubmitButton = document.getElementById("caseSubmitButton");

// =====================================
// CASE STORAGE
// =====================================

const STORAGE_KEY = "forenzaCases";

let cases = [];

function loadCases() {
    try {
        const storedCases = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        cases = Array.isArray(storedCases) ? storedCases : [];

    } catch (error) {
        console.error("Could not load cases:", error);

        cases = [];

        alert("Your saved cases could not be read from this browser.");
    }
}

function saveCases() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
        return true;

    } catch (error) {
        console.error("Could not save cases:", error);

        alert(
            "Your changes could not be saved. Your browser storage may be full or unavailable."
        );

        return false;
    }
}

// =====================================
// AUTHENTICATION
// =====================================

onAuthStateChanged(auth, (user) => {

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    loadCases();
    renderCases();

});

// =====================================
// SIGN OUT
// =====================================

document.querySelector(".logout-link")?.addEventListener("click", async (event) => {

    event.preventDefault();

    try {
        await signOut(auth);
        window.location.replace("login.html");

    } catch (error) {
        console.error("Sign out error:", error);
        alert("Unable to sign out. Please try again.");
    }

});

// =====================================
// MODAL
// =====================================

function openModal() {

    caseForm.reset();

    editingCaseId.value = "";

    caseModalTitle.textContent = "Create Investigation Case";

    caseSubmitButton.innerHTML =
        '<i data-lucide="folder-plus"></i> CREATE CASE';

    caseModal.classList.add("active");

    document.body.style.overflow = "hidden";

    if (window.lucide) {
        window.lucide.createIcons();
    }

    document.getElementById("caseName").focus();

}

function closeModal() {

    caseModal.classList.remove("active");

    document.body.style.overflow = "";

}

openCreateModal?.addEventListener("click", openModal);

emptyCreateButton?.addEventListener("click", openModal);

closeCaseModal?.addEventListener("click", closeModal);

cancelCase?.addEventListener("click", closeModal);

caseModal?.addEventListener("click", (event) => {

    if (event.target === caseModal) {
        closeModal();
    }

});

document.addEventListener("keydown", (event) => {

    if (
        event.key === "Escape" &&
        caseModal.classList.contains("active")
    ) {
        closeModal();
    }

});

// =====================================
// GENERATE CASE ID
// =====================================

function generateCaseId() {

    return "FZ-" + Date.now().toString(36).toUpperCase();

}

// =====================================
// CREATE / UPDATE CASE
// =====================================

caseForm?.addEventListener("submit", (event) => {

    event.preventDefault();

    const name = document.getElementById("caseName").value.trim();

    const number = document.getElementById("caseNumber").value.trim();

    const status = document.getElementById("caseStatus").value;

    const location = document.getElementById("caseLocation").value.trim();

    const incidentDate = document.getElementById("caseDate").value;

    const description = document.getElementById("caseDescription").value.trim();

    const currentEditingId = editingCaseId.value;

    if (!name || !number) {

        alert("Please enter a case name and case reference.");

        return;

    }

    // Prevent duplicate case references.

    const duplicate = cases.some((item) =>

        item.number?.toLowerCase() === number.toLowerCase() &&
        item.id !== currentEditingId

    );

    if (duplicate) {

        alert(
            "A case with this reference already exists. Please use a different reference."
        );

        return;

    }

    // =====================================
    // UPDATE EXISTING CASE
    // =====================================

    if (currentEditingId) {

        const caseIndex = cases.findIndex(
            (item) => item.id === currentEditingId
        );

        if (caseIndex === -1) {

            alert(
                "This case could not be found. Please refresh the page and try again."
            );

            return;

        }

        const updatedCase = {

            ...cases[caseIndex],

            name,
            number,
            status,
            location,
            incidentDate,
            description,

            updatedAt: new Date().toISOString()

        };

        const previousCases = [...cases];

        cases[caseIndex] = updatedCase;

        if (!saveCases()) {

            cases = previousCases;

            return;

        }

        alert("Case updated successfully.");

    }

    // =====================================
    // CREATE NEW CASE
    // =====================================

    else {

        const newCase = {

            id: generateCaseId(),

            name,
            number,
            status,
            location,
            incidentDate,
            description,

            createdAt: new Date().toISOString()

        };

        cases.unshift(newCase);

        if (!saveCases()) {

            cases.shift();

            return;

        }

    }

    closeModal();

    searchCases.value = "";

    filterStatus.value = "all";

    renderCases();

});

// =====================================
// EDIT CASE
// =====================================

function editCase(caseId) {

    const selectedCase = cases.find(
        (item) => item.id === caseId
    );

    if (!selectedCase) {

        alert("This investigation case could not be found.");

        return;

    }

    // Fill the form with the existing case information.

    caseForm.reset();

    editingCaseId.value = selectedCase.id;

    document.getElementById("caseName").value =
        selectedCase.name || "";

    document.getElementById("caseNumber").value =
        selectedCase.number || "";

    document.getElementById("caseStatus").value =
        selectedCase.status || "Active";

    document.getElementById("caseLocation").value =
        selectedCase.location || "";

    document.getElementById("caseDate").value =
        selectedCase.incidentDate || "";

    document.getElementById("caseDescription").value =
        selectedCase.description || "";

    // Change modal heading and button.

    caseModalTitle.textContent = "Edit Investigation Case";

    caseSubmitButton.innerHTML =
        '<i data-lucide="save"></i> SAVE CHANGES';

    caseModal.classList.add("active");

    document.body.style.overflow = "hidden";

    if (window.lucide) {
        window.lucide.createIcons();
    }

    document.getElementById("caseName").focus();

}

// =====================================
// DELETE CASE
// =====================================

function deleteCase(caseId) {

    const selectedCase = cases.find(
        (item) => item.id === caseId
    );

    if (!selectedCase) {

        alert("This investigation case could not be found.");

        return;

    }

    // Ask for confirmation before deleting.

    const confirmed = window.confirm(

        `Are you sure you want to delete "${selectedCase.name}" (${selectedCase.number})?\n\nThis action cannot be undone.`

    );

    if (!confirmed) {
        return;
    }

    const previousCases = [...cases];

    cases = cases.filter(
        (item) => item.id !== caseId
    );

    if (!saveCases()) {

        cases = previousCases;

        return;

    }

    renderCases();

}

// =====================================
// RENDER CASES
// =====================================

function renderCases() {

    if (!caseList) return;

    const searchText = searchCases.value.trim().toLowerCase();

    const selectedStatus = filterStatus.value;

    const filteredCases = cases.filter((item) => {

        const matchesSearch =

            (item.name || "").toLowerCase().includes(searchText) ||

            (item.number || "").toLowerCase().includes(searchText) ||

            (item.location || "").toLowerCase().includes(searchText);

        const matchesStatus =

            selectedStatus === "all" ||
            item.status === selectedStatus;

        return matchesSearch && matchesStatus;

    });

    caseList.innerHTML = "";

    // =====================================
    // CREATE EACH CASE CARD
    // =====================================

    filteredCases.forEach((item) => {

        const card = document.createElement("article");

        card.className = "case-card";

        const main = document.createElement("div");

        main.className = "case-card-main";

        const number = document.createElement("p");

        number.className = "case-number";

        number.textContent =
            `CASE REFERENCE: ${item.number || "Not assigned"}`;

        const title = document.createElement("h3");

        title.textContent =
            item.name || "Untitled case";

        const location = document.createElement("p");

        location.className = "case-location";

        location.textContent = item.location

            ? `LOCATION: ${item.location}`

            : "LOCATION: Not specified";

        const description = document.createElement("p");

        description.className = "case-description";

        description.textContent =
            item.description || "No case description provided.";

        const date = document.createElement("p");

        date.className = "case-date";

        const createdDate = item.createdAt

            ? new Date(item.createdAt).toLocaleDateString()

            : "Unknown";

        date.textContent = `CREATED: ${createdDate}`;

        main.append(
            number,
            title,
            location,
            description,
            date
        );

        // =====================================
        // ACTIONS
        // =====================================

        const actions = document.createElement("div");

        actions.className = "case-card-actions";

        // STATUS

        const status = document.createElement("span");

        status.className = "case-status";

        if (item.status === "Closed") {

            status.classList.add("status-closed");

        } else if (item.status === "Pending") {

            status.classList.add("status-pending");

        }

        status.textContent = item.status || "Active";

        // OPEN CASE BUTTON

        const openButton = document.createElement("button");

        openButton.type = "button";

        openButton.className = "open-case-button";

        openButton.innerHTML =
            'OPEN CASE <i data-lucide="arrow-up-right"></i>';

        openButton.addEventListener("click", () => {

            openCase(item.id);

        });

        // EDIT BUTTON

        const editButton = document.createElement("button");

        editButton.type = "button";

        editButton.className = "case-action-button";

        editButton.innerHTML =
            '<i data-lucide="pencil"></i> EDIT';

        editButton.setAttribute(
            "aria-label",
            `Edit ${item.name || "case"}`
        );

        editButton.addEventListener("click", () => {

            editCase(item.id);

        });

        // DELETE BUTTON

        const deleteButton = document.createElement("button");

        deleteButton.type = "button";

        deleteButton.className =
            "case-action-button delete-case-button";

        deleteButton.innerHTML =
            '<i data-lucide="trash-2"></i> DELETE';

        deleteButton.setAttribute(
            "aria-label",
            `Delete ${item.name || "case"}`
        );

        deleteButton.addEventListener("click", () => {

            deleteCase(item.id);

        });

        actions.append(
            status,
            openButton,
            editButton,
            deleteButton
        );

        card.append(main, actions);

        caseList.appendChild(card);

    });

    // =====================================
    // UPDATE STATISTICS
    // =====================================

    updateStatistics(filteredCases.length);

    // =====================================
    // EMPTY STATE
    // =====================================

    const hasCases = filteredCases.length > 0;

    emptyState.classList.toggle(
        "visible",
        !hasCases
    );

    if (!hasCases) {

        document.getElementById("emptyTitle").textContent =

            cases.length === 0

                ? "No investigation cases yet"

                : "No matching cases found";

        document.getElementById("emptyDescription").textContent =

            cases.length === 0

                ? "Create your first investigation case to begin."

                : "Try another search term or change your status filter.";

        emptyCreateButton.style.display =

            cases.length === 0

                ? "inline-flex"

                : "none";

    }

    if (window.lucide) {

        window.lucide.createIcons();

    }

}

// =====================================
// OPEN CASE WORKSPACE
// =====================================

function openCase(caseId) {

    const selectedCase = cases.find(
        (item) => item.id === caseId
    );

    if (!selectedCase) {

        alert("This investigation case could not be found.");

        return;

    }

    window.location.href =

        `case-details.html?caseId=${encodeURIComponent(caseId)}`;

}

// =====================================
// UPDATE STATISTICS
// =====================================

function updateStatistics(filteredCount) {

    totalCases.textContent = cases.length;

    activeCases.textContent = cases.filter(

        (item) => item.status === "Active"

    ).length;

    closedCases.textContent = cases.filter(

        (item) => item.status === "Closed"

    ).length;

    caseCount.textContent =

        `${filteredCount} RECORD${filteredCount === 1 ? "" : "S"}`;

}

// =====================================
// SEARCH AND FILTER
// =====================================

searchCases?.addEventListener("input", renderCases);

filterStatus?.addEventListener("change", renderCases);

// =====================================
// TYPING HEADING
// =====================================

const heading = document.getElementById("dashboard-typing");

if (heading) {

    const headingText = "INVESTIGATION CASE FILES";

    let index = 0;

    heading.textContent = "";

    function typeHeading() {

        if (index < headingText.length) {

            heading.textContent += headingText.charAt(index);

            index++;

            setTimeout(typeHeading, 75);

        }

    }

    typeHeading();

}

// =====================================
// ICON INITIALISATION
// =====================================

if (window.lucide) {

    window.lucide.createIcons();

}