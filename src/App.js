import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import ParticlesBackground from "./ParticlesBackground";
import createFirestoreConnection, {
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
} from "./firebase";

const CONFIG_PLACEHOLDER = `{
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
  measurementId: "G-XXXXXXXXXX"
}`;

const DEFAULT_CONFIG_INPUT = CONFIG_PLACEHOLDER;
const DEFAULT_EDITOR_VALUE = "{}";

const DEFAULT_PROBE_COLLECTIONS = [
  "users", "user", "usersList", "userProfiles", "profiles", "profile",
  "accounts", "account", "members", "member", "admins", "admin",
  "customers", "customer", "clients", "client", "employees", "staff",
  "tenants", "organizations", "organization", "orgs", "org", "companies", "company", "teams", "team",
  "posts", "post", "articles", "article", "blogs", "blog", "news", "stories", "story",
  "comments", "comment", "replies", "reactions", "likes", "reviews", "ratings", "feedback",
  "orders", "order", "carts", "cart", "invoices", "invoice", "payments", "payment",
  "transactions", "transaction", "subscriptions", "subscription", "plans", "plan", "products", "product",
  "items", "item", "skus", "categories", "category", "tags", "tag",
  "inventory", "stocks", "stock", "warehouses", "suppliers",
  "settings", "setting", "config", "configs", "configuration", "app", "appConfig", "meta", "metadata", "system",
  "notifications", "notification", "messages", "message", "chats", "chat", "rooms", "room",
  "conversations", "conversation", "threads", "thread", "inbox",
  "events", "event", "sessions", "session", "logs", "log", "audit", "audits", "activity", "activities",
  "tasks", "task", "todos", "todo", "projects", "project", "boards", "lists", "cards",
  "tutorials", "tutorial", "courses", "course", "lessons", "lesson", "quizzes", "questions",
  "files", "file", "uploads", "media", "images", "videos", "documents", "docs",
  "reports", "report", "analytics", "stats", "metrics",
  "locations", "location", "places", "addresses", "cities", "countries",
  "permissions", "roles", "role", "groups", "group", "apiKeys", "tokens",
  "devices", "device", "installations", "feedbacks", "tickets", "supports",
  "leads", "lead", "contacts", "contact", "subscribers", "newsletter", "waitlist",
  "vehicles", "bookings", "reservations", "appointments",
  "banks", "wallets", "wallet", "coupons", "discounts", "promos",
  "test", "tests", "testing", "dev", "dev_users", "temp", "sandbox"
].join("\n");

const DEFAULT_PROBE_DOC_IDS = `admin
test
demo
sample`;

const WHITELIST_PROBE_COLLECTIONS = DEFAULT_PROBE_COLLECTIONS;

const SEARCH_MODE_OPTIONS = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "startsWith", label: "Starts With" }
];

const GLOBAL_SEARCH_BATCH_SIZE = 200;

const isPlainObject = (value) => (
  Object.prototype.toString.call(value) === "[object Object]"
);

const serializeFirestoreValue = (value) => {
  if (value instanceof Timestamp) {
    return {
      __type: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce((result, key) => {
      result[key] = serializeFirestoreValue(value[key]);
      return result;
    }, {});
  }

  return value;
};

const parseEditorValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(parseEditorValue);
  }

  if (isPlainObject(value)) {
    if (
      value.__type === "timestamp" &&
      typeof value.seconds === "number" &&
      typeof value.nanoseconds === "number"
    ) {
      return new Timestamp(value.seconds, value.nanoseconds);
    }

    return Object.keys(value).reduce((result, key) => {
      result[key] = parseEditorValue(value[key]);
      return result;
    }, {});
  }

  return value;
};

const parseFirebaseConfigInput = (input) => {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    throw new Error("Firebase config is empty.");
  }

  const normalizedInput = trimmedInput
    .replace(/^const\s+[a-zA-Z_$][\w$]*\s*=\s*/, "")
    .replace(/;$/, "");

  try {
    return JSON.parse(normalizedInput);
  } catch (jsonError) {
    const normalizedJsonInput = normalizedInput
      .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, "$1");

    const parsedObject = JSON.parse(normalizedJsonInput);

    if (!parsedObject || typeof parsedObject !== "object" || Array.isArray(parsedObject)) {
      throw new Error("Firebase config must be an object.");
    }

    return parsedObject;
  }
};

