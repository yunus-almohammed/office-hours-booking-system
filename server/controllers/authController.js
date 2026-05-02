const User = require("../models/User");
const jwt = require("jsonwebtoken");

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Please enter email and password" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (user.password !== password) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (user.requestedRole === "faculty" && user.approvalStatus !== "approved") {
            return res.status(403).json({ message: "Your faculty account is pending admin approval" });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                requestedRole: user.requestedRole,
                approvalStatus: user.approvalStatus,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const registerUser = async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "Please fill all required fields" });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        let finalRole = "student";
        let finalRequestedRole = role || "student";
        let finalApprovalStatus = "approved";

        if (finalRequestedRole === "faculty") {
            finalRole = "student";
            finalApprovalStatus = "pending";
        }

        const newUser = await User.create({
            fullName,
            email,
            password,
            role: finalRole,
            requestedRole: finalRequestedRole,
            approvalStatus: finalApprovalStatus,
        });

        res.status(201).json({
            message: "Account created successfully",
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                email: newUser.email,
                role: newUser.role,
                requestedRole: newUser.requestedRole,
                approvalStatus: newUser.approvalStatus,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { loginUser, registerUser };
