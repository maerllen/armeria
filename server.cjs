var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_promises = __toESM(require("fs/promises"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var DATABASE_DIR = import_path.default.join(process.cwd(), "data");
var DATABASE_FILE = import_path.default.join(DATABASE_DIR, "armeria_db.json");
var SERVER_STATE_ENDPOINT = "/api/state";
async function ensureDatabaseDir() {
  await import_promises.default.mkdir(DATABASE_DIR, { recursive: true });
}
async function readServerState() {
  try {
    const stateJson = await import_promises.default.readFile(DATABASE_FILE, "utf8");
    return JSON.parse(stateJson);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    console.error("Failed to read server state:", error);
    return null;
  }
}
async function writeServerState(state) {
  try {
    await ensureDatabaseDir();
    await import_promises.default.writeFile(DATABASE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write server state:", error);
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "Armeria - Gest\xE3o de Armas e Muni\xE7\xF5es" });
  });
  app.get(SERVER_STATE_ENDPOINT, async (req, res) => {
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ message: "Server state not initialized" });
    }
    return res.json(state);
  });
  app.post(SERVER_STATE_ENDPOINT, async (req, res) => {
    const state = req.body;
    await writeServerState(state);
    return res.json({ success: true });
  });
  const ENTITY_MAP = {
    users: "users",
    departments: "departments",
    units: "units",
    courses: "courses",
    vaultspaces: "vaultSpaces",
    "vault-spaces": "vaultSpaces",
    calibers: "calibers",
    "ammo-stocks": "ammoStocks",
    "ammo-movements": "ammoMovements",
    weapons: "weapons",
    movements: "movements",
    "audit-logs": "auditLogs",
    auditlogs: "auditLogs"
  };
  function resolveEntityKey(entityParam) {
    return ENTITY_MAP[entityParam.toLowerCase()];
  }
  app.get("/api/:entity", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const entityData = state[entityKey];
    if (!Array.isArray(entityData)) {
      return res.status(404).json({ error: "Entity data not available" });
    }
    return res.json(entityData);
  });
  app.get("/api/:entity/:id", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const entityData = state[entityKey];
    if (!Array.isArray(entityData)) {
      return res.status(404).json({ error: "Entity data not available" });
    }
    const item = entityData.find((entry) => entry.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    return res.json(item);
  });
  app.post("/api/:entity", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const entityData = state[entityKey];
    if (!Array.isArray(entityData)) {
      return res.status(404).json({ error: "Entity data not available" });
    }
    const item = req.body;
    if (!item || typeof item !== "object") {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (!item.id) {
      item.id = `${req.params.entity}-${Date.now()}`;
    }
    entityData.push(item);
    await writeServerState(state);
    return res.status(201).json(item);
  });
  app.put("/api/:entity/:id", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const entityData = state[entityKey];
    if (!Array.isArray(entityData)) {
      return res.status(404).json({ error: "Entity data not available" });
    }
    const index = entityData.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }
    const updates = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Invalid payload" });
    }
    entityData[index] = { ...entityData[index], ...updates, id: req.params.id };
    await writeServerState(state);
    return res.json(entityData[index]);
  });
  app.put("/api/:entity", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const payload = req.body;
    if (!Array.isArray(payload)) {
      return res.status(400).json({ error: "Payload must be an array" });
    }
    state[entityKey] = payload;
    await writeServerState(state);
    return res.json(payload);
  });
  app.delete("/api/:entity/:id", async (req, res) => {
    const entityKey = resolveEntityKey(req.params.entity);
    if (!entityKey) {
      return res.status(404).json({ error: "Entity not found" });
    }
    const state = await readServerState();
    if (!state) {
      return res.status(404).json({ error: "Server state not initialized" });
    }
    const entityData = state[entityKey];
    if (!Array.isArray(entityData)) {
      return res.status(404).json({ error: "Entity data not available" });
    }
    const index = entityData.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }
    entityData.splice(index, 1);
    await writeServerState(state);
    return res.json({ success: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Armeria] Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
