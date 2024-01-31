// api with axios

import { getResume, getState, setState } from "../utils/state";

import _get from "lodash/get";
import axios from 'axios';
import { isEmpty } from "lodash";

const isDev = process.env.APP_DEV ? (process.env.APP_DEV.trim() == "true") : false;

export const baseURL = isDev ? "http://localhost:3001" : "https://aij.vercel.app";
const api = axios.create({
    baseURL,
});

interface IResponse {
    status: number;
    // data: any;
};


interface GetAuth {
    access_token: string;
    refresh_token: string;
};

interface GetAuthApiRes {
    success: boolean;
    message: string;
    data: { userId: string, credits: number, auth: any }
};


export const getAuthApi = async (args: GetAuth): Promise<any> => {
    let state = await getState();
    try {
        const response = await api.post<GetAuthApiRes>('/api/auth', args);
        if (response.status !== 200) {
            throw new Error("error");
        }
        const data = response.data;
        if (data.success !== true) {
            const message = _get(data, "message");
            const status = _get(data, "status");
            const newAuth = { ...state.auth, res: { status, message, success: data.success } };
            await setState({ ...state, auth: newAuth });
            return newAuth;
        } else {

            const access_token = _get(data, "data.auth.session.access_token");
            const refresh_token = _get(data, "data.auth.session.refresh_token");
            if (isEmpty(access_token) || isEmpty(refresh_token)) {
                throw new Error("error getting tokens");
            };

            const email = _get(data, "data.auth.user.email", "");
            const credits = _get(data, "data.credits", 0);
            const newAuth = { access_token, refresh_token, email, credits, res: { success: true } };
            await setState({ ...state, auth: newAuth });
            return newAuth;
        }

    }
    catch (error) {
        console.error("Error getAuthApi", error);
        const newAuth = { ...state.auth, res: { message: error.message || "", success: false } };
        await setState({ ...state, auth: newAuth });
        return null;
    }

}


interface IMainResponse extends IResponse {
    data: any;
};

export const getMainApi = async (): Promise<any> => {
    try {
        const state = await getState();
        const resume = await getResume();
        const access_token = _get(state, "auth.access_token");
        const refresh_token = _get(state, "auth.refresh_token");
        if (isEmpty(access_token) || isEmpty(refresh_token)) {
            throw new Error("error getting tokens");
        };

        if (isEmpty(resume)) {
            throw new Error("error getting resume");
        }

        const data = {
            access_token,
            refresh_token,
            resume
        };

        const response = await api.post<IMainResponse>('/api/main', data);
        if (response.status !== 200) {
            throw new Error("error");
        }
        return response.data;

    }
    catch (error) {
        console.error("Error getMainApi", error);
        return null;
    }

}

export const getAppApi = async (): Promise<any> => {
    try {
        const state = await getState();
        const resume = await getResume();
        const access_token = _get(state, "auth.access_token");
        const refresh_token = _get(state, "auth.refresh_token");
        if (isEmpty(access_token) || isEmpty(refresh_token)) {
            throw new Error("error getting tokens");
        };

        if (isEmpty(resume)) {
            throw new Error("error getting resume");
        }

        const data = {
            access_token,
            refresh_token,
            resume
        };

        const response = await api.post<IMainResponse>('/api/app', data);
        if (response.status !== 200) {
            throw new Error("error");
        }
        return response.data;

    }
    catch (error) {
        console.error("Error getAppApi", error);
        return null;
    }

}

// ui using local file storage


// auth,

// questions, 
// resume sections,

// settings

export default api;