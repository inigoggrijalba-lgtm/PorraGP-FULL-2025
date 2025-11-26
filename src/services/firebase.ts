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
  // 1. Comprobación inicial de soporte
  if (!('Notification' in window)) {
    throw new Error("Este navegador no soporta notificaciones web.");
  }

  // 2. Solicitar permiso INMEDIATAMENTE (Crucial para móviles)
  // Debe ser lo primero que ocurra tras el clic del usuario.
  const permission = await Notification.requestPermission();
  
  if (permission === 'denied') {
    throw new Error("Permiso de notificaciones denegado por el usuario.");
  }
  if (permission === 'default') {
    throw new Error("El permiso de notificaciones fue cerrado sin aceptar.");
  }

  try {
    // 3. Solo si tenemos permiso, buscamos el Service Worker
    const registration = await navigator.serviceWorker.ready;
    
    if (!registration) {
        throw new Error("No se encontró un Service Worker activo. Intenta recargar la página.");
    }

    // 4. Obtener el token a través de Firebase
    const currentToken = await messaging.getToken({ 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration 
    });

    if (currentToken) {
      return currentToken;
    } else {
      throw new Error("No se pudo generar el token de identificación.");
    }
  } catch (err: any) {
    console.error('Error detallado al obtener token:', err);
    // Propagar el mensaje de error original si existe
    throw new Error(err.message || "Error desconocido al conectar con el servidor de notificaciones.");
  }
};