const parseEditorJson = (value) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return {};
  }

  const parsedJson = JSON.parse(trimmedValue);

  if (!isPlainObject(parsedJson) && !Array.isArray(parsedJson)) {
    throw new Error("Editor payload must be a JSON object or array.");
  }

  return parseEditorValue(parsedJson);
};

const formatFieldValue = (value) => {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(serializeFirestoreValue(value));
  }

  return String(value);
};

const getValueAtPath = (data, path) => {
  if (!path || path === "__all__") {
    return data;
  }

  return path.split(".").reduce((currentValue, segment) => {
    if (currentValue === null || currentValue === undefined) {
      return undefined;
    }

    return currentValue[segment];
  }, data);
};

const collectFieldPaths = (value, prefix = "", depth = 0, maxDepth = 2, result = new Set()) => {
  if (value === null || value === undefined) {
    if (prefix) {
      result.add(prefix);
    }
    return result;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      result.add(prefix);
    }
    return result;
  }

  if (!isPlainObject(value)) {
    if (prefix) {
      result.add(prefix);
    }
    return result;
  }

  Object.keys(value).forEach((key) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    result.add(nextPrefix);

    if (depth < maxDepth) {
      collectFieldPaths(value[key], nextPrefix, depth + 1, maxDepth, result);
    }
  });

  return result;
};

const getDocumentPreview = (data) => {
  const entries = Object.entries(data || {}).slice(0, 4);

  if (entries.length === 0) {
    return "Empty document";
  }

  return entries
    .map(([key, value]) => `${key}: ${formatFieldValue(value)}`)
    .join(" | ");
};

const getDocumentTitle = (item) => {
  const priorityFields = ["displayName", "name", "title", "email", "username"];

  for (let index = 0; index < priorityFields.length; index += 1) {
    const value = item.data[priorityFields[index]];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }

  return item.id;
};

const matchesSearchFilter = (data, searchField, searchValue, searchMode) => {
  if (!searchValue.trim()) {
    return true;
  }

  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const targetValue = searchField === "__all__"
    ? JSON.stringify(serializeFirestoreValue(data)).toLowerCase()
    : formatFieldValue(getValueAtPath(data, searchField)).toLowerCase();

  if (!targetValue) {
    return false;
  }

  if (searchMode === "equals") {
    return targetValue === normalizedSearchValue;
  }

  if (searchMode === "startsWith") {
    return targetValue.startsWith(normalizedSearchValue);
  }

  return targetValue.includes(normalizedSearchValue);
};

const createMessageState = (message, type) => ({ message, type });

const getInitialTheme = () => {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem("firestore-playground-theme");

  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return "dark";
};

const SIDEBAR_TABS = [
  { value: "connect", label: "Connect", icon: "\u25CE" },
  { value: "query", label: "Query", icon: "\u2315" },
  { value: "probe", label: "Probe", icon: "\u25A3" }
];

