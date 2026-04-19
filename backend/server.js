const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory store for active sessions.
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      trackers: new Map(),
      viewers: new Set(),
      latestLocations: new Map()
    });
  }

  return sessions.get(sessionId);
}

function broadcast(targets, payload) {
  targets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

// Create tracking session
app.post("/api/create-session", (req, res) => {
  const sessionId = uuidv4();

  getSession(sessionId);

  const frontendOrigin = req.headers.origin || "http://localhost:5173";

  res.json({
    sessionId,
    viewerUrl: `${frontendOrigin}/?session=${sessionId}`,
    trackingUrl: `${frontendOrigin}/track.html?session=${sessionId}`
  });
});

const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const trackPagePath = path.join(__dirname, "..", "frontend", "track.html");

app.get("/track.html", (req, res) => {
  res.sendFile(trackPagePath);
});

app.use(express.static(frontendDistPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// WebSocket connection
wss.on("connection", (ws, req) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const sessionId = requestUrl.searchParams.get("session");
  const role = requestUrl.searchParams.get("role") || "viewer";
  const label = requestUrl.searchParams.get("label")?.trim() || "";
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!sessionId || !session) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Invalid session" }));
    ws.close();
    return;
  }

  const isTracker = role === "tracker";
  if (isTracker && !label) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Missing participant identifier" }));
    ws.close();
    return;
  }

  if (isTracker) {
    if (!session.trackers.has(label)) {
      session.trackers.set(label, new Set());
    }

    session.trackers.get(label).add(ws);
  } else {
    session.viewers.add(ws);
    if (session.latestLocations.size > 0) {
      ws.send(
        JSON.stringify({
          type: "SNAPSHOT",
          locations: Array.from(session.latestLocations.values())
        })
      );
    }
  }

  ws.on("message", (message) => {
    let data;

    try {
      data = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Invalid payload" }));
      return;
    }

    if (data.type !== "LOCATION" || !isTracker) {
      return;
    }

    const { lat, lng, accuracy, heading, speed } = data;

    if (typeof lat !== "number" || typeof lng !== "number") {
      ws.send(JSON.stringify({ type: "ERROR", message: "Missing coordinates" }));
      return;
    }

    const payload = {
      type: "LOCATION",
      label,
      lat,
      lng,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      heading: typeof heading === "number" ? heading : null,
      speed: typeof speed === "number" ? speed : null,
      timestamp: Date.now()
    };

    session.latestLocations.set(label, payload);
    broadcast(session.viewers, payload);
  });

  ws.on("close", () => {
    if (isTracker) {
      const trackerSet = session.trackers.get(label);

      if (trackerSet) {
        trackerSet.delete(ws);

        if (trackerSet.size === 0) {
          session.trackers.delete(label);
        }
      }
    } else {
      session.viewers.delete(ws);
    }

    if (session.trackers.size === 0 && session.viewers.size === 0) {
      sessions.delete(sessionId);
    }
  });

  ws.on("error", () => {
    if (isTracker) {
      const trackerSet = session.trackers.get(label);

      if (trackerSet) {
        trackerSet.delete(ws);

        if (trackerSet.size === 0) {
          session.trackers.delete(label);
        }
      }
    } else {
      session.viewers.delete(ws);
    }

    if (session.trackers.size === 0 && session.viewers.size === 0) {
      sessions.delete(sessionId);
    }
  });
});

const port = process.env.PORT || 5000;

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});