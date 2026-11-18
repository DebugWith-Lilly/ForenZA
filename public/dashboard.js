/* =====================================
   FORENZA — DASHBOARD & AUTHENTICATION
===================================== */

import {
    auth,
    onAuthStateChanged,
    signOut
} from "./firebase.js";

// =====================================
// AUTHENTICATION PROTECTION
// =====================================

onAuthStateChanged(auth, (user) => {
    if (!user) {
        // No authenticated user: return to login.
        window.location.replace("login.html");
        return;
    }

    console.log("FORENZA: Investigator authenticated.");
});

// =====================================
// CURRENT DATE
// =====================================

const currentDate = document.getElementById("current-date");

if (currentDate) {
    const today = new Date();

    currentDate.textContent = today.toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// =====================================
// SIGN OUT
// =====================================

const logoutLink = document.querySelector(".logout-link");

if (logoutLink) {
    logoutLink.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            await signOut(auth);

            // Return to login after ending the session.
            window.location.replace("login.html");

        } catch (error) {
            console.error("FORENZA sign-out error:", error);
            alert("Unable to sign out. Please try again.");
        }
    });
}
