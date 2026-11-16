
/* =====================================
   FORENZA — FIREBASE CONFIGURATION
===================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBWFHilFvdXS4gle_O-QYFczVQMPRtD0kU",
    authDomain: "forenza-dd3a4.firebaseapp.com",
    projectId: "forenza-dd3a4",
    storageBucket: "forenza-dd3a4.firebasestorage.app",
    messagingSenderId: "937639511041",
    appId: "1:937639511041:web:797da0b23a4c2d9bb2ec00",
    measurementId: "G-2TFM7H6089"
};

// INITIALISE FIREBASE
const app = initializeApp(firebaseConfig);

// INITIALISE AUTHENTICATION
const auth = getAuth(app);

// EXPORT FIREBASE SERVICES
export {
    app,
    auth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
};
