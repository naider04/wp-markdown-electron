const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// Initial project folder (first window). Provided either by the CLI "open"
// command via the --folder arg or by the WP_PROJECT_FOLDER env var.
let projectFolder = process.env.WP_PROJECT_FOLDER || null;

function folderFromArgv(argv) {
  const folderIdx = argv.indexOf('--folder');
  if (folderIdx !== -1 && argv[folderIdx + 1]) {
    return path.resolve(argv[folderIdx + 1]);
  }
  return null;
}

projectFolder = folderFromArgv(process.argv) || projectFolder;

// One window per distinct project folder. Windows that share the SAME folder
// are never created twice: reopening one only focuses the existing window.
const windowsByFolder = new Map();

function createWindow(folder) {
  folder = folder ? path.resolve(folder) : null;
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#020617',
    title: folder ? path.basename(folder) : 'WP Document Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.folder = folder;

  const devUrl = process.env.WP_DEV_URL || null;

  if (devUrl) {
    win.loadURL(`${devUrl}?mode=edit`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: { mode: 'edit' },
    });
  }

  if (folder) windowsByFolder.set(folder, win);

  win.on('closed', () => {
    if (win.folder) windowsByFolder.delete(win.folder);
    stopProjectWatch(win);
  });

  watchProject(win, folder);
  return win;
}

// ---- Manifest helpers ---------------------------------------------------
const MANIFEST_NAME = 'configuracion_metadatos.json';
const PROJECT_DATA_DIR = '.mdwp';
const CONTENT_NAME = 'contenido_fuente.md';
const BIB_NAME = 'bibliografia.bib';

function manifestPath(folder) {
  const nested = path.join(folder, PROJECT_DATA_DIR, MANIFEST_NAME);
  return fs.existsSync(nested) ? nested : path.join(folder, MANIFEST_NAME);
}

// ---- Project folder watcher ----------------------------------------------
// Detects when the preview should refresh (a new `mdwp build` run rewrites
// documento_formateado.html, or the source md/config files change on disk),
// and tells the renderer to reload the project.
const PROJECT_WATCH_FILES = [CONTENT_NAME, 'contenido_fuente.qmd', 'portada.md', MANIFEST_NAME, 'documento_formateado.html'];

function watchProject(win, folder) {
  if (!folder || !fs.existsSync(folder) || !win) return;
  try {
    const onChange = (_event, filename) => {
      if (!filename) return;
      const relevant = PROJECT_WATCH_FILES.includes(String(filename)) || String(filename) === PROJECT_DATA_DIR;
      if (!relevant) return;
      if (win._watchTimer) clearTimeout(win._watchTimer);
      win._watchTimer = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('project:changed');
        }
      }, 300);
    };
    win._watchers = [];
    const attachDataWatcher = () => {
      if (win._dataWatcherAttached) return;
      const dataDir = path.join(folder, PROJECT_DATA_DIR);
      if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) return;
      win._watcherData = fs.watch(dataDir, { persistent: false }, (_event, filename) => {
        if (String(filename || '') === MANIFEST_NAME) onChange(_event, PROJECT_DATA_DIR);
      });
      win._watchers.push(win._watcherData);
      win._dataWatcherAttached = true;
    };
    win._watchers.push(fs.watch(folder, { persistent: false }, (_event, filename) => {
      if (String(filename || '') === PROJECT_DATA_DIR) attachDataWatcher();
      onChange(_event, filename);
    }));
    attachDataWatcher();
  } catch (e) {
    console.error('No se pudo vigilar la carpeta del proyecto:', e.message);
  }
}

function stopProjectWatch(win) {
  if (!win) return;
  if (win._watchTimer) {
    clearTimeout(win._watchTimer);
    win._watchTimer = null;
  }
  for (const watcher of win._watchers || []) {
    try { watcher.close(); } catch (e) { /* ignore */ }
  }
  win._watchers = [];
  win._dataWatcherAttached = false;
  win._watcherData = null;
}

// ---- IPC: tell the renderer the current project folder ------------------
ipcMain.handle('project:getFolder', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && win.folder ? win.folder : null;
});

// ---- IPC: open a folder picker ------------------------------------------
ipcMain.handle('project:pickFolder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Selecciona la carpeta del proyecto',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return null;
  }
  const picked = path.resolve(result.filePaths[0]);
  if (win) {
    // Point THIS window at the picked project.
    if (win.folder) windowsByFolder.delete(win.folder);
    win.folder = picked;
    windowsByFolder.set(picked, win);
    stopProjectWatch(win);
    watchProject(win, picked);
  }
  return picked;
});

