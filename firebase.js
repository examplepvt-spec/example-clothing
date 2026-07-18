// firebase-offline.js
// Fallback Firebase module using localStorage only
// No CDN dependencies - works completely offline

class LocalStorageAuth {
  constructor() {
    this.currentUser = null;
  }

  onAuthStateChanged(callback) {
    // Check if user is stored in localStorage
    const user = this.getUser();
    if (callback) callback(user);
  }

  getUser() {
    try {
      const userData = localStorage.getItem('_firebase_user');
      return userData ? JSON.parse(userData) : null;
    } catch (e) {
      return null;
    }
  }

  setUser(uid, email) {
    localStorage.setItem('_firebase_user', JSON.stringify({ uid, email }));
  }

  logout() {
    localStorage.removeItem('_firebase_user');
  }
}

class LocalStorageDB {
  constructor() {
    this.storagePrefix = '_firestore_';
  }

  collection(path1, id, path2, id2) {
    return {
      add: async (data) => this.add(path1, id, path2, id2, data),
      get: async () => this.get(path1, id, path2),
      getDocs: async () => this.getDocs(path1, id, path2),
      doc: (docId) => ({
        update: async (data) => this.update(path1, id, path2, id2, docId, data),
        delete: async () => this.delete(path1, id, path2, id2, docId),
      }),
    };
  }

  add(path1, id, path2, id2, data) {
    const key = `${this.storagePrefix}${path1}/${id}/${path2}`;
    const items = this.getCollection(key);
    const newId = `doc_${Date.now()}`;
    items[newId] = { id: newId, ...data };
    localStorage.setItem(key, JSON.stringify(items));
    return { id: newId };
  }

  get(path1, id, path2) {
    const key = `${this.storagePrefix}${path1}/${id}/${path2}`;
    const items = this.getCollection(key);
    return { docs: Object.values(items) };
  }

  getDocs(path1, id, path2) {
    const key = `${this.storagePrefix}${path1}/${id}/${path2}`;
    const items = this.getCollection(key);
    const docs = Object.values(items).map(item => ({
      id: item.id,
      data: () => item,
    }));
    return docs;
  }

  update(path1, id, path2, id2, docId, data) {
    const key = `${this.storagePrefix}${path1}/${id}/${path2}`;
    const items = this.getCollection(key);
    if (items[docId]) {
      items[docId] = { ...items[docId], ...data };
      localStorage.setItem(key, JSON.stringify(items));
    }
  }

  delete(path1, id, path2, id2, docId) {
    const key = `${this.storagePrefix}${path1}/${id}/${path2}`;
    const items = this.getCollection(key);
    delete items[docId];
    localStorage.setItem(key, JSON.stringify(items));
  }

  getCollection(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }
}

// Export offline implementations
const auth = new LocalStorageAuth();
const db = new LocalStorageDB();

// Also try to load real Firebase if available
let firebaseLoaded = false;

const initFirebase = async () => {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const firebaseConfig = {
      apiKey: "AIzaSyB-EXAMPLE-KEY",
      authDomain: "example-clothing.firebaseapp.com",
      projectId: "example-clothing",
      storageBucket: "example-clothing.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef123456"
    };

    const app = initializeApp(firebaseConfig);
    window.firebase = {
      app,
      auth: getAuth(app),
      db: getFirestore(app)
    };
    firebaseLoaded = true;
    console.log("Real Firebase loaded");
  } catch (e) {
    console.log("Firebase CDN not available, using offline mode");
    firebaseLoaded = false;
  }
};

// Initialize but don't block
initFirebase();

export { auth, db, firebaseLoaded };