const App = () => {
  const appRef = useRef(null);
  const [db, setDb] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);
  const [activeSidebarTab, setActiveSidebarTab] = useState("query");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);

  const [configInput, setConfigInput] = useState(DEFAULT_CONFIG_INPUT);
  const [connectionStatus, setConnectionStatus] = useState(createMessageState("", ""));
  const [connecting, setConnecting] = useState(false);

  const [collectionPath, setCollectionPath] = useState("users");
  const [collectionLimit, setCollectionLimit] = useState(20);
  const [documents, setDocuments] = useState([]);
  const [collectionStatus, setCollectionStatus] = useState(createMessageState("", ""));
  const [loadingCollection, setLoadingCollection] = useState(false);

  const [searchField, setSearchField] = useState("__all__");
  const [searchValue, setSearchValue] = useState("");
  const [searchMode, setSearchMode] = useState("contains");
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchStatus, setGlobalSearchStatus] = useState(createMessageState("", ""));
  const [globalSearching, setGlobalSearching] = useState(false);
  const [showGlobalResults, setShowGlobalResults] = useState(false);

  const [probeCollectionInput, setProbeCollectionInput] = useState(DEFAULT_PROBE_COLLECTIONS);
  const [probeDocIdInput, setProbeDocIdInput] = useState(DEFAULT_PROBE_DOC_IDS);
  const [probeResults, setProbeResults] = useState([]);
  const [probeStatus, setProbeStatus] = useState(createMessageState("", ""));
  const [probingCollections, setProbingCollections] = useState(false);

  const [documentPath, setDocumentPath] = useState("");
  const [editorValue, setEditorValue] = useState(DEFAULT_EDITOR_VALUE);
  const [documentStatus, setDocumentStatus] = useState(createMessageState("", ""));
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);

  useEffect(() => () => {
    if (appRef.current) {
      deleteApp(appRef.current).catch(() => {});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("firestore-playground-theme", theme);
  }, [theme]);

  const availableFields = Array.from(
    documents.reduce((fieldSet, item) => collectFieldPaths(item.data, "", 0, 2, fieldSet), new Set())
  ).sort((left, right) => left.localeCompare(right));

  const filteredDocuments = documents.filter((item) => (
    matchesSearchFilter(item.data, searchField, searchValue, searchMode)
  ));
  const renderedDocuments = showGlobalResults ? globalSearchResults : filteredDocuments;

  useEffect(() => {
    if (searchField !== "__all__" && availableFields.indexOf(searchField) === -1) {
      setSearchField("__all__");
    }
  }, [availableFields, searchField]);

  const resetStatuses = () => {
    setCollectionStatus(createMessageState("", ""));
    setDocumentStatus(createMessageState("", ""));
    setGlobalSearchStatus(createMessageState("", ""));
    setProbeStatus(createMessageState("", ""));
  };

  const handleUseSampleConfig = () => {
    setConfigInput(CONFIG_PLACEHOLDER);
    setConnectionStatus(createMessageState("Sample config inserted into editor.", "info"));
  };

  const handleConnect = async () => {
    setConnecting(true);
    setConnectionStatus(createMessageState("", ""));
    resetStatuses();

    try {
      const parsedConfig = parseFirebaseConfigInput(configInput);
      const connection = await createFirestoreConnection(parsedConfig, appRef.current);

      appRef.current = connection.app;
      setDb(connection.db);
      setProjectId(parsedConfig.projectId || "");
      setDocuments([]);
      setGlobalSearchResults([]);
      setProbeResults([]);
      setShowGlobalResults(false);
      setDocumentPath("");
      setEditorValue(DEFAULT_EDITOR_VALUE);
      setConnectionStatus(createMessageState(`Connected to "${parsedConfig.projectId || "unknown project"}".`, "success"));
    } catch (error) {
      setDb(null);
      setProjectId("");
      setConnectionStatus(createMessageState(error.message || "Failed to connect to Firebase.", "error"));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (appRef.current) {
      await deleteApp(appRef.current).catch(() => {});
      appRef.current = null;
    }

    setDb(null);
    setProjectId("");
    setDocuments([]);
    setGlobalSearchResults([]);
    setProbeResults([]);
    setDocumentPath("");
    setEditorValue(DEFAULT_EDITOR_VALUE);
    setSearchField("__all__");
    setSearchValue("");
    setShowGlobalResults(false);
    setConnectionStatus(createMessageState("Disconnected.", "info"));
    resetStatuses();
  };

  const loadDocumentIntoEditor = (path, data, sourceLabel) => {
    setDocumentPath(path);
    setEditorValue(JSON.stringify(serializeFirestoreValue(data), null, 2));
    setDocumentStatus(createMessageState(`Loaded ${sourceLabel} "${path}".`, "success"));
  };

  const handleLoadCollection = async () => {
    if (!db) {
      setCollectionStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!collectionPath.trim()) {
      setCollectionStatus(createMessageState("Collection path is required.", "error"));
      return;
    }

    setLoadingCollection(true);
    setCollectionStatus(createMessageState("", ""));

    try {
      const collectionRef = collection(db, collectionPath.trim());
      const collectionQuery = query(collectionRef, limit(Math.max(1, Number(collectionLimit) || 20)));
      const snapshot = await getDocs(collectionQuery);
      const nextDocuments = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        path: snapshotDoc.ref.path,
        data: snapshotDoc.data()
      }));

      setDocuments(nextDocuments);
      setGlobalSearchResults([]);
      setShowGlobalResults(false);
      setCollectionStatus(createMessageState(`Loaded ${nextDocuments.length} document(s) from "${collectionPath.trim()}".`, "success"));

      if (nextDocuments.length > 0) {
        loadDocumentIntoEditor(nextDocuments[0].path, nextDocuments[0].data, "cached document");
      }
    } catch (error) {
      setCollectionStatus(createMessageState(error.message || "Failed to load collection.", "error"));
    } finally {
      setLoadingCollection(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!db) {
      setGlobalSearchStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!collectionPath.trim()) {
      setGlobalSearchStatus(createMessageState("Collection path is required.", "error"));
      return;
    }

    if (!searchValue.trim()) {
      setGlobalSearchStatus(createMessageState("Type a search value before running global scan.", "error"));
      return;
    }

    setGlobalSearching(true);
    setGlobalSearchStatus(createMessageState("", ""));

    try {
      const collectionRef = collection(db, collectionPath.trim());
      const matches = [];
      let scanned = 0;
      let lastVisible = null;

      while (true) {
        const constraints = [
          orderBy(documentId()),
          limit(GLOBAL_SEARCH_BATCH_SIZE)
        ];

        if (lastVisible) {
          constraints.push(startAfter(lastVisible));
        }

        const snapshot = await getDocs(query(collectionRef, ...constraints));

        if (snapshot.empty) {
          break;
        }

        for (let index = 0; index < snapshot.docs.length; index += 1) {
          const snapshotDoc = snapshot.docs[index];
          scanned += 1;
          const data = snapshotDoc.data();

          if (matchesSearchFilter(data, searchField, searchValue, searchMode)) {
            matches.push({
              id: snapshotDoc.id,
              path: snapshotDoc.ref.path,
              data
            });
          }
        }

        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length < GLOBAL_SEARCH_BATCH_SIZE) {
          break;
        }
      }

      setGlobalSearchResults(matches);
      setShowGlobalResults(true);
      setGlobalSearchStatus(
        createMessageState(
          `Global scan finished. ${matches.length} match(es) found after scanning ${scanned} document(s) in "${collectionPath.trim()}".`,
          "success"
        )
      );

      if (matches.length > 0) {
        loadDocumentIntoEditor(matches[0].path, matches[0].data, "search result");
      }
    } catch (error) {
      setGlobalSearchStatus(createMessageState(error.message || "Failed to scan collection globally.", "error"));
    } finally {
      setGlobalSearching(false);
    }
  };

  const handleProbeCollections = async () => {
    if (!db) {
      setProbeStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    const collectionCandidates = probeCollectionInput
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const docIdCandidates = probeDocIdInput
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (collectionCandidates.length === 0) {
      setProbeStatus(createMessageState("Add at least one collection candidate.", "error"));
      return;
    }

    setProbingCollections(true);
    setProbeStatus(createMessageState("", ""));

    try {
      const nextResults = [];

      for (let index = 0; index < collectionCandidates.length; index += 1) {
        const collectionName = collectionCandidates[index];
        const result = {
          collection: collectionName,
          status: "unknown",
          note: "",
          samplePath: "",
          sampleFound: false
        };

        try {
          const sampleSnapshot = await getDocs(query(collection(db, collectionName), limit(1)));

          if (!sampleSnapshot.empty) {
            const firstDoc = sampleSnapshot.docs[0];
            result.status = "confirmed";
            result.note = "Readable collection with at least one document.";
            result.samplePath = firstDoc.ref.path;
            result.sampleFound = true;
          } else {
            result.status = "readable";
            result.note = "Query succeeded, but result is empty. Could be empty collection or no readable docs.";
          }
        } catch (error) {
          result.status = "blocked";
          result.note = error.message || "Query failed.";
        }

        if (!result.sampleFound && result.status !== "blocked" && docIdCandidates.length > 0) {
          for (let docIndex = 0; docIndex < docIdCandidates.length; docIndex += 1) {
            const docIdCandidate = docIdCandidates[docIndex];

            try {
              const snapshot = await getDoc(doc(db, collectionName, docIdCandidate));

              if (snapshot.exists()) {
                result.status = "confirmed";
                result.note = `Found readable document using candidate id "${docIdCandidate}".`;
                result.samplePath = snapshot.ref.path;
                result.sampleFound = true;
                break;
              }
            } catch (error) {
              result.status = "blocked";
              result.note = error.message || "Document probe failed.";
              break;
            }
          }
        }

        nextResults.push(result);
      }

      const statusRank = { confirmed: 0, readable: 1, blocked: 2, unknown: 3 };
      nextResults.sort((left, right) => {
        const leftRank = statusRank[left.status] ?? 4;
        const rightRank = statusRank[right.status] ?? 4;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.collection.localeCompare(right.collection);
      });

      setProbeResults(nextResults);
      setProbeStatus(
        createMessageState(
          `Probe finished. ${nextResults.filter((item) => item.status === "confirmed").length} candidate(s) confirmed readable.`,
          "success"
        )
      );
    } catch (error) {
      setProbeStatus(createMessageState(error.message || "Collection probe failed.", "error"));
    } finally {
      setProbingCollections(false);
    }
  };

  const handleLoadDocument = async (pathOverride = "") => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    const nextDocumentPath = (pathOverride || documentPath).trim();

    if (!nextDocumentPath) {
      setDocumentStatus(createMessageState("Document path is required.", "error"));
      return;
    }

    setLoadingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      const snapshot = await getDoc(doc(db, nextDocumentPath));

      if (!snapshot.exists()) {
        setDocumentStatus(createMessageState(`Document "${nextDocumentPath}" does not exist.`, "error"));
        return;
      }

      loadDocumentIntoEditor(snapshot.ref.path, snapshot.data(), "document");
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Failed to load document.", "error"));
    } finally {
      setLoadingDocument(false);
    }
  };

  const handleCreateAutoIdDocument = async () => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!collectionPath.trim()) {
      setDocumentStatus(createMessageState("Collection path is required to create a document.", "error"));
      return;
    }

    if (!window.confirm(`Create a new document in "${collectionPath.trim()}" with an auto-generated ID?`)) {
      return;
    }

    setSavingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      const payload = parseEditorJson(editorValue);
      const createdRef = await addDoc(collection(db, collectionPath.trim()), payload);
      setDocumentStatus(createMessageState(`Created document "${createdRef.path}".`, "success"));
      await handleLoadCollection();
      await handleLoadDocument(createdRef.path);
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Failed to create document.", "error"));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleSetDocument = async (merge = false) => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!documentPath.trim()) {
      setDocumentStatus(createMessageState("Document path is required.", "error"));
      return;
    }

    setSavingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      const payload = parseEditorJson(editorValue);
      await setDoc(doc(db, documentPath.trim()), payload, merge ? { merge: true } : undefined);
      setDocumentStatus(createMessageState(`${merge ? "Merged into" : "Saved"} "${documentPath.trim()}".`, "success"));
      await handleLoadCollection();
      await handleLoadDocument(documentPath.trim());
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Failed to save document.", "error"));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleUpdateDocument = async () => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!documentPath.trim()) {
      setDocumentStatus(createMessageState("Document path is required.", "error"));
      return;
    }

    setSavingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      const payload = parseEditorJson(editorValue);
      await updateDoc(doc(db, documentPath.trim()), payload);
      setDocumentStatus(createMessageState(`Updated "${documentPath.trim()}".`, "success"));
      await handleLoadCollection();
      await handleLoadDocument(documentPath.trim());
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Failed to update document.", "error"));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!documentPath.trim()) {
      setDocumentStatus(createMessageState("Document path is required.", "error"));
      return;
    }

    if (!window.confirm(`Delete document "${documentPath.trim()}"?`)) {
      return;
    }

    setSavingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      await deleteDoc(doc(db, documentPath.trim()));
      setDocumentPath("");
      setEditorValue("{}");
      setDocumentStatus(createMessageState(`Deleted "${documentPath.trim()}".`, "success"));
      await handleLoadCollection();
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Failed to delete document.", "error"));
    } finally {
      setSavingDocument(false);
    }
  };

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  const renderConnectionPill = () => (
    <div className={`conn-pill ${db ? "is-live" : ""}`}>
      <span className="conn-dot" />
      <span className="conn-text">{db ? projectId || "connected" : "disconnected"}</span>
    </div>
  );

  const renderTopbar = () => (
    <header className="pg-topbar">
      <div className="pg-topbar-left">
        {db && (
          <button
            className="icon-btn icon-btn-plain mobile-only"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            )}
          </button>
        )}
        <div className="pg-brand">
          <svg
            className="pg-brand-mark"
            viewBox="0 0 64 64"
            role="img"
            aria-label="Firestore Playground"
          >
            <defs>
              <linearGradient id="pgBrandGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e535ab" />
                <stop offset="100%" stopColor="#ff6fc8" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#pgBrandGrad)" />
            <g fill="#ffffff">
              <rect x="14" y="18" width="30" height="6" rx="2" opacity="0.95" />
              <rect x="14" y="29" width="36" height="6" rx="2" opacity="0.78" />
              <rect x="14" y="40" width="22" height="6" rx="2" opacity="0.6" />
            </g>
            <circle cx="48" cy="43" r="4.2" fill="#ffffff" />
          </svg>
          <span className="pg-brand-title">Firestore Playground</span>
        </div>
        {db && documentPath && (
          <div className="pg-crumb" title={documentPath}>{documentPath}</div>
        )}
      </div>
      <div className="pg-topbar-right">
        {renderConnectionPill()}
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? "\u263C" : "\u263D"}
        </button>
      </div>
    </header>
  );

  if (!db) {
    return (
      <div className={`pg-shell theme-${theme}`}>
        {renderTopbar()}
        <div className="pg-setup">
          <ParticlesBackground color={theme === "dark" ? "#ff6fc8" : "#e535ab"} />
          <div className="pg-setup-card">
            <div className="pg-eyebrow">Firestore Playground</div>
            <h1>A browser GUI for Google Cloud Firestore</h1>
            <p>
              Paste your Firebase web config to browse collections, search documents,
              probe readable paths, and run Create / Set / Merge / Update / Delete —
              no code required. Everything runs locally in your browser; nothing is
              sent anywhere besides Firebase itself.
            </p>

            <label className="pg-label">Config object</label>
            <textarea
              className="pg-code-area setup-area"
              value={configInput}
              onChange={(event) => setConfigInput(event.target.value)}
              placeholder={CONFIG_PLACEHOLDER}
              spellCheck={false}
            />

            <div className="pg-row">
              <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? "Connecting\u2026" : "Connect"}
              </button>
              <button className="btn btn-ghost" onClick={handleUseSampleConfig}>
                Use sample
              </button>
            </div>

            {connectionStatus.message && (
              <div className={`pg-status ${connectionStatus.type}`}>{connectionStatus.message}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderSidebarTabs = () => (
    <div className="pg-tabs" role="tablist">
      {SIDEBAR_TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          className={`pg-tab ${activeSidebarTab === tab.value ? "active" : ""}`}
          onClick={() => setActiveSidebarTab(tab.value)}
        >
          <span className="pg-tab-icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const renderConnectTab = () => (
    <div className="pg-tabpanel">
      <label className="pg-label">Firebase config</label>
      <textarea
        className="pg-code-area"
        value={configInput}
        onChange={(event) => setConfigInput(event.target.value)}
        placeholder={CONFIG_PLACEHOLDER}
        spellCheck={false}
      />
      <div className="pg-row">
        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connecting\u2026" : "Reconnect"}
        </button>
        <button className="btn btn-ghost" onClick={handleDisconnect}>Disconnect</button>
        <button className="btn btn-ghost" onClick={handleUseSampleConfig}>Sample</button>
      </div>
      {connectionStatus.message && (
        <div className={`pg-status ${connectionStatus.type}`}>{connectionStatus.message}</div>
      )}
    </div>
  );

  const discoveredCollections = probeResults
    .filter((item) => item.status === "confirmed" || item.status === "readable")
    .map((item) => item.collection);

  const renderQueryTab = () => (
    <div className="pg-tabpanel">
      <label className="pg-label">
        Collection path
        {discoveredCollections.length > 0 && (
          <span className="pg-label-hint">{discoveredCollections.length} found</span>
        )}
      </label>
      <div className="pg-inline-row">
        <input
          className="pg-input"
          type="text"
          list="pg-discovered-collections"
          value={collectionPath}
          onChange={(event) => setCollectionPath(event.target.value)}
          placeholder="users"
        />
        <input
          className="pg-input pg-input-sm"
          type="number"
          min="1"
          max="100"
          value={collectionLimit}
          onChange={(event) => setCollectionLimit(event.target.value)}
          title="Limit"
        />
        <datalist id="pg-discovered-collections">
          {discoveredCollections.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      {discoveredCollections.length > 0 && (
        <div className="pg-chips pg-chips-found">
          {discoveredCollections.slice(0, 20).map((name) => (
            <button
              key={name}
              className={`chip ${collectionPath === name ? "active" : ""}`}
              onClick={() => setCollectionPath(name)}
              title={`Use ${name}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="pg-row">
        <button
          className="btn btn-primary btn-block"
          onClick={handleLoadCollection}
          disabled={loadingCollection}
        >
          {loadingCollection ? "Loading\u2026" : "\u25B6  Load Collection"}
        </button>
      </div>
      {collectionStatus.message && (
        <div className={`pg-status ${collectionStatus.type}`}>{collectionStatus.message}</div>
      )}

      <div className="pg-divider" />

      <label className="pg-label">
        Filter
        <span className="pg-label-hint">
          {showGlobalResults
            ? `${globalSearchResults.length} global`
            : `${filteredDocuments.length}/${documents.length}`}
        </span>
      </label>
      <div className="pg-inline-row">
        <select
          className="pg-input"
          value={searchField}
          onChange={(event) => setSearchField(event.target.value)}
        >
          <option value="__all__">All fields</option>
          {availableFields.map((fieldName) => (
            <option key={fieldName} value={fieldName}>{fieldName}</option>
          ))}
        </select>
        <select
          className="pg-input pg-input-sm2"
          value={searchMode}
          onChange={(event) => setSearchMode(event.target.value)}
        >
          {SEARCH_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <input
        className="pg-input"
        type="text"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        placeholder={searchField === "__all__" ? "Search loaded\u2026" : `Search ${searchField}\u2026`}
      />
      <div className="pg-row">
        <button
          className="btn btn-secondary btn-block"
          onClick={handleGlobalSearch}
          disabled={globalSearching}
        >
          {globalSearching ? "Scanning\u2026" : "Scan entire collection"}
        </button>
      </div>
      {showGlobalResults && (
        <div className="pg-row">
          <button className="btn btn-ghost btn-block" onClick={() => setShowGlobalResults(false)}>
            Back to sample
          </button>
        </div>
      )}
      {globalSearchStatus.message && (
        <div className={`pg-status ${globalSearchStatus.type}`}>{globalSearchStatus.message}</div>
      )}

      {availableFields.length > 0 && (
        <>
          <div className="pg-divider" />
          <label className="pg-label">Fields</label>
          <div className="pg-chips">
            {availableFields.slice(0, 30).map((fieldName) => (
              <button
                key={fieldName}
                className={`chip ${searchField === fieldName ? "active" : ""}`}
                onClick={() => setSearchField(fieldName)}
              >
                {fieldName}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const handleLoadWhitelist = () => {
    const existing = probeCollectionInput
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const whitelist = WHITELIST_PROBE_COLLECTIONS.split("\n");
    const merged = Array.from(new Set([...existing, ...whitelist]));
    setProbeCollectionInput(merged.join("\n"));
  };

  const handleClearCandidates = () => {
    setProbeCollectionInput("");
  };

  const renderProbeTab = () => (
    <div className="pg-tabpanel">
      <div className="pg-hint">
        Test if candidate collections / doc IDs are readable from this client.
      </div>
      <label className="pg-label">
        Collection candidates
        <span className="pg-label-hint">
          {probeCollectionInput.split("\n").filter((s) => s.trim()).length} entries
        </span>
      </label>
      <textarea
        className="pg-code-area pg-code-area-sm"
        value={probeCollectionInput}
        onChange={(event) => setProbeCollectionInput(event.target.value)}
        spellCheck={false}
      />
      <div className="pg-row">
        <button className="btn btn-ghost" onClick={handleLoadWhitelist}>
          + Whitelist
        </button>
        <button className="btn btn-ghost" onClick={handleClearCandidates}>
          Clear
        </button>
      </div>
      <label className="pg-label">Doc ID candidates</label>
      <textarea
        className="pg-code-area pg-code-area-sm"
        value={probeDocIdInput}
        onChange={(event) => setProbeDocIdInput(event.target.value)}
        spellCheck={false}
      />
      <div className="pg-row">
        <button
          className="btn btn-primary btn-block"
          onClick={handleProbeCollections}
          disabled={probingCollections}
        >
          {probingCollections ? "Probing\u2026" : "Probe candidates"}
        </button>
      </div>
      {probeStatus.message && (
        <div className={`pg-status ${probeStatus.type}`}>{probeStatus.message}</div>
      )}
      <div className="probe-results">
        {probeResults.length === 0 ? (
          <div className="pg-empty">No probe results yet.</div>
        ) : (
          probeResults.map((item) => (
            <div key={item.collection} className={`probe-card ${item.status}`}>
              <div className="probe-card-top">
                <strong>{item.collection}</strong>
                <span className={`probe-badge ${item.status}`}>{item.status}</span>
              </div>
              <div className="probe-note">{item.note}</div>
              {item.samplePath && (
                <button
                  className="probe-path-btn"
                  onClick={() => handleLoadDocument(item.samplePath)}
                >
                  {"\u2192"} {item.samplePath}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className={`pg-shell theme-${theme}`}>
      {renderTopbar()}
      <main className="pg-workspace">
        <aside className={`pg-sidebar ${sidebarOpen ? "open" : ""}`}>
          {renderSidebarTabs()}
          {activeSidebarTab === "connect" && renderConnectTab()}
          {activeSidebarTab === "query" && renderQueryTab()}
          {activeSidebarTab === "probe" && renderProbeTab()}
        </aside>
        {sidebarOpen && (
          <div className="pg-scrim" onClick={() => setSidebarOpen(false)} />
        )}

        <section className="pg-main">
          <div className="pg-main-toolbar">
            <input
              className="pg-input pg-path-input"
              type="text"
              value={documentPath}
              onChange={(event) => setDocumentPath(event.target.value)}
              placeholder="users/abc123"
            />
            <button className="btn btn-ghost" onClick={() => handleLoadDocument()} disabled={loadingDocument}>
              {loadingDocument ? "\u2026" : "Get"}
            </button>
            <div className="pg-toolbar-spacer" />
            <button className="btn btn-secondary" onClick={handleCreateAutoIdDocument} disabled={savingDocument}>
              Create
            </button>
            <button className="btn btn-primary" onClick={() => handleSetDocument(false)} disabled={savingDocument}>
              Set
            </button>
            <button className="btn btn-ghost" onClick={() => handleSetDocument(true)} disabled={savingDocument}>
              Merge
            </button>
            <button className="btn btn-ghost" onClick={handleUpdateDocument} disabled={savingDocument}>
              Update
            </button>
            <button className="btn btn-danger" onClick={handleDeleteDocument} disabled={savingDocument}>
              Delete
            </button>
          </div>

          <div className={`pg-split ${resultsCollapsed ? "collapsed" : ""}`}>
            <div className="pg-panel pg-editor">
              <div className="pg-panel-head">
                <span className="pg-panel-title">
                  <span className="pg-dot json" /> JSON Payload
                </span>
                <span className="pg-panel-meta">{documentPath || "untitled"}</span>
              </div>
              <textarea
                className="pg-code-area pg-editor-area"
                value={editorValue}
                onChange={(event) => setEditorValue(event.target.value)}
                placeholder="{}"
                spellCheck={false}
              />
              <div className="pg-editor-foot">
                <span className="pg-hint-inline">
                  Timestamp: <code>{`{"__type":"timestamp","seconds":1776171751,"nanoseconds":0}`}</code>
                </span>
              </div>
              {documentStatus.message && (
                <div className={`pg-status ${documentStatus.type}`}>{documentStatus.message}</div>
              )}
            </div>

            {resultsCollapsed ? (
              <div className="pg-panel pg-results pg-results-collapsed">
                <button
                  className="pg-results-rail"
                  onClick={() => setResultsCollapsed(false)}
                  title="Show documents"
                >
                  <span className="pg-results-rail-icon">{"\u2039"}</span>
                  <span className="pg-results-rail-label">Documents</span>
                  <span className="pg-count pg-count-rail">
                    {showGlobalResults
                      ? `${globalSearchResults.length}`
                      : `${filteredDocuments.length}/${documents.length}`}
                  </span>
                </button>
              </div>
            ) : (
              <div className="pg-panel pg-results">
                <div className="pg-panel-head">
                  <span className="pg-panel-title">
                    <span className="pg-dot results" /> Documents
                    <span className="pg-count">
                      {showGlobalResults
                        ? `${globalSearchResults.length} global`
                        : `${filteredDocuments.length}/${documents.length}`}
                    </span>
                  </span>
                  <button
                    className="icon-btn icon-btn-sm"
                    onClick={() => setResultsCollapsed(true)}
                    title="Collapse"
                  >
                    {"\u203A"}
                  </button>
                </div>
                <div className="pg-results-list">
                  {renderedDocuments.length === 0 ? (
                    <div className="pg-empty">
                      {documents.length === 0
                        ? "Load a collection to inspect documents."
                        : showGlobalResults
                          ? "Global scan found no matches."
                          : "No loaded documents match the filter."}
                    </div>
                  ) : (
                    renderedDocuments.map((item) => (
                      <button
                        key={item.path}
                        className={`doc-card ${documentPath === item.path ? "selected" : ""}`}
                        onClick={() => loadDocumentIntoEditor(item.path, item.data, "cached document")}
                      >
                        <div className="doc-card-top">
                          <strong>{getDocumentTitle(item)}</strong>
                          <span className="doc-id">{item.id}</span>
                        </div>
                        <div className="doc-path">{item.path}</div>
                        <div className="doc-preview">{getDocumentPreview(item.data)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
