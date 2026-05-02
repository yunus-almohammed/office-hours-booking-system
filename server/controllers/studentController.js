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

const validPeriods = [
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
    "09:00 PM - 10:00 PM",
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

        const sortedSlots = slots.sort((a, b) => {
            const dayDifference = validDays.indexOf(a.day) - validDays.indexOf(b.day);

            if (dayDifference !== 0) {
                return dayDifference;
            }

            return validPeriods.indexOf(a.period) - validPeriods.indexOf(b.period);
        });

        res.status(200).json(sortedSlots);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const createStudentAppointment = async (req, res) => {
    try {
        if (req.user.role !== "student") {
            return res.status(403).json({ message: "Only students can book appointments" });
        }

        const { facultyId, day, date, slotId, mode, notes = "" } = req.body;

        if (!facultyId || !day || !date || !slotId || !mode) {
            return res.status(400).json({
                message: "Please select a faculty member, date, slot/time, and mode first.",
            });
        }

        if (!validDays.includes(day) || !validModes.includes(mode)) {
            return res.status(400).json({ message: "Invalid appointment details provided" });
        }

        const faculty = await User.findOne({
            ...approvedFacultyFilter,
            _id: facultyId,
        }).select("_id fullName displayName");

        if (!faculty) {
            return res.status(404).json({ message: "Faculty member not found" });
        }

        await syncPastAppointmentStatuses({ faculty: facultyId });

        const slot = await AvailabilitySlot.findOneAndUpdate(
            {
                _id: slotId,
                faculty: facultyId,
                day,
                period: { $in: validPeriods },
                availableModes: mode,
                isBooked: false,
            },
            {
                $set: {
                    isBooked: true,
                },
            },
            { new: true }
        );

        if (!slot) {
            return res.status(400).json({
                message: "Selected slot is no longer available. Please choose another time.",
            });
        }

        let appointment;

        try {
            appointment = await Appointment.create({
                appointmentId: generateAppointmentId(),
                student: req.user._id,
                faculty: facultyId,
                slot: slot._id,
                date,
                time: slot.period,
                mode,
                notes: typeof notes === "string" ? notes.trim() : "",
            });
        } catch (error) {
            await AvailabilitySlot.findByIdAndUpdate(slot._id, {
                $set: {
                    isBooked: false,
                },
            });

            throw error;
        }

        try {
            await Notification.create({
                recipientRole: "faculty",
                recipient: facultyId,
                sender: req.user._id,
                type: "appointment_booked",
                title: "New appointment request",
                message: `${req.user.fullName} requested ${date} at ${slot.period} (${formatModeLabel(mode)}).`,
                appointment: appointment._id,
            });
        } catch (error) {
            console.error("Failed to create faculty notification", error);
        }

        const populatedAppointment = await Appointment.findById(appointment._id)
            .populate("student", "fullName email")
            .populate("faculty", "fullName email");

        res.status(201).json({
            message: "Appointment request submitted successfully.",
            appointment: populatedAppointment,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getApprovedFaculty,
    getFacultyAvailabilityForStudents,
    createStudentAppointment,
};
