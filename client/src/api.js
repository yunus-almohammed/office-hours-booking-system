import axios from "axios";

export const API_BASE_URL =
    import.meta.env.VITE_API_URL || "http://localhost:5000";
export const AUTH_INVALID_EVENT = "office-hours:auth-invalid";

const clearStoredAuth = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
};

const hasStoredAuth = () =>
    Boolean(localStorage.getItem("token") || localStorage.getItem("loggedInUser"));

const isAuthenticationFailure = (error) => {
    const statusCode = error?.response?.status;
    const message = String(
        error?.response?.data?.message || error?.message || ""
    ).toLowerCase();

    return statusCode === 401 || message.includes("user not found");
};

const getAuthenticationFailureMessage = (error) => {
    const message = String(
        error?.response?.data?.message || error?.message || ""
    ).toLowerCase();

    if (message.includes("user not found")) {
        return "Your account could not be found. Please log in again.";
    }

    return "Your session has expired. Please log in again.";
};

const api = axios.create({
    baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (hasStoredAuth() && isAuthenticationFailure(error)) {
            clearStoredAuth();

            window.dispatchEvent(
                new CustomEvent(AUTH_INVALID_EVENT, {
                    detail: {
                        message: getAuthenticationFailureMessage(error),
                    },
                })
            );
        }

        return Promise.reject(error);
    }
);

export const getProfileImageSrc = (profileImage) => {
    if (!profileImage) {
        return "";
    }

    if (profileImage.startsWith("/uploads")) {
        return `${API_BASE_URL}${profileImage}`;
    }

    return profileImage;
};

export default api;
