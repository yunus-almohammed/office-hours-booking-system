const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const AvailabilitySlot = require("../models/AvailabilitySlot");
const Appointment = require("../models/Appointment");

const requireEnvironmentVariable = (name) => {
    if (!process.env[name]) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return process.env[name];
};

const recomputeSlotSeats = async () => {
    const mongoUri = requireEnvironmentVariable("MONGO_URI");
    await mongoose.connect(mongoUri);

    const slots = await AvailabilitySlot.find({});
    console.log(`Found ${slots.length} slot(s) to process.`);

    let updatedCount = 0;

    for (const slot of slots) {
        const activeBookings = await Appointment.countDocuments({
            slot: slot._id,
            status: { $in: ["pending", "approved"] },
        });

        const capacity = (typeof slot.capacity === "number" && slot.capacity >= 1)
            ? slot.capacity
            : Math.max(1, activeBookings);

        const bookedCount = activeBookings;
        const isBooked = bookedCount >= capacity;

        const changed =
            slot.bookedCount !== bookedCount ||
            slot.capacity !== capacity ||
            slot.isBooked !== isBooked;

        if (changed) {
            slot.bookedCount = bookedCount;
            slot.capacity = capacity;
            slot.isBooked = isBooked;
            await slot.save();
            updatedCount++;
        }
    }

    console.log(`Done. ${updatedCount} slot(s) updated, ${slots.length - updatedCount} already correct.`);
};

recomputeSlotSeats()
    .catch((error) => {
        console.error("Failed to recompute slot seats:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
