import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBE4RSDLkGFclHv-90eCPZlwSCvaKr27Po",
  authDomain: "example-clothing.firebaseapp.com",
  projectId: "example-clothing",
  storageBucket: "example-clothing.firebasestorage.app",
  messagingSenderId: "365541402622",
  appId: "1:365541402622:web:129d716d298bb2de9342af",
  measurementId: "G-MQS6NQF4ZG"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);

export { db, auth };
