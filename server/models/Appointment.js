const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
    {
        appointmentId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        faculty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        slot: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AvailabilitySlot",
            default: null,
        },
        date: {
            type: String,
            required: true,
        },
        time: {
            type: String,
            required: true,
        },
        mode: {
            type: String,
            enum: ["online", "in-person"],
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "completed", "expired"],
            default: "pending",
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Appointment", appointmentSchema);
