CollabFilePad
====================

Collaborative, LAN‑only, realtime file editor that works entirely in your local network. Multiple devices on the same LAN can join the same room and edit text/code files together—no cloud, no accounts.

Built with Yjs + y-webrtc for conflict-free realtime editing, a simple WebSocket signaling server, and a modern Vite frontend.


Features
--------
- Realtime collaboration (CRDT)
  - Powered by Yjs and y-webrtc (peer-to-peer WebRTC; data stays in your LAN)
  - Local WebSocket signaling server (no public fallback)
- Project-like file tree
  - Create, rename, delete files and folders
  - Drag & drop to move files/folders
  - Automatic name de-duplication ("Untitled.txt", "Untitled.txt 1", ...)
- Text editor
  - Plain textarea bound to Y.Text via y-textarea
  - Tab inserts 3 spaces
- Import & Export
  - Upload individual files or an entire folder (text-only) and preserve structure
  - Download the whole project as a zip
- Mobile friendly
  - Sidebar drawer with a top-left toggle button on small screens
  - Auto-collapse the sidebar when opening rename/create dialogs
- LAN Link helper
  - Displays `http(s)://<your-lan-ip>:5173` to share with peers on the same network
- Zero user management / privacy by default
  - No accounts, no cloud—content only flows between browsers in the LAN


Architecture at a Glance
------------------------
- Data model in Yjs (CRDT):
  - `nodes` (Y.Map): `id -> { id, type: 'file'|'folder', name, parentId, createdAt, updatedAt }`
  - `children` (Y.Map): `folderId -> Y.Array<childId>`
  - `fileContents` (Y.Map): `fileId -> Y.Text`
- Realtime transport: y-webrtc
  - Signaling via local WebSocket server on port 4444 (see `signal.mjs`)
  - Peers connect directly over WebRTC after signaling; no central datastore
- UI: Vite app with a custom file tree, modals, and editor
  - Mobile drawer behavior is CSS + minimal JS


What This App Is (and Isn’t)
----------------------------
- Is: a lightweight LAN collaboration tool for text and code snippets during workshops, classrooms, local hack sessions, etc.
- Isn’t: a versioned, persistent coding environment. There is no server-side persistence. When all peers disconnect, the CRDT state isn’t stored anywhere by default.


Requirements
------------
- Node.js 18+ (LTS recommended)
- npm 9+ (or pnpm/yarn with equivalent scripts)
- Modern desktop or mobile browser on the same LAN


Getting Started (Development)
-----------------------------
1) Install dependencies

```bash
npm install
```

2) Start the local signaling server (WebSocket, port 4444)

```bash
npm run signal
```

3) In a separate terminal, start the web app (Vite dev server, port 5173)

```bash
npm run dev
```

Alternatively, run both together using concurrently (already in devDependencies):

```bash
npx concurrently -k -n signal,web "npm:signal" "npm:dev"
```

4) Open the app in your browser

- The header shows a “Local Network Link” like `http://192.168.x.x:5173`. Share this link with other devices on the same LAN.
- On first load a default `ROOT` folder and a file like `Untitled.txt` will appear.


Production Build & Hosting
--------------------------
1) Build static assets

```bash
npm run build
```

2) Serve `dist/` with any static file server or reverse proxy. Start the signaling server as well:

```bash
node signal.mjs  # runs on 4444
```

Notes:
- The frontend (in `src/main.js`) points the y-webrtc provider to a signaling server on the same host at port 4444 (ws/wss decided by page protocol). If you deploy signaling elsewhere or under TLS termination, update that configuration.
- WebRTC typically prefers HTTPS (or `http://localhost`) for full functionality in modern browsers. For LAN deployments without TLS, most browsers still allow WebRTC on plain HTTP when using private IPs—but network and browser policies may vary.


How to Use
----------
- Files sidebar
  - Click the top-left ☰ on mobile to open/close the sidebar
  - Use the kebab menus (…) on files/folders for Rename/Delete
  - Drag & drop files/folders to move them
  - Collapsed folders persist per-device via `localStorage`
