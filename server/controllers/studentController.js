const mongoose = require("mongoose");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const Appointment = require("../models/Appointment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { syncPastAppointmentStatuses } = require("../utils/appointmentSchedule");

const MAX_WEEKS_AHEAD = 8;

const validDays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const validModes = ["online", "in-person"];

const formatModeLabel = (mode) =>
    mode === "in-person" ? "In-person" : mode === "online" ? "Online" : mode;

const approvedFacultyFilter = {
    role: "faculty",
    $or: [
        { approvalStatus: "approved" },
        { status: "approved" },
        { accountStatus: "approved" },
        { isApproved: true },
        { approved: true },
    ],
};

const generateAppointmentId = () =>
    `APPT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const getMissingBookingFields = ({ facultyId, slotId, date, time, mode, topic }) =>
    [
        ["facultyId", facultyId],
        ["slotId", slotId],
        ["date", date],
        ["time", time],
        ["mode", mode],
        ["topic", topic],
    ]
        .filter(([, value]) => !value)
        .map(([fieldName]) => fieldName);

const parseSlotStartMinutes = (periodValue) => {
    const startText =
        typeof periodValue === "string" ? periodValue.split("-")[0].trim() : "";
    const timeMatch = startText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!timeMatch) {
        return null;
    }

    const [, hourText, minuteText, meridiem] = timeMatch;
    let hours = Number(hourText) % 12;

    if (meridiem.toUpperCase() === "PM") {
        hours += 12;
    }

    return hours * 60 + Number(minuteText);
};

// "Jun 01, 2026" format — the canonical label stored in appt.date
const formatDateLabel = (date) =>
    date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    });

// "YYYY-MM-DD" for tab value / sorting
const formatDateValue = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

// Occurrence date for a slot on a given week offset (0 = nearest upcoming day)
const getOccurrenceDate = (dayIndex, weekOffset, now = new Date()) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const baseDayOffset = (dayIndex - today.getDay() + 7) % 7;
    const totalDayOffset = baseDayOffset + weekOffset * 7;
    const result = new Date(today);
    result.setDate(today.getDate() + totalDayOffset);
    return result;
};

// Start timestamp for a slot on a specific date
const getSlotStartTimestampForDate = (slot, date) => {
    const startMinutes = parseSlotStartMinutes(slot.period);
    if (startMinutes === null) return null;
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(startMinutes / 60),
        startMinutes % 60
    ).getTime();
};

// Parse "Jun 01, 2026" or "YYYY-MM-DD" into a local Date, return null on failure
const parseDateLabel = (raw) => {
    if (!raw) return null;
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    // "Jun 01, 2026"
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const getApprovedFaculty = async (req, res) => {
    try {
        const facultyMembers = await User.find(approvedFacultyFilter).select(
            "_id role fullName displayName email contactEmail major building room phoneNumber profileImage approvalStatus"
        );

        res.status(200).json(facultyMembers);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyAvailabilityForStudents = async (req, res) => {
    try {
        const faculty = await User.findOne({
            ...approvedFacultyFilter,
            _id: req.params.facultyId,
        }).select("_id");

        if (!faculty) {
            return res.status(404).json({ message: "Faculty member not found" });
        }

        const slots = await AvailabilitySlot.find({ faculty: req.params.facultyId });

        if (slots.length === 0) {
            return res.status(200).json([]);
        }

        // Load all active (pending/approved) appointments for these slots
        const slotIds = slots.map((s) => s._id);
        const activeAppointments = await Appointment.find({
            slot: { $in: slotIds },
            status: { $in: ["pending", "approved"] },
        }).select("slot date");

        // Build taken-count map: key = "<slotId>::<dateLabel>"
        const takenCountMap = new Map();
        for (const appt of activeAppointments) {
            const key = `${String(appt.slot)}::${appt.date}`;
            takenCountMap.set(key, (takenCountMap.get(key) || 0) + 1);
        }

        const now = new Date();

        // Group slots by weekday
        const slotsByDay = new Map();
        for (const slot of slots) {
            if (!slotsByDay.has(slot.day)) slotsByDay.set(slot.day, []);
            slotsByDay.get(slot.day).push(slot);
        }

        const result = [];

        for (const [day, daySlots] of slotsByDay.entries()) {
            const dayIndex = validDays.indexOf(day);
            if (dayIndex === -1) continue;

            // Find earliest week where at least one slot of this day is bookable
            let chosenDate = null;

            for (let weekOffset = 0; weekOffset <= MAX_WEEKS_AHEAD; weekOffset++) {
                const candidateDate = getOccurrenceDate(dayIndex, weekOffset, now);
                const dateLabel = formatDateLabel(candidateDate);

                const hasBookable = daySlots.some((slot) => {
                    const slotTs = getSlotStartTimestampForDate(slot, candidateDate);
                    if (slotTs === null || slotTs < now.getTime()) return false;

                    const capacity = Number(slot.capacity) || 1;
                    const taken = takenCountMap.get(`${String(slot._id)}::${dateLabel}`) || 0;
                    return taken < capacity;
                });

                if (hasBookable) {
                    chosenDate = candidateDate;
                    break;
                }
            }

            if (!chosenDate) continue; // No bookable occurrence within horizon

            const occurrenceDate = formatDateLabel(chosenDate);
            const occurrenceValue = formatDateValue(chosenDate);

            for (const slot of daySlots) {
                const slotTs = getSlotStartTimestampForDate(slot, chosenDate);
                if (slotTs === null) continue;

                const capacity = Number(slot.capacity) || 1;
                const taken = takenCountMap.get(`${String(slot._id)}::${occurrenceDate}`) || 0;
                const seatsRemaining = Math.max(0, capacity - taken);
                const bookable = slotTs >= now.getTime() && seatsRemaining > 0;

                if (!bookable) continue;

                result.push({
                    ...slot.toObject(),
                    occurrenceDate,
                    occurrenceValue,
                    seatsRemaining,
                    bookable: true,
                });
            }
        }

        // Sort by occurrenceValue (ascending), then slot start time
        result.sort((a, b) => {
            if (a.occurrenceValue !== b.occurrenceValue) {
                return a.occurrenceValue.localeCompare(b.occurrenceValue);
            }
            return (parseSlotStartMinutes(a.period) || 0) - (parseSlotStartMinutes(b.period) || 0);
        });

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const bookAppointment = async (req, res) => {
    try {
        const studentId = req.user?.id;

        if (req.user?.role !== "student" || !studentId) {
            return res.status(403).json({ message: "Only students can book appointments" });
        }

        const student = await User.findOne({
            _id: studentId,
            role: "student",
        }).select("_id fullName");

        if (!student) {
            return res.status(404).json({ message: "Student account not found" });
        }

        const {
            facultyId: rawFacultyId,
            slotId: rawSlotId,
            date: rawDate,
            time: rawTime,
            mode: rawMode,
            topic: rawTopic = "",
            description: rawDescription = "",
        } = req.body || {};

        const facultyId = String(rawFacultyId || "").trim();
        const slotId = String(rawSlotId || "").trim();
        const date = String(rawDate || "").trim();
        const time = String(rawTime || "").trim();
        const mode = String(rawMode || "").trim();
        const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
        const description = typeof rawDescription === "string" ? rawDescription.trim() : "";

        const missingFields = getMissingBookingFields({ facultyId, slotId, date, time, mode, topic });

        if (missingFields.length > 0) {
            return res.status(400).json({
                message: `Missing required booking field${missingFields.length === 1 ? "" : "s"}: ${missingFields.join(", ")}`,
            });
        }

        if (!validModes.includes(mode)) {
            return res.status(400).json({ message: "Invalid appointment mode selected" });
        }

        const faculty = await User.findOne({
            ...approvedFacultyFilter,
            _id: facultyId,
        }).select("_id fullName displayName");

        if (!faculty) {
            return res.status(404).json({ message: "Faculty member not found" });
        }

        // Look up slot
        const slotLookupFilter = { faculty: facultyId, $or: [{ slotId }] };
        if (mongoose.Types.ObjectId.isValid(slotId)) {
            slotLookupFilter.$or.unshift({ _id: slotId });
        }

        const slot = await AvailabilitySlot.findOne(slotLookupFilter);

        if (!slot) {
            return res.status(404).json({ message: "Selected slot was not found" });
        }

        // Validate submitted mode
        if (!Array.isArray(slot.availableModes) || !slot.availableModes.includes(mode)) {
            return res.status(400).json({ message: "Selected meeting mode is not available for this slot." });
        }

        // Validate submitted time matches slot period
        if (slot.period !== time) {
            return res.status(400).json({ message: "Selected time does not match the chosen slot." });
        }

        // Parse and validate the submitted date
        const parsedDate = parseDateLabel(date);

        if (!parsedDate) {
            return res.status(400).json({ message: "Invalid date submitted." });
        }

        // Submitted date's weekday must match slot's weekday
        const submittedWeekday = validDays[parsedDate.getDay()];
        if (submittedWeekday !== slot.day) {
            return res.status(400).json({ message: "Selected date does not match the slot's weekday." });
        }

        const now = new Date();

        // Slot start time on the submitted date must be in the future
        const slotTs = getSlotStartTimestampForDate(slot, parsedDate);
        if (slotTs === null || slotTs < now.getTime()) {
            return res.status(400).json({ message: "Selected slot has expired. Please choose another time." });
        }

        // Must be within MAX_WEEKS_AHEAD
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + MAX_WEEKS_AHEAD * 7);
        if (parsedDate > maxDate) {
            return res.status(400).json({ message: "Selected date is too far in the future." });
        }

        // Per-date seat check: count active appointments for this slot+date
        const capacity = Number(slot.capacity) || 1;
        const taken = await Appointment.countDocuments({
            slot: slot._id,
            date,
            status: { $in: ["pending", "approved"] },
        });

        if (taken >= capacity) {
            return res.status(409).json({
                message: "This slot is fully booked for the selected date. Please choose another time.",
            });
        }

        // Create the appointment
        const appointment = await Appointment.create({
            appointmentId: generateAppointmentId(),
            student: student._id,
            faculty: faculty._id,
            slot: slot._id,
            date,
            time,
            mode,
            topic,
            description,
            status: "pending",
        });

        try {
            await Notification.create({
                recipientRole: "faculty",
                recipient: faculty._id,
                sender: student._id,
                type: "appointment_booked",
                title: "New appointment request",
                message: `${student.fullName} requested ${date} at ${time} (${formatModeLabel(mode)}).`,
                appointment: appointment._id,
            });
        } catch (notifError) {
            console.error("Failed to create faculty notification", notifError);
        }

        const populatedAppointment = await Appointment.findById(appointment._id)
            .populate("student", "fullName email")
            .populate("faculty", "fullName email")
            .populate("slot", "slotId day period availableModes capacity");

        res.status(201).json({
            message: "Appointment request submitted successfully.",
            appointment: populatedAppointment,
        });
    } catch (error) {
        console.error("Book appointment error:", error);
        res.status(500).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    getApprovedFaculty,
    getFacultyAvailabilityForStudents,
    bookAppointment,
    createStudentAppointment: bookAppointment,
};
