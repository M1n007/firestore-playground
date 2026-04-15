import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import ParticlesBackground from "./ParticlesBackground";
import createFirestoreConnection, {
  Bytes,
  GeoPoint,
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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where
} from "./firebase";
import { DocumentReference } from "firebase/firestore";

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

  if (value instanceof GeoPoint) {
    return { __type: "geopoint", lat: value.latitude, lng: value.longitude };
  }

  if (value instanceof Bytes) {
    return { __type: "bytes", base64: value.toBase64() };
  }

  if (value instanceof DocumentReference) {
    return { __type: "ref", path: value.path };
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

const parseEditorValue = (value, db = null) => {
  if (Array.isArray(value)) {
    return value.map((item) => parseEditorValue(item, db));
  }

  if (isPlainObject(value)) {
    if (
      value.__type === "timestamp" &&
      typeof value.seconds === "number" &&
      typeof value.nanoseconds === "number"
    ) {
      return new Timestamp(value.seconds, value.nanoseconds);
    }

    if (value.__type === "geopoint" && typeof value.lat === "number" && typeof value.lng === "number") {
      return new GeoPoint(value.lat, value.lng);
    }

    if (value.__type === "bytes" && typeof value.base64 === "string") {
      return Bytes.fromBase64String(value.base64);
    }

    if (value.__type === "ref" && typeof value.path === "string" && db) {
      return doc(db, value.path);
    }

    if (value.__type === "serverTimestamp") {
      return serverTimestamp();
    }

    return Object.keys(value).reduce((result, key) => {
      result[key] = parseEditorValue(value[key], db);
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

const computeDiff = (before, after) => {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  const entries = [];

  for (const key of allKeys) {
    const hadBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
    const beforeStr = hadBefore ? JSON.stringify(serializeFirestoreValue(beforeObj[key])) : null;
    const afterStr = hasAfter ? JSON.stringify(serializeFirestoreValue(afterObj[key])) : null;

    if (!hadBefore && hasAfter) entries.push({ key, kind: "added", after: afterStr });
    else if (hadBefore && !hasAfter) entries.push({ key, kind: "removed", before: beforeStr });
    else if (beforeStr !== afterStr) entries.push({ key, kind: "changed", before: beforeStr, after: afterStr });
  }

  return entries;
};

const flattenForCsv = (data) => {
  const result = {};
  const walk = (value, prefix) => {
    if (value === null || value === undefined) {
      result[prefix] = "";
      return;
    }
    if (value instanceof Timestamp) {
      result[prefix] = new Date(value.seconds * 1000).toISOString();
      return;
    }
    if (isPlainObject(value)) {
      for (const k of Object.keys(value)) {
        walk(value[k], prefix ? `${prefix}.${k}` : k);
      }
      return;
    }
    if (Array.isArray(value)) {
      result[prefix] = JSON.stringify(serializeFirestoreValue(value));
      return;
    }
    result[prefix] = value;
  };
  walk(data, "");
  return result;
};

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set()));
  const escape = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
};

const downloadBlob = (filename, content, mime = "application/json") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

const WHERE_OPS = ["==", "!=", "<", "<=", ">", ">=", "array-contains", "array-contains-any", "in", "not-in"];
const ARRAY_OPS = new Set(["array-contains-any", "in", "not-in"]);

const SUBCOLLECTION_CANDIDATES = [
  "items", "comments", "replies", "likes", "reactions", "history", "logs",
  "messages", "notifications", "sessions", "tokens", "events", "activities",
  "reviews", "ratings", "photos", "media", "attachments", "files",
  "members", "roles", "permissions", "invites", "audit", "metadata",
  "subscriptions", "orders", "payments", "invoices", "addresses"
];

const CONNECTIONS_STORAGE_KEY = "firestore-playground-connections";
const MAX_URL_VALUE = 200;

const readSavedConnections = () => {
  try {
    const raw = window.localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSavedConnections = (list) => {
  try {
    window.localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
};

const coerceWhereValue = (raw, op) => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const asArray = ARRAY_OPS.has(op);
  try {
    const parsed = JSON.parse(trimmed);
    if (asArray && !Array.isArray(parsed)) return [parsed];
    return parsed;
  } catch {
    if (asArray) return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }
};

const encodeUrlState = (state) => {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (str.length > MAX_URL_VALUE) return;
    params.set(key, str);
  });
  const query = params.toString();
  if (!query) {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    return;
  }
  window.history.replaceState(null, "", `#${query}`);
};

const decodeUrlState = () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
};

const App = () => {
  const appRef = useRef(null);
  const liveUnsubRef = useRef(null);
  const cursorRef = useRef(null);
  const collectionInputRef = useRef(null);
  const pathInputRef = useRef(null);
  const urlStateAppliedRef = useRef(false);
  const [db, setDb] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);
  const [activeSidebarTab, setActiveSidebarTab] = useState("query");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [savedConnections, setSavedConnections] = useState(readSavedConnections);
  const [whereClauses, setWhereClauses] = useState([]);
  const [orderByField, setOrderByField] = useState("");
  const [orderByDir, setOrderByDir] = useState("asc");
  const [liveMode, setLiveMode] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [subCollections, setSubCollections] = useState([]);
  const [probingSubs, setProbingSubs] = useState(false);
  const [pendingWrite, setPendingWrite] = useState(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

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
    if (liveUnsubRef.current) liveUnsubRef.current();
    if (appRef.current) {
      deleteApp(appRef.current).catch(() => {});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("firestore-playground-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (urlStateAppliedRef.current) return;
    urlStateAppliedRef.current = true;
    const parsed = decodeUrlState();
    if (parsed.collection) setCollectionPath(parsed.collection);
    if (parsed.limit) setCollectionLimit(Number(parsed.limit) || 20);
    if (parsed.path) setDocumentPath(parsed.path);
    if (parsed.field) setSearchField(parsed.field);
    if (parsed.mode) setSearchMode(parsed.mode);
    if (parsed.value) setSearchValue(parsed.value);
    if (parsed.orderBy) setOrderByField(parsed.orderBy);
    if (parsed.dir === "asc" || parsed.dir === "desc") setOrderByDir(parsed.dir);
  }, []);

  useEffect(() => {
    encodeUrlState({
      collection: collectionPath,
      limit: collectionLimit ? String(collectionLimit) : "",
      path: documentPath,
      field: searchField !== "__all__" ? searchField : "",
      mode: searchMode !== "contains" ? searchMode : "",
      value: searchValue,
      orderBy: orderByField,
      dir: orderByDir !== "asc" ? orderByDir : ""
    });
  }, [collectionPath, collectionLimit, documentPath, searchField, searchMode, searchValue, orderByField, orderByDir]);

  useEffect(() => {
    const handleKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key === "k") {
        event.preventDefault();
        setActiveSidebarTab("query");
        setTimeout(() => collectionInputRef.current && collectionInputRef.current.focus(), 0);
      } else if (event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (event.key === "Enter") {
        const target = event.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          if (target === collectionInputRef.current) {
            event.preventDefault();
            handleLoadCollection();
          } else if (target === pathInputRef.current) {
            event.preventDefault();
            handleLoadDocument();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, documentPath, collectionLimit, whereClauses, orderByField, orderByDir, liveMode]);

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
    if (liveUnsubRef.current) {
      liveUnsubRef.current();
      liveUnsubRef.current = null;
    }
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
    setWhereClauses([]);
    setOrderByField("");
    setLiveMode(false);
    setSubCollections([]);
    setHasMore(false);
    cursorRef.current = null;
    loadedDocDataRef.current = null;
    setConnectionStatus(createMessageState("Disconnected.", "info"));
    resetStatuses();
  };

  const loadedDocDataRef = useRef(null);

  const loadDocumentIntoEditor = (path, data, sourceLabel) => {
    setDocumentPath(path);
    setEditorValue(JSON.stringify(serializeFirestoreValue(data), null, 2));
    loadedDocDataRef.current = data;
    setDocumentStatus(createMessageState(`Loaded ${sourceLabel} "${path}".`, "success"));
    probeSubCollections(path);
  };

  const probeSubCollections = async (path) => {
    if (!db || !path) {
      setSubCollections([]);
      return;
    }
    setProbingSubs(true);
    const found = [];
    for (const name of SUBCOLLECTION_CANDIDATES) {
      try {
        const snap = await getDocs(query(collection(db, `${path}/${name}`), limit(1)));
        if (!snap.empty) found.push({ name, samplePath: snap.docs[0].ref.path });
      } catch {
        // ignore blocked / invalid
      }
    }
    setSubCollections(found);
    setProbingSubs(false);
  };

  const stopLiveListener = () => {
    if (liveUnsubRef.current) {
      liveUnsubRef.current();
      liveUnsubRef.current = null;
    }
  };

  const buildCollectionQuery = (collectionRef, includeCursor = false) => {
    const constraints = [];

    whereClauses.forEach((clause) => {
      const fieldName = clause.field.trim();
      if (!fieldName) return;
      const value = coerceWhereValue(clause.value, clause.op);
      constraints.push(where(fieldName, clause.op, value));
    });

    if (orderByField.trim()) {
      constraints.push(orderBy(orderByField.trim(), orderByDir));
    }

    if (includeCursor && cursorRef.current) {
      constraints.push(startAfter(cursorRef.current));
    }

    constraints.push(limit(Math.max(1, Number(collectionLimit) || 20)));
    return query(collectionRef, ...constraints);
  };

  const mapSnapshotToDocuments = (snapshot) => snapshot.docs.map((snapshotDoc) => ({
    id: snapshotDoc.id,
    path: snapshotDoc.ref.path,
    data: snapshotDoc.data()
  }));

  const handleLoadCollection = async () => {
    if (!db) {
      setCollectionStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    if (!collectionPath.trim()) {
      setCollectionStatus(createMessageState("Collection path is required.", "error"));
      return;
    }

    stopLiveListener();
    setLoadingCollection(true);
    setCollectionStatus(createMessageState("", ""));
    cursorRef.current = null;

    try {
      const collectionRef = collection(db, collectionPath.trim());
      const collectionQuery = buildCollectionQuery(collectionRef, false);

      if (liveMode) {
        liveUnsubRef.current = onSnapshot(
          collectionQuery,
          (snapshot) => {
            const nextDocuments = mapSnapshotToDocuments(snapshot);
            setDocuments(nextDocuments);
            setHasMore(snapshot.docs.length >= Math.max(1, Number(collectionLimit) || 20));
            if (snapshot.docs.length > 0) {
              cursorRef.current = snapshot.docs[snapshot.docs.length - 1];
            }
            setCollectionStatus(createMessageState(`Live: ${nextDocuments.length} document(s).`, "info"));
          },
          (error) => setCollectionStatus(createMessageState(error.message, "error"))
        );
        setLoadingCollection(false);
        setShowGlobalResults(false);
        return;
      }

      const snapshot = await getDocs(collectionQuery);
      const nextDocuments = mapSnapshotToDocuments(snapshot);
      const pageSize = Math.max(1, Number(collectionLimit) || 20);

      setDocuments(nextDocuments);
      setGlobalSearchResults([]);
      setShowGlobalResults(false);
      setHasMore(snapshot.docs.length >= pageSize);
      if (snapshot.docs.length > 0) {
        cursorRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
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

  const handleLoadMore = async () => {
    if (!db || !cursorRef.current || liveMode) return;
    setLoadingMore(true);
    try {
      const collectionRef = collection(db, collectionPath.trim());
      const collectionQuery = buildCollectionQuery(collectionRef, true);
      const snapshot = await getDocs(collectionQuery);
      const additional = mapSnapshotToDocuments(snapshot);
      const pageSize = Math.max(1, Number(collectionLimit) || 20);
      setDocuments((prev) => [...prev, ...additional]);
      setHasMore(snapshot.docs.length >= pageSize);
      if (snapshot.docs.length > 0) {
        cursorRef.current = snapshot.docs[snapshot.docs.length - 1];
      } else {
        cursorRef.current = null;
      }
      setCollectionStatus(createMessageState(`+${additional.length} more.`, "success"));
    } catch (error) {
      setCollectionStatus(createMessageState(error.message || "Load more failed.", "error"));
    } finally {
      setLoadingMore(false);
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

  const stageWrite = (kind) => {
    if (!db) {
      setDocumentStatus(createMessageState("Connect to Firebase first.", "error"));
      return;
    }

    try {
      const parsedJson = JSON.parse(editorValue.trim() || "{}");
      if (!isPlainObject(parsedJson) && !Array.isArray(parsedJson)) {
        throw new Error("Editor payload must be a JSON object.");
      }

      if (kind === "create") {
        if (!collectionPath.trim()) {
          setDocumentStatus(createMessageState("Collection path required.", "error"));
          return;
        }
        setPendingWrite({
          kind,
          targetPath: `${collectionPath.trim()}/<auto-id>`,
          diff: computeDiff({}, parsedJson),
          payload: parsedJson
        });
        return;
      }

      if (!documentPath.trim()) {
        setDocumentStatus(createMessageState("Document path required.", "error"));
        return;
      }

      const before = loadedDocDataRef.current
        ? serializeFirestoreValue(loadedDocDataRef.current)
        : {};

      const projected = kind === "set" ? parsedJson : { ...before, ...parsedJson };

      setPendingWrite({
        kind,
        targetPath: documentPath.trim(),
        diff: computeDiff(before, projected),
        payload: parsedJson
      });
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Invalid JSON payload.", "error"));
    }
  };

  const commitPendingWrite = async () => {
    if (!pendingWrite || !db) return;
    const { kind, payload } = pendingWrite;
    setPendingWrite(null);
    setSavingDocument(true);
    setDocumentStatus(createMessageState("", ""));

    try {
      const resolvedPayload = parseEditorValue(payload, db);

      if (kind === "create") {
        const createdRef = await addDoc(collection(db, collectionPath.trim()), resolvedPayload);
        setDocumentStatus(createMessageState(`Created "${createdRef.path}".`, "success"));
        await handleLoadCollection();
        await handleLoadDocument(createdRef.path);
      } else if (kind === "set") {
        await setDoc(doc(db, documentPath.trim()), resolvedPayload);
        setDocumentStatus(createMessageState(`Saved "${documentPath.trim()}".`, "success"));
        await handleLoadCollection();
        await handleLoadDocument(documentPath.trim());
      } else if (kind === "merge") {
        await setDoc(doc(db, documentPath.trim()), resolvedPayload, { merge: true });
        setDocumentStatus(createMessageState(`Merged into "${documentPath.trim()}".`, "success"));
        await handleLoadCollection();
        await handleLoadDocument(documentPath.trim());
      } else if (kind === "update") {
        await updateDoc(doc(db, documentPath.trim()), resolvedPayload);
        setDocumentStatus(createMessageState(`Updated "${documentPath.trim()}".`, "success"));
        await handleLoadCollection();
        await handleLoadDocument(documentPath.trim());
      }
    } catch (error) {
      setDocumentStatus(createMessageState(error.message || "Write failed.", "error"));
    } finally {
      setSavingDocument(false);
    }
  };

  const handleExportCollectionJson = () => {
    if (!documents.length) return;
    const payload = documents.map((item) => ({
      path: item.path,
      id: item.id,
      data: serializeFirestoreValue(item.data)
    }));
    downloadBlob(`${(collectionPath || "collection").replace(/\//g, "_")}.json`, JSON.stringify(payload, null, 2));
  };

  const handleExportCollectionCsv = () => {
    if (!documents.length) return;
    const rows = documents.map((item) => ({ __id: item.id, __path: item.path, ...flattenForCsv(item.data) }));
    downloadBlob(`${(collectionPath || "collection").replace(/\//g, "_")}.csv`, toCsv(rows), "text/csv");
  };

  const handleImportJson = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!db) {
      setCollectionStatus(createMessageState("Connect first.", "error"));
      return;
    }
    if (!collectionPath.trim()) {
      setCollectionStatus(createMessageState("Collection path required for import.", "error"));
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (!window.confirm(`Import ${items.length} document(s) into "${collectionPath.trim()}"?`)) return;

      setLoadingCollection(true);
      let ok = 0;
      for (const item of items) {
        const data = parseEditorValue(item.data || item, db);
        if (item.id && typeof item.id === "string") {
          await setDoc(doc(db, `${collectionPath.trim()}/${item.id}`), data);
        } else {
          await addDoc(collection(db, collectionPath.trim()), data);
        }
        ok += 1;
      }
      setCollectionStatus(createMessageState(`Imported ${ok}/${items.length}.`, "success"));
      await handleLoadCollection();
    } catch (error) {
      setCollectionStatus(createMessageState(error.message || "Import failed.", "error"));
    } finally {
      setLoadingCollection(false);
    }
  };

  const buildCodeSnippet = (flavor) => {
    const path = documentPath.trim() || `${collectionPath.trim()}/<docId>`;
    const coll = collectionPath.trim() || "users";
    const pageSize = Math.max(1, Number(collectionLimit) || 20);
    const whereStatements = whereClauses
      .filter((c) => c.field.trim())
      .map((c) => `  where("${c.field.trim()}", "${c.op}", ${JSON.stringify(coerceWhereValue(c.value, c.op))})`);
    const orderStmt = orderByField.trim() ? `  orderBy("${orderByField.trim()}", "${orderByDir}")` : null;

    if (flavor === "web") {
      const constraints = [...whereStatements];
      if (orderStmt) constraints.push(orderStmt);
      constraints.push(`  limit(${pageSize})`);
      return `import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";

// Get single document
const snap = await getDoc(doc(db, "${path}"));
console.log(snap.data());

// Query collection
const q = query(
  collection(db, "${coll}"),
${constraints.join(",\n")}
);
const results = await getDocs(q);
results.forEach((d) => console.log(d.id, d.data()));`;
    }

    if (flavor === "admin") {
      return `// Node.js — firebase-admin
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const snap = await db.doc("${path}").get();
console.log(snap.data());

let q = db.collection("${coll}");
${whereClauses.filter((c) => c.field.trim()).map((c) => `q = q.where("${c.field.trim()}", "${c.op}", ${JSON.stringify(coerceWhereValue(c.value, c.op))});`).join("\n")}
${orderByField.trim() ? `q = q.orderBy("${orderByField.trim()}", "${orderByDir}");` : ""}
q = q.limit(${pageSize});
const results = await q.get();
results.forEach((d) => console.log(d.id, d.data()));`;
    }

    const projectIdForRest = projectId || "YOUR_PROJECT";
    return `# REST — Firestore v1
curl "https://firestore.googleapis.com/v1/projects/${projectIdForRest}/databases/(default)/documents/${path}"

# Structured query (POST)
curl -X POST "https://firestore.googleapis.com/v1/projects/${projectIdForRest}/databases/(default)/documents:runQuery" \\
  -H "Content-Type: application/json" \\
  -d '{
    "structuredQuery": {
      "from": [{"collectionId": "${coll}"}],
      "limit": ${pageSize}
    }
  }'`;
  };

  const handleCopyCode = (flavor) => {
    const snippet = buildCodeSnippet(flavor);
    navigator.clipboard.writeText(snippet).then(
      () => setDocumentStatus(createMessageState(`Copied ${flavor} snippet.`, "success")),
      () => setDocumentStatus(createMessageState("Clipboard blocked.", "error"))
    );
    setCopyMenuOpen(false);
  };

  const handleSaveConnection = () => {
    const defaultName = projectId || "connection";
    const name = window.prompt("Save connection as:", defaultName);
    if (!name) return;
    const nextList = [
      ...savedConnections.filter((c) => c.name !== name),
      { name, config: configInput }
    ];
    setSavedConnections(nextList);
    writeSavedConnections(nextList);
    setConnectionStatus(createMessageState(`Saved "${name}".`, "success"));
  };

  const handleLoadSavedConnection = (entry) => {
    setConfigInput(entry.config);
    setConnectionStatus(createMessageState(`Loaded "${entry.name}". Click Reconnect.`, "info"));
  };

  const handleDeleteSavedConnection = (name) => {
    if (!window.confirm(`Delete saved connection "${name}"?`)) return;
    const nextList = savedConnections.filter((c) => c.name !== name);
    setSavedConnections(nextList);
    writeSavedConnections(nextList);
  };

  const addWhereClause = () => {
    setWhereClauses((prev) => [...prev, { field: "", op: "==", value: "" }]);
  };

  const updateWhereClause = (index, patch) => {
    setWhereClauses((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeWhereClause = (index) => {
    setWhereClauses((prev) => prev.filter((_, i) => i !== index));
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
        <button className="btn btn-ghost" onClick={handleSaveConnection}>Save</button>
      </div>
      {connectionStatus.message && (
        <div className={`pg-status ${connectionStatus.type}`}>{connectionStatus.message}</div>
      )}

      {savedConnections.length > 0 && (
        <>
          <div className="pg-divider" />
          <label className="pg-label">
            Saved connections
            <span className="pg-label-hint">{savedConnections.length}</span>
          </label>
          <div className="saved-list">
            {savedConnections.map((entry) => (
              <div key={entry.name} className="saved-item">
                <button className="saved-name" onClick={() => handleLoadSavedConnection(entry)}>
                  {entry.name}
                </button>
                <button
                  className="saved-del"
                  onClick={() => handleDeleteSavedConnection(entry.name)}
                  aria-label={`Delete ${entry.name}`}
                >
                  {"\u00D7"}
                </button>
              </div>
            ))}
          </div>
        </>
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
          ref={collectionInputRef}
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
          title="Page size"
        />
        <datalist id="pg-discovered-collections">
          {discoveredCollections.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <label className="pg-label">
        Where clauses
        <button className="pg-mini-btn" onClick={addWhereClause}>+ add</button>
      </label>
      {whereClauses.length === 0 && (
        <div className="pg-hint">No clauses. Click + add to build a server-side filter.</div>
      )}
      {whereClauses.map((clause, index) => (
        <div key={index} className="where-row">
          <input
            className="pg-input"
            placeholder="field"
            value={clause.field}
            onChange={(event) => updateWhereClause(index, { field: event.target.value })}
          />
          <select
            className="pg-input pg-input-op"
            value={clause.op}
            onChange={(event) => updateWhereClause(index, { op: event.target.value })}
          >
            {WHERE_OPS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input
            className="pg-input"
            placeholder={ARRAY_OPS.has(clause.op) ? '["a","b"] or a,b' : "value"}
            value={clause.value}
            onChange={(event) => updateWhereClause(index, { value: event.target.value })}
          />
          <button
            className="icon-btn icon-btn-plain icon-btn-sm"
            onClick={() => removeWhereClause(index)}
            aria-label="Remove clause"
          >
            {"\u00D7"}
          </button>
        </div>
      ))}

      <label className="pg-label">Order by</label>
      <div className="pg-inline-row">
        <input
          className="pg-input"
          placeholder="field (optional)"
          value={orderByField}
          onChange={(event) => setOrderByField(event.target.value)}
        />
        <select
          className="pg-input pg-input-sm2"
          value={orderByDir}
          onChange={(event) => setOrderByDir(event.target.value)}
        >
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
      </div>

      <label className="pg-switch">
        <input
          type="checkbox"
          checked={liveMode}
          onChange={(event) => setLiveMode(event.target.checked)}
        />
        <span>Live updates (onSnapshot)</span>
      </label>
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
          {loadingCollection ? "Loading\u2026" : "\u25B6  Run Query"}
        </button>
      </div>
      {hasMore && !liveMode && (
        <div className="pg-row">
          <button
            className="btn btn-ghost btn-block"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading\u2026" : "Load more"}
          </button>
        </div>
      )}
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

  const renderDiffModal = () => {
    if (!pendingWrite) return null;
    const { kind, targetPath, diff } = pendingWrite;
    const kindLabel = {
      create: "Create",
      set: "Set (overwrite)",
      merge: "Merge",
      update: "Update"
    }[kind];
    return (
      <div className="pg-modal-scrim" onClick={() => setPendingWrite(null)}>
        <div className="pg-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pg-modal-head">
            <div>
              <div className="pg-modal-kicker">Confirm {kindLabel}</div>
              <div className="pg-modal-path">{targetPath}</div>
            </div>
            <button className="icon-btn icon-btn-plain" onClick={() => setPendingWrite(null)} aria-label="Close">
              {"\u00D7"}
            </button>
          </div>
          <div className="pg-modal-body">
            {diff.length === 0 ? (
              <div className="pg-empty">No changes detected.</div>
            ) : (
              diff.map((entry) => (
                <div key={entry.key} className={`diff-line diff-${entry.kind}`}>
                  <span className="diff-sign">
                    {entry.kind === "added" ? "+" : entry.kind === "removed" ? "\u2212" : "~"}
                  </span>
                  <span className="diff-key">{entry.key}</span>
                  {entry.kind === "changed" && (
                    <>
                      <span className="diff-before">{entry.before}</span>
                      <span className="diff-arrow">{"\u2192"}</span>
                      <span className="diff-after">{entry.after}</span>
                    </>
                  )}
                  {entry.kind === "added" && <span className="diff-after">{entry.after}</span>}
                  {entry.kind === "removed" && <span className="diff-before">{entry.before}</span>}
                </div>
              ))
            )}
          </div>
          <div className="pg-modal-foot">
            <button className="btn btn-ghost" onClick={() => setPendingWrite(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={commitPendingWrite} disabled={savingDocument}>
              {savingDocument ? "Writing\u2026" : `Confirm ${kindLabel}`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`pg-shell theme-${theme}`}>
      {renderTopbar()}
      {renderDiffModal()}
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
              ref={pathInputRef}
              className="pg-input pg-path-input"
              type="text"
              value={documentPath}
              onChange={(event) => setDocumentPath(event.target.value)}
              placeholder="users/abc123"
            />
            <button className="btn btn-ghost" onClick={() => handleLoadDocument()} disabled={loadingDocument}>
              {loadingDocument ? "\u2026" : "Get"}
            </button>
            <div className="pg-copy-wrap">
              <button
                className="btn btn-ghost"
                onClick={() => setCopyMenuOpen((v) => !v)}
                title="Copy as code"
              >
                {"\u2398"} Copy
              </button>
              {copyMenuOpen && (
                <div className="pg-copy-menu">
                  <button onClick={() => handleCopyCode("web")}>Web SDK</button>
                  <button onClick={() => handleCopyCode("admin")}>Admin SDK</button>
                  <button onClick={() => handleCopyCode("rest")}>REST / curl</button>
                </div>
              )}
            </div>
            <label className="btn btn-ghost pg-upload">
              Import
              <input type="file" accept=".json,application/json" onChange={handleImportJson} hidden />
            </label>
            <button
              className="btn btn-ghost"
              onClick={handleExportCollectionJson}
              disabled={!documents.length}
              title="Export loaded documents as JSON"
            >
              JSON
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleExportCollectionCsv}
              disabled={!documents.length}
              title="Export loaded documents as CSV"
            >
              CSV
            </button>
            <div className="pg-toolbar-spacer" />
            <button className="btn btn-secondary" onClick={() => stageWrite("create")} disabled={savingDocument}>
              Create
            </button>
            <button className="btn btn-primary" onClick={() => stageWrite("set")} disabled={savingDocument}>
              Set
            </button>
            <button className="btn btn-ghost" onClick={() => stageWrite("merge")} disabled={savingDocument}>
              Merge
            </button>
            <button className="btn btn-ghost" onClick={() => stageWrite("update")} disabled={savingDocument}>
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
                <details>
                  <summary>Type helpers</summary>
                  <div className="pg-type-helpers">
                    <div><b>Timestamp</b> <code>{`{"__type":"timestamp","seconds":1776171751,"nanoseconds":0}`}</code></div>
                    <div><b>GeoPoint</b> <code>{`{"__type":"geopoint","lat":-6.2,"lng":106.8}`}</code></div>
                    <div><b>Reference</b> <code>{`{"__type":"ref","path":"users/abc"}`}</code></div>
                    <div><b>Bytes</b> <code>{`{"__type":"bytes","base64":"aGVsbG8="}`}</code></div>
                    <div><b>Server time</b> <code>{`{"__type":"serverTimestamp"}`}</code></div>
                  </div>
                </details>
              </div>
              {subCollections.length > 0 && (
                <div className="pg-subcoll">
                  <span className="pg-subcoll-label">Subcollections:</span>
                  {subCollections.map((sub) => (
                    <button
                      key={sub.name}
                      className="chip"
                      onClick={() => setCollectionPath(`${documentPath}/${sub.name}`)}
                      title={sub.samplePath}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
              {probingSubs && <div className="pg-subcoll-hint">probing subcollections\u2026</div>}
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
