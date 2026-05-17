import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./App.css";
import AdminDashboard from "./AdminDashboard";
import FacultyDashboard from "./FacultyDashboard";
import StudentDashboard from "./StudentDashboard";
import api, { AUTH_INVALID_EVENT } from "./api";
import logo from "./assets/logo.png";

const ROOT_PATH = "/";
const LOGIN_PATH = "/login";
const FORGOT_PASSWORD_PATH = "/forgot-password";
const RESET_PASSWORD_ROUTE_PREFIX = "/reset-password/";
const RESET_PASSWORD_SUCCESS_MESSAGE =
  "Password reset successful. You can now login.";

const clearStoredAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("loggedInUser");
};

const getStoredToken = () => localStorage.getItem("token") || "";

const getStoredUser = () => {
  const token = getStoredToken();
  const rawUser = localStorage.getItem("loggedInUser");

  if (!token || !rawUser) {
    if (token || rawUser) {
      clearStoredAuth();
    }

    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser);

    if (!parsedUser || typeof parsedUser !== "object" || !parsedUser.id || !parsedUser.role) {
      clearStoredAuth();
      return null;
    }

    return parsedUser;
  } catch (error) {
    console.error("Failed to parse stored user:", error);
    clearStoredAuth();
    return null;
  }
};

const persistAuthenticatedUser = (user, token) => {
  if (token) {
    localStorage.setItem("token", token);
  }

  if (user) {
    localStorage.setItem("loggedInUser", JSON.stringify(user));
  }
};

const getCurrentPathname = () => window.location.pathname || ROOT_PATH;

const getResetPasswordTokenFromPath = (pathname) => {
  const routeMatch = pathname.match(/^\/reset-password\/([^/]+)$/);

  return routeMatch?.[1] ? decodeURIComponent(routeMatch[1]) : "";
};

function PasswordField({ value, onChange, placeholder }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        type={isVisible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle-btn"
        aria-label={isVisible ? "Hide password" : "Show password"}
        onClick={() => setIsVisible((currentValue) => !currentValue)}
      >
        {isVisible ? <Eye size={20} /> : <EyeOff size={20} />}
      </button>
    </div>
  );
}

