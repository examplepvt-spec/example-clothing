import { auth, db } from "../../firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Perform Admin Login via Firebase Auth + Firestore `admins/{uid}` role verification
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function adminLogin(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Verify admin doc in Firestore
    const adminDocRef = doc(db, "admins", uid);
    const adminSnap = await getDoc(adminDocRef);

    if (!adminSnap.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: "Access denied. Account is not registered as an administrator."
      };
    }

    const adminData = adminSnap.data();
    if (adminData.role !== "admin") {
      await signOut(auth);
      return {
        success: false,
        error: "Access denied. Administrator privileges required."
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Admin Login Error:", err);
    let message = "Invalid email or password.";
    if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      message = "Invalid email or password.";
    } else if (err.code === "auth/too-many-requests") {
      message = "Too many failed attempts. Please try again later.";
    } else if (err.message) {
      message = err.message;
    }
    return { success: false, error: message };
  }
}

/**
 * Admin Auth Guard for protected pages (dashboard.html, products.html, orders.html)
 * @param {Function} onAuthorized Callback invoked when admin is verified
 */
export function checkAdminAuth(onAuthorized) {
  let isChecked = false;

  onAuthStateChanged(auth, async (user) => {
    if (isChecked) return; // Prevent duplicate checks
    isChecked = true;

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    try {
      const adminDocRef = doc(db, "admins", user.uid);
      const adminSnap = await getDoc(adminDocRef);

      if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
        console.warn("Unauthorized admin access attempt by UID:", user.uid);
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }

      // Update user info display in sidebar if elements exist
      const nameEl = document.getElementById("admin-user-name");
      const emailEl = document.getElementById("admin-user-email");
      const avatarEl = document.getElementById("admin-user-avatar");

      const adminData = adminSnap.data();
      const displayName = adminData.name || user.displayName || "Admin";
      const displayEmail = user.email || "admin@example.com";

      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = displayEmail;
      if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

      if (typeof onAuthorized === "function") {
        onAuthorized(user, adminData);
      }
    } catch (err) {
      console.error("Admin Guard Authorization Check Failed:", err);
      window.location.href = "index.html";
    }
  });
}

/**
 * Log out admin
 */
export async function adminLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Logout error:", e);
  }
  window.location.href = "index.html";
}
