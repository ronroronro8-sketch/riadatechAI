import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import httpClient from "../api/httpClient";

// Local profile data is not proof of authentication. Only /me restores identity.
export const restoreSession = createAsyncThunk(
  "auth/restoreSession",
  async (_, { rejectWithValue }) => {
    try { window.localStorage.removeItem("riadatach-auth-user"); } catch { /* Storage may be disabled. */ }
    try {
      const response = await httpClient.get("/api/auth/me");
      return response.data.user;
    } catch (error) {
      if (error.response?.status === 401) return null;
      return rejectWithValue("Session verification is temporarily unavailable.");
    }
  },
  { condition: (_, { getState }) => !getState().auth.authChecked && !getState().auth.restoreRequestId }
);

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await httpClient.post("/api/auth/register", payload);
      return response.data.user;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || "Registration could not be completed."
      );
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await httpClient.post("/api/auth/login", payload);
      return response.data.user;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || "Login could not be completed."
      );
    }
  }
);

export const logoutUser = createAsyncThunk("auth/logoutUser", async (_, { rejectWithValue }) => {
  try {
    await httpClient.post("/api/auth/logout");
    return null;
  } catch {
    return rejectWithValue("تعذر تسجيل الخروج. حاول مرة أخرى. / Logout failed. Please try again.");
  }
});

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    isAuthenticated: false,
    authChecked: false,
    restoreRequestId: null,
    status: "idle",
    error: "",
  },
  reducers: {
    clearAuthError(state) {
      state.error = "";
      if (state.status === "failed") {
        state.status = "idle";
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state, action) => {
        state.restoreRequestId = action.meta.requestId;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (state.restoreRequestId !== action.meta.requestId) return;
        state.restoreRequestId = null;
        state.authChecked = true;
        state.user = action.payload;
        state.isAuthenticated = Boolean(action.payload);
        state.error = "";
      })
      .addCase(restoreSession.rejected, (state, action) => {
        if (state.restoreRequestId !== action.meta.requestId) return;
        state.restoreRequestId = null;
        state.authChecked = true;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload || "Session verification failed.";
      })
      .addCase(registerUser.pending, (state) => {
        state.restoreRequestId = null;
        state.authChecked = true;
        state.status = "loading";
        state.error = "";
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.user = action.payload;
        state.isAuthenticated = true;
        state.error = "";
        state.authChecked = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Registration failed.";
      })
      .addCase(loginUser.pending, (state) => {
        state.restoreRequestId = null;
        state.authChecked = true;
        state.status = "loading";
        state.error = "";
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.user = action.payload;
        state.isAuthenticated = true;
        state.error = "";
        state.authChecked = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || "Login failed.";
      })
      .addCase(logoutUser.pending, (state) => {
        state.restoreRequestId = null;
        state.authChecked = true;
        state.status = "loading";
        state.error = "";
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = "idle";
        state.user = null;
        state.isAuthenticated = false;
        state.error = "";
        state.authChecked = true;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        // Do not claim logout succeeded while the server session is still valid.
        state.status = "failed";
        state.error = action.payload || "Logout failed. Please try again.";
      });
  },
});

export const { clearAuthError } = authSlice.actions;

export default authSlice.reducer;
