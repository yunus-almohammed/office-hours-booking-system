const mongoose = require("mongoose");

const availabilitySlotSchema = new mongoose.Schema(
    {
        slotId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        faculty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        day: {
            type: String,
            enum: [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ],
            required: true,
        },
        period: {
            type: String,
            enum: [
                "07:00 AM - 08:00 AM",
                "08:00 AM - 09:00 AM",
                "09:00 AM - 10:00 AM",
                "10:00 AM - 11:00 AM",
                "11:00 AM - 12:00 PM",
                "12:00 PM - 01:00 PM",
                "01:00 PM - 02:00 PM",
                "02:00 PM - 03:00 PM",
                "03:00 PM - 04:00 PM",
                "04:00 PM - 05:00 PM",
                "05:00 PM - 06:00 PM",
                "06:00 PM - 07:00 PM",
                "07:00 PM - 08:00 PM",
                "08:00 PM - 09:00 PM",
                "09:00 PM - 10:00 PM"
            ],
            required: true,
        },
        availableModes: {
            type: [String],
            enum: ["online", "in-person"],
            required: true,
            validate: {
                validator: function (value) {
                    return value && value.length > 0;
                },
                message: "At least one mode must be selected",
            },
        },
        capacity: {
            type: Number,
            default: 1,
            min: 1,
        },
        bookedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        isBooked: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AvailabilitySlot", availabilitySlotSchema);