- Create a new file/folder
  - “+ New File” via folder row menu (or the top “New” button if present)
  - Name de-duplication is automatic within the same folder
  - On small screens the sidebar auto-collapses when dialogs open
- Upload
  - “Upload files” or “Upload folder” buttons in the Files header
  - Text-only files are accepted; non-text files are rejected with a message
  - Folder uploads keep the relative structure under `ROOT`
- Download
  - “Download project” zips the entire `ROOT` tree with current file contents
- Editor
  - Changes are synced to everyone in the room
  - Pressing Tab inserts three spaces


Networking Details
------------------
- Ports
  - 5173: Vite dev (or whatever you serve the app on)
  - 4444: WebSocket signaling server (`signal.mjs`)
- LAN Link helper
  - The Vite dev/preview server exposes `GET /__lanip` which returns the machine’s private IPv4 (e.g., `192.168.x.x`). The UI uses this to display a shareable LAN URL.
- Room name
  - The room is fixed as `lan-room` by default (see `src/main.js`). Change this if you want multiple separate rooms.


Data Persistence
----------------
- There is no server-side storage. The Yjs document lives in-memory inside the connected browsers.
- If all peers close the page, the shared state is lost. Export (zip) to keep a snapshot.


Security & Privacy
------------------
- No authentication, authorization, or encryption beyond what your LAN and browser provide.
- Anyone who can reach the app URL and signaling server on your network can join the session.
- For sensitive content, use a segmented network or add auth/TLS in a fork.


Project Structure
-----------------
```
.
├─ index.html              # App shell
├─ signal.mjs              # Local WebSocket signaling server (port 4444)
├─ vite.config.mjs         # Vite server config + /__lanip endpoint
├─ src/
│  ├─ main.js             # App logic (Yjs, file tree, bindings, UI)
│  ├─ style.css           # Styles (including mobile drawer)
│  ├─ *.svg               # UI icons
└─ package.json            # Scripts and dependencies
```


NPM Scripts
-----------
- `npm run dev` – Start Vite dev server (hosted, port 5173)
- `npm run build` – Build production assets to `dist/`
- `npm run preview` – Preview the production build (hosted, port 5173)
- `npm run signal` – Start the WebSocket signaling server (port 4444)


Troubleshooting
---------------
- The header shows `http://localhost:5173` instead of a LAN IP
  - Make sure you restarted the dev server after first setup
  - If your machine has multiple network interfaces/VLANs, the first private IPv4 is picked; manually open the one you prefer (e.g., `http://192.168.1.50:5173`)
- Peers can’t see each other (Peers: 0)
  - Ensure both devices open the same LAN URL and are on the same network
  - Check that port 4444 is reachable (no firewall block). The signaling server logs to the console when it starts
  - If using HTTPS, switch the signaling URL to `wss://` (the app infers this automatically from page protocol)
- Upload rejected
  - Only text-like files are allowed; see the extension/MIME rules in `src/main.js`
- Sidebar covers dialogs on mobile
  - The app auto-collapses the sidebar when opening create/rename dialogs; if it doesn’t, refresh and try again


Customization
-------------
- Change room name: edit `roomName` in `src/main.js`
- Change ports: dev server in `vite.config.mjs` (5173), signaling server in `signal.mjs` (4444)
- Change accepted file types: `isTextFileName()` in `src/main.js`
- Persist data: integrate a Yjs provider that stores to disk (e.g., y-leveldb, or a custom backend) – not included here


License
-------
ISC License. See `package.json` for the SPDX identifier.


Acknowledgments
---------------
- [Yjs](https://yjs.dev/) – CRDT for collaborative editing
- [y-webrtc](https://github.com/yjs/y-webrtc) – WebRTC provider for Yjs
- [y-textarea](https://github.com/yjs/y-textarea) – Textarea binding
- [Vite](https://vitejs.dev/) – Frontend tooling
- [ws](https://github.com/websockets/ws) – WebSocket server
- [JSZip](https://stuk.github.io/jszip/) – Create zip downloads in the browser


