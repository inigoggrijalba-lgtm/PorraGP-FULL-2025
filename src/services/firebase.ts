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
// Clave pública VAPID real
export const VAPID_KEY = "BJd4bu5m6_4jg8vcS92Bzhdi1zskijoYwRuPzNVtQxNz90HDDeQB0-yaG-E1qdBqyLLe9eZEGsf3Z_huD9CqxlQ";

export const requestForToken = async () => {
  // 1. Comprobación inicial de soporte
  if (!('Notification' in window)) {
    throw new Error("Este navegador no soporta notificaciones web.");
  }

  // 2. ANDROID PRIORITY: Solicitar permiso INMEDIATAMENTE.
  // Esto debe ser lo primero que ocurra tras el clic del usuario para evitar bloqueos.
  const permission = await Notification.requestPermission();
  
  if (permission === 'denied') {
    throw new Error("Permiso denegado. Ve a la configuración del navegador para activarlas.");
  }
  if (permission === 'default') {
    throw new Error("Permiso cerrado sin aceptar.");
  }

  try {
    // 3. Esperar al Service Worker (necesario para recibir notificaciones en segundo plano)
    const registration = await navigator.serviceWorker.ready;
    
    if (!registration) {
        throw new Error("Service Worker no listo. Recarga la página e intenta de nuevo.");
    }

    // 4. Obtener el token con TIMEOUT DE SEGURIDAD (15 segundos)
    // Vital para móviles: Si la red es lenta, evitamos que el botón se quede "latiendo" para siempre.
    const getTokenPromise = messaging.getToken({ 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration 
    });

    const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error("TIMEOUT")), 15000);
    });

    // Carrera: Lo que ocurra primero (Token o Timeout)
    const currentToken = await Promise.race([getTokenPromise, timeoutPromise]);

    if (currentToken) {
      return currentToken;
    } else {
      throw new Error("No se pudo generar el identificador (Token vacío).");
    }
  } catch (err: any) {
    console.error('Error detallado Firebase:', err);
    
    if (err.message === "TIMEOUT") {
        throw new Error("La conexión tardó demasiado. Comprueba tu internet o recarga la página.");
    }

    // Propagar el error original
    throw new Error(err.message || "Error desconocido al conectar con notificaciones.");
  }
};

export const deleteUserToken = async () => {
  try {
    await messaging.deleteToken();
    console.log('Token invalidado en Firebase.');
    return true;
  } catch (error) {
    console.error('Error al eliminar el token:', error);
    return false;
  }
};