import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBE4RSDLkGFclHv-90eCPZlwSCvaKr27Po",
  authDomain: "example-clothing.firebaseapp.com",
  projectId: "example-clothing",
  storageBucket: "example-clothing.firebasestorage.app",
  messagingSenderId: "365541402622",
  appId: "1:365541402622:web:129d716d298bb2de9342af"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
