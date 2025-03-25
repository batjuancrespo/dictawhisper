// Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyA_VQH1y-px8-QF3gMw3VOPjiiU1OefDBo",
  authDomain: "almacena-correcciones-dictado.firebaseapp.com", 
  projectId: "almacena-correcciones-dictado",
  storageBucket: "almacena-correcciones-dictado.appspot.com",
  messagingSenderId: "209194920272",
  appId: "1:209194920272:web:ccbec69d0a5aa88789e455",
  measurementId: "G-6PQSKYMDP0"
};

// User ID management (simple approach - could be enhanced with authentication)
let userId = localStorage.getItem('userId');
if (!userId) {
  userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('userId', userId);
}

export { userId };

