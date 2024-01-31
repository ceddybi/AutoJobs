import { APPEVENTS, AppEvents } from './events';
import { AppJob, BEState, addApplied, getAllQuestion, getResume, getState, readQuestion, saveQuestion, saveResume, setState } from "./utils/state";
import { BrowserWindow, app, dialog, ipcMain, session, shell } from 'electron';
import { baseURL, getAuthApi, isDev } from './api';
import { gotoAppPage, gotoMainPage } from './config/app';

import packageJson from '../package.json';
import path from 'node:path';
import { updateElectronApp } from "update-electron-app";

updateElectronApp();

const appName = packageJson.name;
const appEvents = AppEvents.Instance;
// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow = null;

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(appName, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(appName)
}

const gotTheLock = app.requestSingleInstanceLock()


const getAppAuth = async (urlLinking?: string) => {

  let access_token, refresh_token;

  try {
    if (urlLinking) {
      const urlObj = new URL(urlLinking);
      access_token = urlObj.searchParams.get('access_token');
      refresh_token = urlObj.searchParams.get('refresh_token');

    } else {
      const state = await getState();
      access_token = state.auth.access_token;
      refresh_token = state.auth.refresh_token;
    }

    if (access_token && refresh_token) {
      const getAuth = await getAuthApi({ access_token, refresh_token });
      if (!getAuth) {
        throw new Error("Error logging in");
      }
    }
  }
  catch (error) {
    console.error("Error", error);
    dialog.showErrorBox(error.message || "Error opening app", "Please try again");
  }
}
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', async (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    const url = commandLine.pop().slice(0, -1);
    if (url) {
      await getAppAuth(url);
    }

  })

  // Create mainWindow, load the rest of the app, etc...
  app.whenReady().then(() => {
    console.log("app.whenReady");
    createWindow()
  })

  app.on('open-url', async (event, url) => {
    if (url) {
      await getAppAuth(url);
    }
  })
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'assets/icon.png'),
    height: 700,
    width: 1000,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: true,
      // devTools: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  if (isDev) mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  session.defaultSession.protocol.registerFileProtocol('static', (request, callback) => {
    const fileUrl = request.url.replace('static://', '');
    const filePath = path.join(app.getAppPath(), '.webpack/renderer', fileUrl);
    console.log("filePath", filePath);
    callback(filePath);
  });
  createWindow();
  getAppAuth();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log("activate");
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('settings:save', async (event, settings) => {
  const state = await getState();
  const newSettings = { ...state.settings, ...settings };
  const newState = { ...state, settings: newSettings };
  await setState(newState);
  return newState;
});

const setListStartStop = async (isStart: boolean) => {
  const state = await getState();
  const newState = { ...state, isListRunning: isStart };
  await setState(newState);
  return newState;
}

ipcMain.handle('list:start', async (event, url) => {
  await setListStartStop(true);
  await gotoMainPage(url);
  return true;
});

ipcMain.handle('list:stop', async (event) => {
  await setListStartStop(false);
  appEvents.emit(APPEVENTS.LIST_STOP);
  return true;
});

const setAppStartStop = async (isStart: boolean) => {
  const state = await getState();
  const newState: BEState = { ...state, isAppRunning: isStart, activeJob: null };
  await setState(newState);
  return newState;
}

appEvents.on(APPEVENTS.APP_START, async (job: AppJob) => {
  console.log("appEvents.on(APPEVENTS.APP_STOP", job);
  await runApplying();
});

async function runApplying(): Promise<any> {
  let jobs: AppJob[] = [];
  let state: any = {};
  let activeJob: AppJob = null;
  let cantRun = false;
  try {
    state = await getState();
    jobs = state.jobs;
    activeJob = state.activeJob;

    cantRun = !!activeJob || !state.isAppRunning;

    if (cantRun) {
      console.log("activeJob", { activeJob, isAppRunning: state.isAppRunning });
      return null;
    }

    console.log("startApplying", jobs.length);
    const firstJob = jobs[0];

    if (firstJob) {
      await setState({ ...state, activeJob: firstJob });
      await gotoAppPage(firstJob);
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });
    }

  }
  catch (error) {
    console.error("Error startApplying", error);
    return null;

  } finally {
    const state = await getState();
    // get next job
    const nextJob = state.jobs[1];
    if (nextJob && !cantRun) {
      console.log("nextJob", nextJob);
      appEvents.emit(APPEVENTS.APP_START, null);
    }

  }
}

ipcMain.handle('app:start', async (event) => {
  console.log("app:start");
  await setAppStartStop(true);
  appEvents.emit(APPEVENTS.APP_START, null);
  return true;
});

ipcMain.handle('app:stop', async (event) => {
  console.log("app:stop");
  await setAppStartStop(false);
  appEvents.emit(APPEVENTS.APP_STOP);
  return true;
});

ipcMain.handle('state', async (event) => {
  const state = await getState();
  return state;
});

ipcMain.handle('questions:read', async (event, question) => {
  console.log("questions:read", question);
  const savedQuestion = await readQuestion(question as any);
  return savedQuestion;
});


ipcMain.handle('questions:getall', async (event) => {
  const questions = await getAllQuestion();
  return questions;
});

ipcMain.handle('questions:save', async (event, question) => {
  console.log("questions:save", question);
  const savedQuestion = await saveQuestion(question as any);
  return savedQuestion;
});

ipcMain.handle('resume:get', async (event, question) => {
  const savedResume = await getResume();
  return savedResume;
});

ipcMain.handle('resume:save', async (event, resume) => {
  const savedResume = await saveResume(resume as any);
  return savedResume;
});

ipcMain.handle('open:link', async (event, ogLink) => {
  const link = `${baseURL}/signin/app`;
  await shell.openExternal(link);
  return true;
});

ipcMain.handle('logout', async (event, ogLink) => {
  const state = await getState();
  const newState = { ...state, auth: {} as any };
  await setState(newState);
  return true;
});

ipcMain.handle('my-invokable-ipc', async (event, ...args) => {
  const state = await getState();
  // const browser = await getBrowser();
  // const page = await browser.newPage();
  // console.log('args', { browser, page });

  const newState = { ...state, count: state.count + 1 };
  await setState(newState);
  return newState;
})