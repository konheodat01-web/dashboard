try {
  const firebaseConfig = {
    apiKey: "AIzaSyCmSa2SCBqEZ2-1itjClGzr3dyMalKDdg0",
    authDomain: "haihieu-tracker.firebaseapp.com",
    databaseURL: "https://haihieu-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "haihieu-tracker",
    storageBucket: "haihieu-tracker.firebasestorage.app",
    messagingSenderId: "369472069929",
    appId: "1:369472069929:web:4fff450161c9ef018b5738"
  };
  firebase.initializeApp(firebaseConfig);
  window._fbDb = firebase.database();
  window._fbReady = true;
  console.log('Firebase v8 ready');
} catch(e) {
  console.warn('Firebase init failed:', e);
  window._fbReady = false;
}
