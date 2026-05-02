const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ["student", "faculty", "admin"],
            default: "student",
        },
        requestedRole: {
            type: String,
            enum: ["student", "faculty"],
            default: "student",
        },
        approvalStatus: {
            type: String,
            enum: ["approved", "pending", "rejected"],
            default: "approved",
        },
        profileImage: {
            type: String,
            default: "",
        },
        displayName: {
            type: String,
            trim: true,
        },
        major: {
            type: String,
            trim: true,
            default: "",
        },
        building: {
            type: String,
            trim: true,
            default: "",
        },
        room: {
            type: String,
            trim: true,
            default: "",
        },
        phoneNumber: {
            type: String,
            trim: true,
            default: "",
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
