import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('email');
googleAuthProvider.addScope('profile');

export const appleAuthProvider = new OAuthProvider('apple.com');
appleAuthProvider.addScope('email');
appleAuthProvider.addScope('name');

// In-memory ID token cache (never stored in localStorage per security guidelines)
let cachedFirebaseIdToken: string | null = null;

onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
  if (fbUser) {
    try {
      cachedFirebaseIdToken = await fbUser.getIdToken();
    } catch {
      cachedFirebaseIdToken = null;
    }
  } else {
    cachedFirebaseIdToken = null;
  }
});

export async function signInWithGooglePopup(): Promise<{
  firebaseUser: FirebaseUser;
  idToken: string;
}> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  const idToken = await result.user.getIdToken();
  cachedFirebaseIdToken = idToken;
  return { firebaseUser: result.user, idToken };
}

export async function signInWithApplePopup(): Promise<{
  firebaseUser: FirebaseUser;
  idToken: string;
}> {
  const result = await signInWithPopup(auth, appleAuthProvider);
  const idToken = await result.user.getIdToken();
  cachedFirebaseIdToken = idToken;
  return { firebaseUser: result.user, idToken };
}

export async function getFirebaseIdToken(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      cachedFirebaseIdToken = await auth.currentUser.getIdToken();
    } catch {
      // Keep existing cached token or null
    }
  }
  return cachedFirebaseIdToken;
}

export async function signOutFirebase(): Promise<void> {
  cachedFirebaseIdToken = null;
  await auth.signOut();
}
