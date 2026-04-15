import { deleteApp, initializeApp } from 'firebase/app';
import {
  Bytes,
  GeoPoint,
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch
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
  Bytes,
  GeoPoint,
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  deleteApp,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch
};
