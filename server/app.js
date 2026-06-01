const express = require("express");//Loads the Express framework — this is what turns Node.js into a web server that can receive and respond to requests.
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const studentRoutes = require("./routes/studentRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const allowedOrigins = [
    "http://localhost:5173",
    process.env.CLIENT_URL,
].filter(Boolean);

app.use(
    //CORS (Cross-Origin Resource Sharing) — a security rule that blocks requests from unknown websites.
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);
//Tells Express to read and understand JSON data sent in request bodies (like login forms, registration, etc.).
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
    res.send("API is running");
});

app.use("/api/auth", authRoutes);// login, register, forgot password
app.use("/api/admin", adminRoutes);//manage faculty requests, delete accounts
app.use("/api/faculty", facultyRoutes);//availability slots, profile, students
app.use("/api/notifications", notificationRoutes);//send and read notifications
app.use("/api/student", studentRoutes);//booking appointments
app.use("/api/appointments", appointmentRoutes);//approve, reject, view appointments
app.use("/api/users", userRoutes);//profile image upload

module.exports = app;
