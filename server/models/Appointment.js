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
            enum: ["pending", "approved", "rejected", "completed", "expired", "cancelled"],
            default: "pending",
        },
        topic: {
            type: String,
            default: "",
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
        cancellationReason: {
            type: String,
            default: "",
            trim: true,
        },
        rescheduleReason: {
            type: String,
            default: "",
            trim: true,
        },
        actionBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        rescheduledFrom: {
            date: { type: String, default: "" },
            time: { type: String, default: "" },
        },
    },
    { timestamps: true }
);

appointmentSchema.pre("validate", function () {
    if (this.topic) {
        this.notes = this.topic;
    } else if (this.notes) {
        this.topic = this.notes;
    }
});

module.exports = mongoose.model("Appointment", appointmentSchema);
