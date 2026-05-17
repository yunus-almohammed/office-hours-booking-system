const User = require("../models/User");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { buildClientUserPayload } = require("../utils/buildClientUserPayload");
const { getJwtSecret } = require("../utils/getJwtSecret");
const {
    buildMissingEmailConfigurationMessage,
    getMissingEmailConfiguration,
    sendEmail,
} = require("../utils/sendEmail");

const forbiddenSelfUpdateFields = [
    "_id",
    "id",
    "email",
    "password",
    "role",
    "approvalStatus",
    "requestedRole",
];

const selfEditableProfileFields = [
    "fullName",
    "major",
    "phoneNumber",
    "contactEmail",
    "profileImage",
];

const PHONE_VALIDATION_MESSAGE = "Phone number must be exactly 10 digits.";
const isValidOptionalPhoneNumber = (value) => !value || /^\d{10}$/.test(value);
const CONTACT_EMAIL_VALIDATION_MESSAGE = "Please enter a valid contact email.";
const isValidOptionalEmail = (value) =>
    !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const FORGOT_PASSWORD_SUCCESS_MESSAGE =
    "If this email exists, a reset link has been sent.";
const INVALID_RESET_PASSWORD_TOKEN_MESSAGE =
    "Invalid or expired reset token.";
const RESET_PASSWORD_SUCCESS_MESSAGE =
    "Password reset successful. You can now login.";
const RESET_PASSWORD_EXPIRATION_MS = 15 * 60 * 1000;

const hashResetPasswordToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

const getMissingForgotPasswordConfiguration = () => {
    const missingConfiguration = [...getMissingEmailConfiguration()];

    if (!String(process.env.CLIENT_URL || "").trim()) {
        missingConfiguration.push("CLIENT_URL");
    }

    return missingConfiguration;
};

const getClientUrl = () => String(process.env.CLIENT_URL).trim().replace(/\/+$/, "");

const buildResetPasswordEmail = ({ fullName, resetUrl }) => ({
    subject: "Reset your Office Hours password",
    text: `Hello ${fullName || "there"},

We received a request to reset your Office Hours Booking System password.

Reset your password here: ${resetUrl}

This link will expire in 15 minutes. If you did not request a password reset, you can ignore this email.`,
    html: `
        <p>Hello ${fullName || "there"},</p>
        <p>We received a request to reset your Office Hours Booking System password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link will expire in 15 minutes.</p>
        <p>If you did not request a password reset, you can ignore this email.</p>
    `,
});

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Please enter email and password" });
        }

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (user.requestedRole === "faculty" && user.approvalStatus !== "approved") {
            return res.status(403).json({ message: "Your faculty account is pending admin approval" });
        }

        const token = jwt.sign(
            { id: user._id },
            getJwtSecret(),
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: buildClientUserPayload(user),
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ message: error.message });
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
            contactEmail: email,
            password,
            role: finalRole,
            requestedRole: finalRequestedRole,
            approvalStatus: finalApprovalStatus,
        });

        res.status(201).json({
            message: "Account created successfully",
            user: buildClientUserPayload(newUser),
        });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({ message: error.message });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const submittedEmail = req.body?.email;

        if (!submittedEmail) {
            return res.status(400).json({ message: "Email is required." });
        }

        const missingConfiguration = getMissingForgotPasswordConfiguration();

        if (missingConfiguration.length > 0) {
            return res
                .status(500)
                .json({
                    message: buildMissingEmailConfigurationMessage(
                        missingConfiguration
                    ),
                });
        }

        const normalizedEmail = String(submittedEmail).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res
                .status(200)
                .json({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE });
        }

        const rawResetToken = crypto.randomBytes(32).toString("hex");
        const hashedResetToken = hashResetPasswordToken(rawResetToken);
        const resetPasswordExpires = new Date(
            Date.now() + RESET_PASSWORD_EXPIRATION_MS
        );

        user.resetPasswordToken = hashedResetToken;
        user.resetPasswordExpires = resetPasswordExpires;
        await user.save();

        const resetUrl = `${getClientUrl()}/reset-password/${rawResetToken}`;
        const emailContent = buildResetPasswordEmail({
            fullName: user.fullName,
            resetUrl,
        });

        try {
            await sendEmail({
                to: user.email,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
            });
        } catch (error) {
            await User.updateOne(
                { _id: user._id },
                {
                    $unset: {
                        resetPasswordToken: "",
                        resetPasswordExpires: "",
                    },
                }
            );

            console.error("Forgot password email error:", error);

            if (
                error.code === "EMAIL_CONFIG_MISSING" ||
                error.code === "EMAIL_CONFIG_INVALID"
            ) {
                return res.status(500).json({ message: error.message });
            }

            return res
                .status(500)
                .json({ message: "Unable to send reset email right now." });
        }

        return res
            .status(200)
            .json({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE });
    } catch (error) {
        console.error("Forgot password error:", error);

        if (
            error.code === "EMAIL_CONFIG_MISSING" ||
            error.code === "EMAIL_CONFIG_INVALID"
        ) {
            return res.status(500).json({ message: error.message });
        }

        return res.status(500).json({ message: "Server error" });
    }
};

