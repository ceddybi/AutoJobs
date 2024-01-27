import { isEmpty, uniqBy } from "lodash";

import fs from "fs";
import path from "path";

const packageJson = require('../../package.json');

const stateFilename = "state.json";
const appName = packageJson.name;

export interface AppJob {
    company: string,
    title: string,
    id: string,
    easyApply: boolean
};

export interface BEState {
    jobs: AppJob[];
    applied: AppJob[];
    questions: any[];
    count: number;
    isListRunning?: boolean;
    settings: {
        key: string;
        path: string;
    }
    // TODO: add more states
};

const initState = { applied: [], jobs: [], questions: [], count: 0, isListRunning: false } as BEState;



export function getAppDataPath() {
    switch (process.platform) {
        case "darwin": {
            return path.join(process.env["HOME"], "Library", "Application Support", appName);
        }
        case "win32": {
            return path.join(process.env.APPDATA, appName);
        }
        case "linux": {
            return path.join(process.env["HOME"], "." + appName);
        }
        default: {
            console.log("Unsupported platform!");
            process.exit(1);
        }
    }
}

export const getState = async (): Promise<BEState> => {
    try {
        const statePath = getAppDataPath();
        const appDataFilePath = path.join(statePath, stateFilename);
        const stateString = fs.readFileSync(appDataFilePath);
        const state = JSON.parse(stateString.toString());
        if (isEmpty(state)) {
            throw new Error("state is empty");
        }

        return state as BEState;
    }
    catch (error) {
        return initState;
    }

};


export async function setState(content: BEState) {
    try {
        const appDatatDirPath = getAppDataPath();

        // Create appDataDir if not exist
        if (!fs.existsSync(appDatatDirPath)) {
            fs.mkdirSync(appDatatDirPath);
        }

        const appDataFilePath = path.join(appDatatDirPath, stateFilename);
        const state = JSON.stringify(content, null, 2);


        fs.writeFileSync(appDataFilePath, state);
        return true;
    }
    catch (error) {
        return false;
    }
}

export const addApplied = async (job: AppJob) => {
    const state = await getState();
    const newApplied = uniqBy([...(state.applied || []), job], "id")
    const newState = { ...state, applied: newApplied };
    await setState(newState);
    return newState;
};

export const addJob = async (job: AppJob) => {
    const state = await getState();
    const newJobs = uniqBy([...(state.jobs || []), job], "id")
    const newState = { ...state, jobs: newJobs };
    await setState(newState);
    return newState;
}