// ---- IPC: pick the content file (markdown / text) ------------------------
ipcMain.handle('project:pickFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Selecciona el archivo de contenido',
    properties: ['openFile'],
    filters: [
      { name: 'Contenido', extensions: ['qmd', 'md', 'markdown', 'txt', 'html', 'htm'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

// ---- IPC: pick the bibliography (.bib) file -------------------------------
ipcMain.handle('project:pickBib', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Selecciona el archivo de bibliografía',
    properties: ['openFile'],
    filters: [
      { name: 'Bibliografía', extensions: ['bib', 'bibtex'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

// ---- IPC: read a text file's contents ------------------------------------
ipcMain.handle('project:readFile', async (_evt, filePath) => {
  if (!filePath) return '';
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return '';
  }
});

// ---- IPC: write a text content file (e.g. heading level edits to the qmd) --
ipcMain.handle('project:writeContent', async (_evt, { filePath, text }) => {
  if (!filePath) return { ok: false, error: 'Sin archivo.' };
  try {
    fs.writeFileSync(filePath, text ?? '', 'utf8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---- IPC: write the external styles sheet (documento-estilos.css) ----------
ipcMain.handle('project:writeStyles', async (_evt, { folder, filename, text }) => {
  const dir = folder || projectFolder;
  if (!dir) return { ok: false, error: 'Sin carpeta de proyecto.' };
  try {
    const name = filename || 'documento-estilos.css';
    const out = path.join(dir, name);
    fs.writeFileSync(out, text ?? '', 'utf8');
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---- IPC: read a project folder ------------------------------------------
// Returns { folder, manifest, contentPath, contentText, images[] } or null.
ipcMain.handle('project:readFolder', async (_evt, folder) => {
  const dir = folder || projectFolder;
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return null;
  }

  let manifest = null;
  const mPath = manifestPath(dir);
  if (fs.existsSync(mPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    } catch (e) {
      manifest = null;
    }
  } else {
    // Seed a minimal manifest so the folder is a valid project
    manifest = {};
  }

  // Read the content file referenced by the manifest (or default name).
  // Fall back to the legacy .qmd name so older projects (created before .md)
  // keep working without needing the manifest to record their content file.
  const legacyContentName = 'contenido_fuente.qmd';
  let contentPath =
    manifest.contentFile ||
    (fs.existsSync(path.join(dir, CONTENT_NAME)) ? path.join(dir, CONTENT_NAME) : path.join(dir, legacyContentName));
  let contentText = '';
  if (contentPath && fs.existsSync(contentPath) && fs.statSync(contentPath).isFile()) {
    contentText = fs.readFileSync(contentPath, 'utf8');
  } else {
    contentPath = null;
  }

  // Read the bibliography (.bib) file referenced by the manifest (or default name)
  let bibPath = manifest.bibFile || path.join(dir, BIB_NAME);
  let bibtex = '';
  if (bibPath && fs.existsSync(bibPath) && fs.statSync(bibPath).isFile()) {
    bibtex = fs.readFileSync(bibPath, 'utf8');
  } else {
    bibPath = null;
  }

  // Read the external styles sheet (documento-estilos.css) referenced from the
  // qmd YAML. The file is the source of truth for the CSS blocks; the manifest
  // keeps a mirror but the file wins when reimporting.
  const stylesName = manifest.stylesFile || 'documento-estilos.css';
  let stylesPath = path.join(dir, stylesName);
  let stylesText = '';
  if (fs.existsSync(stylesPath) && fs.statSync(stylesPath).isFile()) {
    stylesText = fs.readFileSync(stylesPath, 'utf8');
  } else {
    stylesPath = null;
  }

  const coverPath = path.join(dir, 'portada.md');
  const coverText = fs.existsSync(coverPath) && fs.statSync(coverPath).isFile()
    ? fs.readFileSync(coverPath, 'utf8')
    : '';

  // Collect local image files so the renderer can embed them by filename.
  // Walk nested project asset folders too (for example `img/logo.png`), since
  // the paginated preview and srcDoc sandbox cannot resolve those paths from
  // the Electron app origin.
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
  let images = [];
  const imageByName = new Map();
  try {
    const visitImageFiles = async (imageDir) => {
      let entries = [];
      try { entries = await fsp.readdir(imageDir, { withFileTypes: true }); } catch (e) { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          await visitImageFiles(path.join(imageDir, entry.name));
          continue;
        }
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (imageExts.includes(ext)) {
            const abs = path.join(imageDir, entry.name);
            const buf = await fsp.readFile(abs);
            imageByName.set(entry.name, {
              name: entry.name,
              type: 'image/' + ext.slice(1).replace('jpg', 'jpeg'),
              size: buf.length,
              dataUrl: `data:image/${ext.slice(1).replace('jpg', 'jpeg')};base64,${buf.toString('base64')}`,
            });
          }
        }
      }
    };
    await visitImageFiles(dir);
  } catch (e) {
    images = [];
  }
  images = Array.from(imageByName.values());

  return { folder: dir, manifest, contentPath, contentText, bibPath, bibtex, stylesPath, stylesText, coverPath: coverText ? coverPath : null, coverText, images };
});

// ---- IPC: save a project (write manifest + copied content + base64 images) --
ipcMain.handle(
  'project:writeFolder',
  async (_evt, { folder, manifest, contentPath, contentText, bibtex, images, saveContent }) => {
    const dir = folder || projectFolder;
    if (!dir) {
      return { ok: false, error: 'No hay carpeta de proyecto.' };
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Content file (contenido_fuente.qmd) is edited externally and must never be
    // overwritten by Electron. Only write it when explicitly requested via
    // saveContent:true; otherwise leave the file untouched.
    let finalContentPath = manifest.contentFile || null;
    if (saveContent === true && contentPath && contentText !== undefined) {
      finalContentPath = path.join(dir, CONTENT_NAME);
      fs.writeFileSync(finalContentPath, contentText, 'utf8');
      manifest.contentFile = finalContentPath;
    }

    // Write the bibliography (.bib) file under a fixed name and record it.
    let finalBibPath = manifest.bibFile || null;
    if (bibtex !== undefined) {
      finalBibPath = path.join(dir, BIB_NAME);
      fs.writeFileSync(finalBibPath, bibtex, 'utf8');
      manifest.bibFile = finalBibPath;
    }

    // Write plain image binaries from their base64 dataUrls
    let imageNames = [];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (!img || !img.name || !img.dataUrl) continue;
        const match = img.dataUrl.match(/^data:[^;]+;base64,(.*)$/s);
        if (match) {
          const buf = Buffer.from(match[1], 'base64');
          const dataDir = path.join(dir, PROJECT_DATA_DIR);
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, img.name), buf);
          imageNames.push(img.name);
        }
      }
    }

    // Write the manifest last, so a partial write never looks like a valid project
    const dataDir = path.join(dir, PROJECT_DATA_DIR);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');

    return { ok: true, folder: dir, contentPath: finalContentPath, bibPath: finalBibPath, imageNames };
  }
);

// ---- IPC: run the "build" in the renderer and return the produced html ----
// The renderer will call window.wpBridge.buildResult(html) when done; main
// simply saves it to <folder>/documento.html.
ipcMain.handle('project:saveBuiltHtml', async (_evt, { folder, html, filename }) => {
  const dir = folder || projectFolder;
  if (!dir || !html) return { ok: false, error: 'Sin resultado.' };
  const out = path.join(dir, filename || 'documento_formateado.html');
  fs.writeFileSync(out, html, 'utf8');
  return { ok: true, path: out };
});

// ---- IPC: read the built standalone HTML (documento_formateado.html) ----
// Returns { exists, html, path } so the sandbox viewer can display the file
// previously generated by `mdwp build` without needing a server or auto-build.
ipcMain.handle('project:readBuiltHtml', async (_evt, folder) => {
  const dir = folder || projectFolder;
  if (!dir) return { exists: false, html: '', path: null };
  const out = path.join(dir, 'documento_formateado.html');
  if (!fs.existsSync(out) || !fs.statSync(out).isFile()) {
    return { exists: false, html: '', path: out };
  }
  let html = '';
  try {
    html = fs.readFileSync(out, 'utf8');
  } catch (e) {
    html = '';
  }
  return { exists: true, html, path: out };
});

// ---- IPC: open the built standalone HTML in the system browser -----------
ipcMain.handle('project:openBuiltHtml', async (_evt, folder) => {
  const dir = folder || projectFolder;
  if (!dir) return { ok: false, error: 'Sin carpeta de proyecto.' };
  const out = path.join(dir, 'documento_formateado.html');
  if (!fs.existsSync(out)) {
    return { ok: false, exists: false, error: 'documento_formateado.html no existe. Ejecuta mdwp build.' };
  }
  try {
    await shell.openPath(out);
    return { ok: true, exists: true, path: out };
  } catch (e) {
    return { ok: false, exists: true, error: String(e) };
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running: it will focus/handle the folder.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const folder = folderFromArgv(argv);
    if (!folder) return;
    const existing = windowsByFolder.get(path.resolve(folder));
    if (existing) {
      // Same folder requested again: no second window, just focus it.
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }
    // A different folder: open a NEW window for it.
    createWindow(folder);
  });

  app.whenReady().then(() => {
    createWindow(projectFolder);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(projectFolder);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
