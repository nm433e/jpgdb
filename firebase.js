const firebaseConfig = {
    apiKey: "AIzaSyB5fkumP2ZH8vjAWHxo8kFCN_dDT8vxff8",
    authDomain: "jpgdb-e5f3b.firebaseapp.com",
    projectId: "jpgdb-e5f3b",
    storageBucket: "jpgdb-e5f3b.firebasestorage.app",
    messagingSenderId: "327439075077",
    appId: "1:327439075077:web:a7d4a2d6dfd15f12c9996c",
    measurementId: "G-712REZSFG9"
  };
  
  // initialize
  firebase.initializeApp(firebaseConfig);
  
  // services, attach to window
  window.fbAuth = firebase.auth();
  window.fbFirestore = firebase.firestore();
  
  // Authentication functions
  window.firebaseApp = {
    async signInWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await window.fbAuth.signInWithPopup(provider);
      } catch (error) {
        console.error("Sign-in error:", error);
      }
    },
  
    signOutUser: () => window.fbAuth.signOut(),
  
    async getUserData(userId) {
      const doc = await window.fbFirestore.collection('userData').doc(userId).get();
      return doc.exists ? doc.data() : { readStatus: {}, filters: {} };
    },
  
    async updateUserData(userId, data) {
      await window.fbFirestore.collection('userData').doc(userId).set(data, { merge: true });
    }
  };