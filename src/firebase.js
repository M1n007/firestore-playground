import { deleteApp, initializeApp } from 'firebase/app';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc
} from 'firebase/firestore';

const createFirestoreConnection = async (firebaseConfig, existingApp = null) => {
  if (existingApp) {
    await deleteApp(existingApp);
  }

  const app = initializeApp(firebaseConfig, `playground-${Date.now()}`);
  const db = getFirestore(app);

  return { app, db };
};

export default createFirestoreConnection;

export {
  Timestamp,
  addDoc,
  collection,
  deleteApp,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc
};
