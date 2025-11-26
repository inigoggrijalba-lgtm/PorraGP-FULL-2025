import firebase from "firebase/compat/app";
import "firebase/compat/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCUYthQS5ocNb2WXJYHnB8nlLPC714yHnc",
  authDomain: "porragp-notificaciones.firebaseapp.com",
  projectId: "porragp-notificaciones",
  storageBucket: "porragp-notificaciones.firebasestorage.app",
  messagingSenderId: "564026965242",
  appId: "1:564026965242:web:f72d2aada939dfff6f9d43",
  measurementId: "G-R0GGSTBBR9"
};

// Initialize Firebase
// Use compat check to avoid re-initialization in HMR
const app = firebase.apps.length === 0 ? firebase.initializeApp(firebaseConfig) : firebase.app();
export const messaging = firebase.messaging();

// ¡¡IMPORTANTE!!
// Debes reemplazar esta cadena con tu "Clave pública" real (VAPID Key)
// obtenida en Firebase Console > Configuración del proyecto > Cloud Messaging > Certificados Web Push
export const VAPID_KEY = "BJd4bu5m6_4jg8vcS92Bzhdi1zskijoYwRuPzNVtQxNz90HDDeQB0-yaG-E1qdBqyLLe9eZEGsf3Z_huD9CqxlQ";

export const requestForToken = async () => {
  try {
    // Necesitamos obtener el registro del Service Worker activo para pasárselo a Firebase
    // ya que estamos usando nuestro propio sw.js y no el firebase-messaging-sw.js por defecto
    const registration = await navigator.serviceWorker.ready;
    
    if (!registration) {
        console.error("Service Worker registration not found.");
        return null;
    }

    const currentToken = await messaging.getToken({ 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration 
    });

    if (currentToken) {
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};