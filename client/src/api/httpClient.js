import axios from "axios";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:3003";

export const API_BASE_URL = (
  process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export function buildApiUrl(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

httpClient.interceptors.request.use((config) => {
  if (/^\/(api\/auth(?:\/|$)|login$|logout$|registerUser$)/.test(config.url || "")) {
    config.headers["X-RiadaTech-Request"] = "1";
  }
  return config;
});

export default httpClient;
