import { useState } from "react";
import "./App.css";
import AdminDashboard from "./AdminDashboard";
import FacultyDashboard from "./FacultyDashboard";
import StudentDashboard from "./StudentDashboard";
import api from "./api";
import logo from "./assets/logo.png";

function App() {
  const [isLogin, setIsLogin] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [message, setMessage] = useState("");

  const [loggedInUser, setLoggedInUser] = useState(null);

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
      localStorage.setItem("token", authToken);
      setLoggedInUser(authenticatedUser);
      setMessage(`Login successful. Logged in as ${userRole}.`);
    } catch (error) {
      console.error("Login error:", error);
      console.error("Response:", error.response);
      console.error("Message:", error.message);
      setMessage(error.response?.data?.message || error.message || "Login failed");
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

      if (response.data.user.requestedRole === "faculty" && response.data.user.approvalStatus === "pending") {
        setMessage("Faculty request submitted. Wait for admin approval.");
      } else {
        setMessage("Account created successfully. You can now log in.");
        setIsLogin(true);
      }

      console.log(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || "Registration failed");
    }

  };
  const handleLogout = () => {
    localStorage.removeItem("token");
    setLoggedInUser(null);
    setEmail("");
    setPassword("");
    setFullName("");
    setRole("student");
    setMessage("");
    setIsLogin(true);
  };

  if (loggedInUser?.role === "faculty") {
    return <FacultyDashboard onLogout={handleLogout} user={loggedInUser} />;
  }

  if (loggedInUser?.role === "admin") {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (loggedInUser?.role === "student") {
    return <StudentDashboard onLogout={handleLogout} user={loggedInUser} />;
  }

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="login-icon"><img src={logo} alt="Office Hours Logo" className="site-logo" /></div>

        <h2 className="login-title">{isLogin ? "Login" : "Create Account"}</h2>

        {isLogin ? (
          <form className="login-form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button type="submit">Login</button>
          </form>
        ) : (
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

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>

            <button type="submit">Create Account</button>
          </form>
        )}

        {message && <p className="login-message">{message}</p>}

        {isLogin ? (
          <>
            <p className="forgot-password">Forgot your password?</p>
            <p
              className="create-account"
              onClick={() => {
                setIsLogin(false);
                setMessage("");
              }}
            >
              Create an account
            </p>
          </>
        ) : (
          <p
            className="create-account"
            onClick={() => {
              setIsLogin(true);
              setMessage("");
            }}
          >
            Back to login
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