function App() {
  const [currentPath, setCurrentPath] = useState(() => getCurrentPathname());
  const [isLogin, setIsLogin] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [hasResetPasswordSucceeded, setHasResetPasswordSucceeded] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState(() => getStoredUser());
  const [isCheckingAuth, setIsCheckingAuth] = useState(
    () => Boolean(getStoredToken() && getStoredUser())
  );

  const resetPasswordToken = getResetPasswordTokenFromPath(currentPath);
  const isForgotPasswordRoute = currentPath === FORGOT_PASSWORD_PATH;
  const isResetPasswordRoute = Boolean(resetPasswordToken);

  const navigateTo = (nextPath, { clearFeedback = true } = {}) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }

    setCurrentPath(nextPath);

    if (clearFeedback) {
      setMessage("");
      setMessageType("");
    }

    if (nextPath !== FORGOT_PASSWORD_PATH) {
      setForgotPasswordEmail("");
    }

    if (!nextPath.startsWith(RESET_PASSWORD_ROUTE_PREFIX)) {
      setNewPassword("");
      setConfirmNewPassword("");
      setHasResetPasswordSucceeded(false);
    }
  };

  const resetSessionToLogin = ({
    feedbackMessage = "",
    feedbackType = "",
  } = {}) => {
    clearStoredAuth();
    setLoggedInUser(null);
    setEmail("");
    setPassword("");
    setFullName("");
    setRole("student");
    setForgotPasswordEmail("");
    setNewPassword("");
    setConfirmNewPassword("");
    setHasResetPasswordSucceeded(false);
    setIsCheckingAuth(false);
    setIsLogin(true);
    navigateTo(LOGIN_PATH, { clearFeedback: false });
    setMessage(feedbackMessage);
    setMessageType(feedbackType);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(getCurrentPathname());
      setMessage("");
      setMessageType("");
      setHasResetPasswordSucceeded(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleInvalidAuth = (event) => {
      resetSessionToLogin({
        feedbackMessage:
          event.detail?.message || "Your session has expired. Please log in again.",
        feedbackType: "error",
      });
    };

    window.addEventListener(AUTH_INVALID_EVENT, handleInvalidAuth);

    return () => window.removeEventListener(AUTH_INVALID_EVENT, handleInvalidAuth);
  }, []);

  useEffect(() => {
    const token = getStoredToken();

    if (!token || !loggedInUser?.id) {
      setIsCheckingAuth(false);
      return;
    }

    let isActive = true;

    setIsCheckingAuth(true);

    api.get("/api/auth/me")
      .then((response) => {
        const currentUser = response.data?.user;

        if (!currentUser) {
          const error = new Error("User not found");
          error.response = { data: { message: "User not found" } };
          throw error;
        }

        if (!isActive) {
          return;
        }

        setLoggedInUser(currentUser);
        persistAuthenticatedUser(currentUser, token);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        const backendMessage = String(
          error.response?.data?.message || error.message || ""
        );

        if (
          error.response?.status === 401 ||
          backendMessage.toLowerCase().includes("user not found")
        ) {
          resetSessionToLogin({
            feedbackMessage: backendMessage.toLowerCase().includes("user not found")
              ? "Your account no longer exists. Please log in again."
              : "Your session has expired. Please log in again.",
            feedbackType: "error",
          });
          return;
        }

        console.error("Failed to validate current user", error);
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingAuth(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [loggedInUser?.id]);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await api.post("/api/auth/login", {
        email,
        password,
      });

      const authenticatedUser = response.data?.user || null;
      const authToken = response.data?.token || "";

      if (!authenticatedUser || !authToken) {
        throw new Error("Invalid login response");
      }

      const userRole = authenticatedUser.role || "user";
      persistAuthenticatedUser(authenticatedUser, authToken);
      setLoggedInUser(authenticatedUser);
      setMessage(`Login successful. Logged in as ${userRole}.`);
      setMessageType("success");
    } catch (error) {
      console.error("Login error:", error);
      console.error("Response:", error.response);
      console.error("Message:", error.message);
      setMessage(error.response?.data?.message || error.message || "Login failed");
      setMessageType("error");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const response = await api.post("/api/auth/register", {
        fullName,
        email,
        password,
        role,
      });

      if (
        response.data.user.requestedRole === "faculty" &&
        response.data.user.approvalStatus === "pending"
      ) {
        setMessage("Faculty request submitted. Wait for admin approval.");
      } else {
        setMessage("Account created successfully. You can now log in.");
        setIsLogin(true);
      }

      setMessageType("success");
    } catch (error) {
      setMessage(error.response?.data?.message || "Registration failed");
      setMessageType("error");
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    try {
      const response = await api.post("/api/auth/forgot-password", {
        email: forgotPasswordEmail,
      });

      setMessage(
        response.data?.message || "If this email exists, a reset link has been sent."
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Failed to send the password reset email."
      );
      setMessageType("error");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmNewPassword) {
      setMessage("Please enter and confirm your new password.");
      setMessageType("error");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setMessage("Passwords do not match.");
      setMessageType("error");
      return;
    }

    try {
      const response = await api.post(
        `/api/auth/reset-password/${encodeURIComponent(resetPasswordToken)}`,
        {
          password: newPassword,
        }
      );

      const successMessage =
        response.data?.message || RESET_PASSWORD_SUCCESS_MESSAGE;

      setMessage(successMessage === RESET_PASSWORD_SUCCESS_MESSAGE ? "" : successMessage);
      setMessageType(successMessage === RESET_PASSWORD_SUCCESS_MESSAGE ? "" : "success");
      setHasResetPasswordSucceeded(true);
      setNewPassword("");
      setConfirmNewPassword("");
      setIsLogin(true);
    } catch (error) {
      setMessage(error.response?.data?.message || "Failed to reset password.");
      setMessageType("error");
      setHasResetPasswordSucceeded(false);
    }
  };

  const handleUserUpdate = (updatedUser) => {
    if (!updatedUser) {
      return;
    }

    setLoggedInUser(updatedUser);
    persistAuthenticatedUser(updatedUser);
  };

  const handleLogout = () => {
    resetSessionToLogin();
  };

  const goToLogin = () => {
    setIsLogin(true);
    navigateTo(LOGIN_PATH);
  };

  const hasAuthenticatedSession = Boolean(loggedInUser?.role && getStoredToken());

  if (isCheckingAuth && hasAuthenticatedSession) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-icon">
            <img src={logo} alt="Office Hours Logo" className="site-logo" />
          </div>

          <h2 className="login-title">Checking Session</h2>
          <p className="auth-subtitle">
            Verifying your account before loading the dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (hasAuthenticatedSession && loggedInUser?.role === "faculty") {
    return (
      <FacultyDashboard
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        user={loggedInUser}
      />
    );
  }

  if (hasAuthenticatedSession && loggedInUser?.role === "admin") {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (hasAuthenticatedSession && loggedInUser?.role === "student") {
    return (
      <StudentDashboard
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        user={loggedInUser}
      />
    );
  }

  const renderAuthForm = () => {
    if (isForgotPasswordRoute) {
      return (
        <>
          <p className="auth-subtitle">
            Enter your account email and we&apos;ll send a secure password reset link.
          </p>

          <form className="login-form" onSubmit={handleForgotPassword}>
            <input
              type="email"
              placeholder="Enter your email"
              value={forgotPasswordEmail}
              onChange={(e) => setForgotPasswordEmail(e.target.value)}
            />

            <button type="submit" className="auth-submit-btn">Send Reset Link</button>
          </form>
        </>
      );
    }

    if (isResetPasswordRoute) {
      return (
        <>
          <p className="auth-subtitle">
            Choose a new password for your account. This reset link expires after 15 minutes.
          </p>

          {!hasResetPasswordSucceeded ? (
            <form className="login-form" onSubmit={handleResetPassword}>
              <PasswordField
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <PasswordField
                placeholder="Confirm your new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />

              <button type="submit" className="auth-submit-btn">Reset Password</button>
            </form>
          ) : (
            <div className="auth-helper-card">
              Password reset successful. You can now login.
            </div>
          )}
        </>
      );
    }

    if (isLogin) {
      return (
        <form className="login-form" onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordField
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" className="auth-submit-btn">Login</button>
        </form>
      );
    }

    return (
      <form className="login-form" onSubmit={handleRegister}>
        <input
          type="text"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordField
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="student">Student</option>
          <option value="faculty">Faculty</option>
        </select>

        <button type="submit" className="auth-submit-btn">Create Account</button>
      </form>
    );
  };

  const getTitle = () => {
    if (isForgotPasswordRoute) {
      return "Forgot Password";
    }

    if (isResetPasswordRoute) {
      return "Reset Password";
    }

    return isLogin ? "Login" : "Create Account";
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">
          <img src={logo} alt="Office Hours Logo" className="site-logo" />
        </div>

        <h2 className="login-title">{getTitle()}</h2>

        {renderAuthForm()}

        {message && (
          <p className={`login-message ${messageType || "info"}`}>{message}</p>
        )}

        {isForgotPasswordRoute ? (
          <button type="button" className="auth-secondary-link" onClick={goToLogin}>
            Back to login
          </button>
        ) : isResetPasswordRoute ? (
          <button type="button" className="auth-secondary-link" onClick={goToLogin}>
            Back to login
          </button>
        ) : isLogin ? (
          <div className="auth-link-stack">
            <button
              type="button"
              className="forgot-password-btn"
              onClick={() => {
                setIsLogin(true);
                navigateTo(FORGOT_PASSWORD_PATH);
              }}
            >
              Forgot Password?
            </button>
            <p
              className="create-account"
              onClick={() => {
                setIsLogin(false);
                navigateTo(LOGIN_PATH);
              }}
            >
              Create an account
            </p>
          </div>
        ) : (
          <p className="create-account" onClick={goToLogin}>
            Back to login
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
