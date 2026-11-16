
const caseModal = document.getElementById("caseModal");
const caseForm = document.getElementById("caseForm");
const caseList = document.getElementById("caseList");

const newCaseButtons = [
    document.getElementById("openCreateModal"),
    document.getElementById("emptyCreateButton")
];

const closeCaseModal = document.getElementById("closeCaseModal");
const cancelCase = document.getElementById("cancelCase");

const totalCases = document.getElementById("totalCases");
const activeCases = document.getElementById("activeCases");
const closedCases = document.getElementById("closedCases");
const caseCount = document.getElementById("caseCount");

const searchCases = document.getElementById("searchCases");
const filterStatus = document.getElementById("filterStatus");

let cases = JSON.parse(localStorage.getItem("forenzaCases")) || [];

function openModal() {
    caseForm.reset();
    caseModal.classList.add("active");
    caseModal.style.display = "flex";
}

function closeModal() {
    caseModal.classList.remove("active");
    caseModal.style.display = "none";
}

newCaseButtons.forEach(button => {
    if (button) {
        button.addEventListener("click", openModal);
    }
});

if (closeCaseModal) {
    closeCaseModal.addEventListener("click", closeModal);
}

if (cancelCase) {
    cancelCase.addEventListener("click", closeModal);
}

function saveCases() {
    localStorage.setItem("forenzaCases", JSON.stringify(cases));
}

function renderCases() {
    if (!caseList) return;

    const searchText = searchCases?.value.toLowerCase() || "";
    const selectedStatus = filterStatus?.value || "all";

    const filteredCases = cases.filter(item => {
        const matchesSearch =
            item.name.toLowerCase().includes(searchText) ||
            item.number.toLowerCase().includes(searchText) ||
            item.location.toLowerCase().includes(searchText);

        const matchesStatus =
            selectedStatus === "all" ||
            item.status.toLowerCase() === selectedStatus.toLowerCase();

        return matchesSearch && matchesStatus;
    });

    caseList.innerHTML = "";

    filteredCases.forEach(item => {
        const card = document.createElement("div");
        card.className = "case-card";

        card.innerHTML = `
            <div class="case-card-header">
                <h3></h3>
                <span class="case-status"></span>
            </div>
            <p class="case-number"></p>
            <p class="case-location"></p>
            <p class="case-description"></p>
        `;

        card.querySelector("h3").textContent = item.name;
        card.querySelector(".case-status").textContent = item.status;
        card.querySelector(".case-number").textContent = `CASE: ${item.number}`;
        card.querySelector(".case-location").textContent = item.location;
        card.querySelector(".case-description").textContent = item.description;

        caseList.appendChild(card);
    });

    if (caseCount) {
        caseCount.textContent = `${filteredCases.length} CASE${filteredCases.length === 1 ? "" : "S"}`;
    }

    if (totalCases) totalCases.textContent = cases.length;
    if (activeCases) {
        activeCases.textContent = cases.filter(item =>
            item.status.toLowerCase() === "active"
        ).length;
    }
    if (closedCases) {
        closedCases.textContent = cases.filter(item =>
            item.status.toLowerCase() === "closed"
        ).length;
    }

    const emptyState = document.getElementById("emptyState");

    if (emptyState) {
        emptyState.style.display = filteredCases.length === 0 ? "block" : "none";
    }
}

if (caseForm) {
    caseForm.addEventListener("submit", event => {
        event.preventDefault();

        const name = document.getElementById("caseName").value.trim();
        const number = document.getElementById("caseNumber").value.trim();
        const status = document.getElementById("caseStatus").value;
        const location = document.getElementById("caseLocation").value.trim();
        const description = document.getElementById("caseDescription").value.trim();

        if (!name || !number || !location || !description) {
            alert("Please complete all the case details.");
            return;
        }

        const duplicate = cases.some(item =>
            item.number.toLowerCase() === number.toLowerCase()
        );

        if (duplicate) {
            alert("A case with this case number already exists.");
            return;
        }

        cases.push({
            id: Date.now(),
            name,
            number,
            status,
            location,
            description,
            createdAt: new Date().toISOString()
        });

        saveCases();
        renderCases();
        closeModal();
    });
}

if (searchCases) {
    searchCases.addEventListener("input", renderCases);
}

if (filterStatus) {
    filterStatus.addEventListener("change", renderCases);
}

// Heading typing effect
const heading = document.getElementById("dashboard-typing");

if (heading) {
    const headingText = "FIND A PARTICULAR CASE HERE";
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

renderCases();