const resetPassword = async (req, res) => {
    try {
        const rawResetToken = req.params?.token;
        const nextPassword = req.body?.password;

        if (!rawResetToken || !nextPassword) {
            return res.status(400).json({ message: "Password is required." });
        }

        const hashedResetToken = hashResetPasswordToken(rawResetToken);
        const user = await User.findOne({
            resetPasswordToken: hashedResetToken,
            resetPasswordExpires: { $gt: new Date() },
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res
                .status(400)
                .json({ message: INVALID_RESET_PASSWORD_TOKEN_MESSAGE });
        }

        user.password = nextPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return res
            .status(200)
            .json({ message: RESET_PASSWORD_SUCCESS_MESSAGE });
    } catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            user: buildClientUserPayload(user),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateCurrentUserProfile = async (req, res) => {
    try {
        const submittedFields = Object.keys(req.body || {});
        const containsForbiddenFields = submittedFields.some((field) =>
            forbiddenSelfUpdateFields.includes(field)
        );

        if (containsForbiddenFields) {
            return res.status(400).json({
                message: "Only safe profile fields can be updated from this page.",
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let hasInvalidPhoneNumber = false;
        let hasInvalidContactEmail = false;

        selfEditableProfileFields.forEach((field) => {
            if (!(field in req.body)) {
                return;
            }

            const nextValue =
                typeof req.body[field] === "string" ? req.body[field].trim() : "";

            if (field === "fullName") {
                user.fullName = nextValue;
                return;
            }

            if (field === "phoneNumber") {
                if (nextValue && !isValidOptionalPhoneNumber(nextValue)) {
                    hasInvalidPhoneNumber = true;
                    return;
                }

                user.phoneNumber = nextValue;
                return;
            }

            if (field === "contactEmail") {
                if (nextValue && !isValidOptionalEmail(nextValue)) {
                    hasInvalidContactEmail = true;
                    return;
                }

                user.contactEmail = nextValue.toLowerCase();
                return;
            }

            user[field] = nextValue;
        });

        if (hasInvalidPhoneNumber) {
            return res.status(400).json({ message: PHONE_VALIDATION_MESSAGE });
        }

        if (hasInvalidContactEmail) {
            return res.status(400).json({ message: CONTACT_EMAIL_VALIDATION_MESSAGE });
        }

        if (!user.fullName) {
            return res.status(400).json({ message: "Full name is required." });
        }

        const updatedUser = await user.save();

        res.status(200).json({
            message: "Profile updated successfully.",
            user: buildClientUserPayload(updatedUser),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    loginUser,
    registerUser,
    forgotPassword,
    resetPassword,
    getCurrentUser,
    updateCurrentUserProfile,
};
