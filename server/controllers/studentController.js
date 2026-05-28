const mongoose = require("mongoose");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const Appointment = require("../models/Appointment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { syncPastAppointmentStatuses } = require("../utils/appointmentSchedule");

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

const getStartOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getSlotOccurrenceDate = (slot, now = new Date()) => {
    const currentDate = now instanceof Date ? now : new Date(now);
    const slotDayIndex = validDays.indexOf(slot?.day);

    if (slotDayIndex === -1) {
        return null;
    }

    const today = getStartOfDay(currentDate);
    const dayOffset = (slotDayIndex - today.getDay() + 7) % 7;
    const occurrenceDate = new Date(today);

    occurrenceDate.setDate(today.getDate() + dayOffset);

    return occurrenceDate;
};

const getSlotStartTimestamp = (slot, now = new Date()) => {
    const slotDate = getSlotOccurrenceDate(slot, now);
    const startMinutes = parseSlotStartMinutes(slot?.period);

    if (!slotDate || startMinutes === null) {
        return null;
    }

    return new Date(
        slotDate.getFullYear(),
        slotDate.getMonth(),
        slotDate.getDate(),
        Math.floor(startMinutes / 60),
        startMinutes % 60
    ).getTime();
};

const isStudentBookableSlot = (slot, now = new Date()) => {
    if (!slot || slot.isBooked) {
        return false;
    }

    const slotStartTimestamp = getSlotStartTimestamp(slot, now);

    if (slotStartTimestamp === null) {
        return false;
    }

    return slotStartTimestamp >= new Date(now).getTime();
};

const formatSlotAppointmentDate = (slot, now = new Date()) => {
    const slotDate = getSlotOccurrenceDate(slot, now);

    if (!slotDate) {
        return "";
    }

    return slotDate.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    });
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

        await syncPastAppointmentStatuses({ faculty: req.params.facultyId });

        const slots = await AvailabilitySlot.find({
            faculty: req.params.facultyId,
            isBooked: false,
        });

        const now = new Date();
        const sortedSlots = slots
            .filter((slot) => isStudentBookableSlot(slot, now))
            .sort((a, b) => {
                const firstTimestamp = getSlotStartTimestamp(a, now) || 0;
                const secondTimestamp = getSlotStartTimestamp(b, now) || 0;

                if (firstTimestamp !== secondTimestamp) {
                    return firstTimestamp - secondTimestamp;
                }

                return String(a._id).localeCompare(String(b._id));
            });

        res.status(200).json(sortedSlots);
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
        const missingFields = getMissingBookingFields({
            facultyId,
            slotId,
            date,
            time,
            mode,
            topic,
        });

        if (missingFields.length > 0) {
            return res.status(400).json({
                message: `Missing required booking field${
                    missingFields.length === 1 ? "" : "s"
                }: ${missingFields.join(", ")}`,
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

        await syncPastAppointmentStatuses({ faculty: facultyId });

        const slotLookupFilter = {
            faculty: facultyId,
            $or: [{ slotId }],
        };

        if (mongoose.Types.ObjectId.isValid(slotId)) {
            slotLookupFilter.$or.unshift({ _id: slotId });
        }

        const slot = await AvailabilitySlot.findOne(slotLookupFilter);

        if (!slot) {
            return res.status(404).json({ message: "Selected slot was not found" });
        }

        if (slot.isBooked) {
            return res.status(400).json({
                message: "Selected slot is already booked. Please choose another time.",
            });
        }

        if (!isStudentBookableSlot(slot)) {
            return res.status(400).json({
                message: "Selected slot has expired. Please choose another time.",
            });
        }

        if (!Array.isArray(slot.availableModes) || !slot.availableModes.includes(mode)) {
            return res.status(400).json({
                message: "Selected meeting mode is not available for this slot.",
            });
        }

        const expectedDate = formatSlotAppointmentDate(slot);

        if (!expectedDate || expectedDate !== date) {
            return res.status(400).json({
                message: "Selected date does not match the chosen slot.",
            });
        }

        if (slot.period !== time) {
            return res.status(400).json({
                message: "Selected time does not match the chosen slot.",
            });
        }

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

        const bookedSlot = await AvailabilitySlot.findOneAndUpdate(
            {
                _id: slot._id,
                isBooked: false,
            },
            {
                $set: {
                    isBooked: true,
                },
            },
            { new: true }
        );

        if (!bookedSlot) {
            await Appointment.findByIdAndDelete(appointment._id);

            return res.status(409).json({
                message: "Selected slot is no longer available. Please choose another time.",
            });
        }

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
        } catch (error) {
            console.error("Failed to create faculty notification", error);
        }

        const populatedAppointment = await Appointment.findById(appointment._id)
            .populate("student", "fullName email")
            .populate("faculty", "fullName email")
            .populate("slot", "slotId day period availableModes isBooked");

        res.status(201).json({
            message: "Appointment request submitted successfully.",
            appointment: populatedAppointment,
        });
    } catch (error) {
        console.error("Book appointment error:", error);
        res.status(500).json({
            message: error.message || "Server error",
        });
    }
};

module.exports = {
    getApprovedFaculty,
    getFacultyAvailabilityForStudents,
    bookAppointment,
    createStudentAppointment: bookAppointment,
};
