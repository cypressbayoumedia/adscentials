importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
// We need the config here. Since this is static, we'll need to hardcode the config matching app.config.ts
firebase.initializeApp({
    projectId: "adscentials",
    appId: "1:758466000706:web:267d5112aa6c054c82badb",
    storageBucket: "adscentials.firebasestorage.app",
    apiKey: "AIzaSyCgOWTj-3Jo2dtboaQOEcMVCbuTWNI6qTU",
    authDomain: "adscentials.firebaseapp.com",
    messagingSenderId: "758466000706"
});

const messaging = firebase.messaging();

// messaging.onBackgroundMessage((payload) => {
//   console.log('[firebase-messaging-sw.js] Received background message ', payload);
//   // let the browser handle it automatically
// });
