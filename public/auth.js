
/* =====================================
   FORENZA — LOGIN & AUTHENTICATION
===================================== */

import {
    auth,
    signInWithEmailAndPassword
} from "./firebase.js";

// =====================================
// WELCOME BACK TYPING ANIMATION
// =====================================

const typingText = document.getElementById("typing-text");
const message = "Welcome back";

let characterIndex = 0;
let deleting = false;

function typeWelcome() {
    if (!typingText) return;

    if (!deleting) {
        typingText.textContent = message.substring(0, characterIndex + 1);
        characterIndex++;

        if (characterIndex === message.length) {
            deleting = true;
            setTimeout(typeWelcome, 1800);
            return;
        }

        setTimeout(typeWelcome, 110);

    } else {
        typingText.textContent = message.substring(0, characterIndex - 1);
        characterIndex--;

        if (characterIndex === 0) {
            deleting = false;
            setTimeout(typeWelcome, 500);
            return;
        }

        setTimeout(typeWelcome, 65);
    }
}

typeWelcome();

// =====================================
// LOGIN FORM
// =====================================

const loginForm = document.getElementById("login-form");
const formMessage = document.getElementById("form-message");
const loginButton = loginForm?.querySelector(".access-button");

function showMessage(message, type = "error") {
    if (!formMessage) return;

    formMessage.textContent = message;
    formMessage.classList.add("visible");

    formMessage.style.color =
        type === "success" ? "#A6A080" : "#C99B62";
}

if (loginForm) {

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (!email || !password) {
            showMessage("Please enter your email and password.");
            return;
        }

        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = "Authenticating...";
        }

        formMessage?.classList.remove("visible");

        try {
            await signInWithEmailAndPassword(auth, email, password);

            showMessage(
                "Access granted. Opening workspace...",
                "success"
            );

            window.location.replace("dashboard.html");

        } catch (error) {

            console.error("FORENZA login error:", error);

            let errorMessage = "Unable to sign in. Please try again.";

            switch (error.code) {

                case "auth/invalid-credential":
                case "auth/wrong-password":
                case "auth/user-not-found":
                    errorMessage = "Invalid email or password.";
                    break;

                case "auth/invalid-email":
                    errorMessage = "Please enter a valid email address.";
                    break;

                case "auth/too-many-requests":
                    errorMessage = "Too many attempts. Please try again later.";
                    break;

                case "auth/network-request-failed":
                    errorMessage = "Network error. Check your internet connection.";
                    break;

                case "auth/user-disabled":
                    errorMessage = "This account has been disabled.";
                    break;
            }

            showMessage(errorMessage);

            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = "Access work space";
            }
        }
    });
}
