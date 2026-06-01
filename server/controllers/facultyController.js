const Appointment = require("../models/Appointment");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const User = require("../models/User");
const {
    getAppointmentTimestamp,
    parseAppointmentDateValue,
    syncPastAppointmentStatuses,
} = require("../utils/appointmentSchedule");

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
const profileFields = [
    "fullName",
    "profileImage",
    "displayName",
    "major",
    "building",
    "room",
    "phoneNumber",
    "contactEmail",
];
const forbiddenProfileUpdateFields = [
    "_id",
    "id",
    "email",
    "password",
    "role",
    "approvalStatus",
    "requestedRole",
];
const PHONE_VALIDATION_MESSAGE = "Phone number must be exactly 10 digits.";
const isValidOptionalPhoneNumber = (value) => !value || /^\d{10}$/.test(value);
const CONTACT_EMAIL_VALIDATION_MESSAGE = "Please enter a valid contact email.";
const isValidOptionalEmail = (value) =>
    !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const approvedFacultyDirectoryFilter = {
    role: "faculty",
    $or: [
        { approvalStatus: "approved" },
        { status: "approved" },
        { status: "accepted" },
        { requestStatus: "approved" },
        { accountStatus: "approved" },
        { isApproved: true },
        { approved: true },
    ],
};

const formatAppointmentDateLabel = (appointment) => {
    const parsedDate = parseAppointmentDateValue(appointment?.date);
    const timestamp = getAppointmentTimestamp(appointment);
    const appointmentDate =
        parsedDate || (timestamp > 0 ? new Date(timestamp) : null);

    if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) {
        return appointment?.date || "Not available";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    }).format(appointmentDate);
};

const getApprovedFacultyDirectory = async (req, res) => {
    try {
        const facultyMembers = await User.find(approvedFacultyDirectoryFilter).select(
            "_id role fullName displayName email profileImage major room building phoneNumber contactEmail approvalStatus"
        );

        res.status(200).json(facultyMembers);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyProfile = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can access this profile" });
        }

        const facultyProfile = await User.findById(req.user.id).select(
            "fullName email profileImage displayName major building room phoneNumber contactEmail"
        );

        if (!facultyProfile) {
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        res.status(200).json(facultyProfile);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateFacultyProfile = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can update this profile" });
        }

        const facultyProfile = await User.findById(req.user.id);

        if (!facultyProfile) {
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        const submittedFields = Object.keys(req.body || {});
        const containsForbiddenFields = submittedFields.some((field) =>
            forbiddenProfileUpdateFields.includes(field)
        );

        if (containsForbiddenFields) {
            return res.status(400).json({
                message: "Only safe profile fields can be updated from this page.",
            });
        }

        let hasInvalidPhoneNumber = false;
        let hasInvalidContactEmail = false;

        profileFields.forEach((field) => {
            if (!(field in req.body)) {
                return;
            }

            const nextValue =
                typeof req.body[field] === "string" ? req.body[field].trim() : "";

            if (field === "phoneNumber") {
                if (nextValue && !isValidOptionalPhoneNumber(nextValue)) {
                    hasInvalidPhoneNumber = true;
                    return;
                }

                facultyProfile.phoneNumber = nextValue;
                return;
            }

            if (field === "contactEmail") {
                if (nextValue && !isValidOptionalEmail(nextValue)) {
                    hasInvalidContactEmail = true;
                    return;
                }

                facultyProfile.contactEmail = nextValue.toLowerCase();
                return;
            }

            facultyProfile[field] = nextValue;
        });

        if (hasInvalidPhoneNumber) {
            return res.status(400).json({ message: PHONE_VALIDATION_MESSAGE });
        }

        if (hasInvalidContactEmail) {
            return res.status(400).json({ message: CONTACT_EMAIL_VALIDATION_MESSAGE });
        }

        if (!facultyProfile.fullName) {
            return res.status(400).json({ message: "Full name is required." });
        }

        const updatedProfile = await facultyProfile.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                fullName: updatedProfile.fullName,
                email: updatedProfile.email,
                profileImage: updatedProfile.profileImage,
                displayName: updatedProfile.displayName,
                major: updatedProfile.major,
                building: updatedProfile.building,
                room: updatedProfile.room,
                phoneNumber: updatedProfile.phoneNumber,
                contactEmail: updatedProfile.contactEmail,
            },
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyAppointments = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can view these appointments" });
        }

        const facultyId = req.user.id;

        await syncPastAppointmentStatuses({ faculty: facultyId });

        const appointments = await Appointment.find({ faculty: facultyId })
            .populate(
                "student",
                "fullName email contactEmail major phoneNumber profileImage"
            )
            .populate("faculty", "fullName email")
            .sort({ createdAt: -1 });

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyAvailabilitySlots = async (req, res) => {
    try {
        const facultyId = req.user.id;

        await syncPastAppointmentStatuses({ faculty: facultyId });

        const slots = await AvailabilitySlot.find({ faculty: facultyId }).sort({
            day: 1,
            period: 1,
        });

        res.status(200).json(slots);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const createAvailabilitySlot = async (req, res) => {
    try {
        const facultyId = req.user.id;
        const { days, periods, availableModes } = req.body;

        if (
            !Array.isArray(days) ||
            days.length === 0 ||
            !Array.isArray(periods) ||
            periods.length === 0 ||
            !Array.isArray(availableModes) ||
            availableModes.length === 0
        ) {
            return res.status(400).json({ message: "Please fill all required fields" });
        }

        if (
            days.some((day) => !validDays.includes(day)) ||
            periods.some((period) => !validPeriods.includes(period)) ||
            availableModes.some((mode) => !validModes.includes(mode))
        ) {
            return res.status(400).json({ message: "Invalid availability data provided" });
        }

        const uniqueDays = [...new Set(days)];
        const uniquePeriods = [...new Set(periods)];
        const createdSlots = [];
        const skippedSlots = [];

        for (const day of uniqueDays) {
            for (const period of uniquePeriods) {
                const existingSlot = await AvailabilitySlot.findOne({
                    faculty: facultyId,
                    day,
                    period,
                });

                if (existingSlot) {
                    skippedSlots.push({ day, period });
                    continue;
                }

                const newSlot = await AvailabilitySlot.create({
                    slotId: `SLOT-${facultyId}-${day.toUpperCase()}-${period.replace(/[^A-Z0-9]/gi, "")}`,
                    faculty: facultyId,
                    day,
                    period,
                    availableModes,
                    isBooked: false,
                    capacity: 1,
                    bookedCount: 0,
                });

                createdSlots.push(newSlot);
            }
        }

        res.status(201).json({
            message: `Availability updated. ${createdSlots.length} slot(s) created and ${skippedSlots.length} duplicate slot(s) skipped.`,
            createdSlots,
            skippedSlots,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyStudents = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can view these students" });
        }

        const facultyId = req.user.id;

        await syncPastAppointmentStatuses({ faculty: facultyId });

        const appointments = await Appointment.find({ faculty: facultyId })
            .populate("student", "fullName email contactEmail major")
            .select("student date time createdAt")
            .lean();

        const studentsById = new Map();

        appointments.forEach((appointment) => {
            const student = appointment?.student;
            const studentId = student?._id ? String(student._id) : "";

            if (!studentId) {
                return;
            }

            const appointmentTimestamp = getAppointmentTimestamp(appointment);
            const existingStudent = studentsById.get(studentId);

            if (!existingStudent) {
                studentsById.set(studentId, {
                    _id: studentId,
                    name: student.fullName || "Unknown Student",
                    email: student.email || "",
                    contactEmail: student.contactEmail || "",
                    course: student.major || "",
                    appointmentCount: 1,
                    lastAppointmentDate: formatAppointmentDateLabel(appointment),
                    lastAppointmentTimestamp: appointmentTimestamp,
                });
                return;
            }

            existingStudent.appointmentCount += 1;

            if (appointmentTimestamp > existingStudent.lastAppointmentTimestamp) {
                existingStudent.lastAppointmentTimestamp = appointmentTimestamp;
                existingStudent.lastAppointmentDate = formatAppointmentDateLabel(appointment);
            }
        });

        const students = [...studentsById.values()]
            .sort((firstStudent, secondStudent) => {
                if (
                    firstStudent.lastAppointmentTimestamp !==
                    secondStudent.lastAppointmentTimestamp
                ) {
                    return (
                        secondStudent.lastAppointmentTimestamp -
                        firstStudent.lastAppointmentTimestamp
                    );
                }

                return firstStudent.name.localeCompare(secondStudent.name);
            })
            .map(({ lastAppointmentTimestamp, ...student }) => student);

        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteAvailabilitySlot = async (req, res) => {
    try {
        const facultyId = req.user.id;

        const deletedSlot = await AvailabilitySlot.findOneAndDelete({
            faculty: facultyId,
            _id: req.params.id,
        });

        if (!deletedSlot) {
            return res.status(404).json({ message: "Availability slot not found" });
        }

        res.status(200).json({ message: "Availability slot deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateAvailabilitySlot = async (req, res) => {
    try {
        const facultyId = req.user.id;
        const { period, availableModes, capacity } = req.body;

        if (!period || !Array.isArray(availableModes) || availableModes.length === 0) {
            return res.status(400).json({ message: "Please fill all required fields" });
        }

        if (!validPeriods.includes(period) || availableModes.some((mode) => !validModes.includes(mode))) {
            return res.status(400).json({ message: "Invalid availability data provided" });
        }

        const existingSlot = await AvailabilitySlot.findOne({
            faculty: facultyId,
            _id: req.params.id,
        });

        if (!existingSlot) {
            return res.status(404).json({ message: "Availability slot not found" });
        }

        const duplicateSlot = await AvailabilitySlot.findOne({
            faculty: facultyId,
            day: existingSlot.day,
            period,
            _id: { $ne: req.params.id },
        });

        if (duplicateSlot) {
            return res.status(400).json({
                message: "A slot with the same day and period already exists",
            });
        }

        if (capacity !== undefined) {
            const capacityNum = parseInt(capacity, 10);

            if (!Number.isInteger(capacityNum) || capacityNum < 1) {
                return res.status(400).json({ message: "Capacity must be a positive integer" });
            }

            if (capacityNum < existingSlot.bookedCount) {
                return res.status(400).json({
                    message: `Cannot set capacity to ${capacityNum} because ${existingSlot.bookedCount} seat(s) are already booked.`,
                });
            }

            existingSlot.capacity = capacityNum;
            existingSlot.isBooked = existingSlot.bookedCount >= capacityNum;
        }

        existingSlot.period = period;
        existingSlot.availableModes = availableModes;

        const updatedSlot = await existingSlot.save();

        res.status(200).json({
            message: "Availability slot updated successfully",
            slot: updatedSlot,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateDayCapacity = async (req, res) => {
    try {
        const facultyId = req.user.id;
        const day = req.params.day;

        if (!validDays.includes(day)) {
            return res.status(400).json({ message: "Invalid day provided" });
        }

        const { capacity } = req.body;
        const capacityNum = parseInt(capacity, 10);

        if (!Number.isInteger(capacityNum) || capacityNum < 1) {
            return res.status(400).json({ message: "Capacity must be a positive integer" });
        }

        const slots = await AvailabilitySlot.find({ faculty: facultyId, day });

        if (slots.length === 0) {
            return res.status(200).json({
                message: `No slots found for ${day}.`,
                updatedCount: 0,
                skippedCount: 0,
            });
        }

        let updatedCount = 0;
        let skippedCount = 0;

        for (const slot of slots) {
            if (slot.bookedCount > capacityNum) {
                skippedCount++;
                continue;
            }

            slot.capacity = capacityNum;
            slot.isBooked = slot.bookedCount >= capacityNum;
            await slot.save();
            updatedCount++;
        }

        return res.status(200).json({
            message: `Updated ${updatedCount} slot(s) on ${day}. ${skippedCount > 0 ? `${skippedCount} slot(s) skipped because their current bookings exceed the requested capacity.` : ""}`.trim(),
            updatedCount,
            skippedCount,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteAvailabilitySlotsByDay = async (req, res) => {
    try {
        const facultyId = req.user.id;

        if (!validDays.includes(req.params.day)) {
            return res.status(400).json({ message: "Invalid day provided" });
        }

        const result = await AvailabilitySlot.deleteMany({
            faculty: facultyId,
            day: req.params.day,
        });

        res.status(200).json({
            message: `${result.deletedCount} availability slot(s) deleted for ${req.params.day}`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteAllAvailabilitySlots = async (req, res) => {
    try {
        const facultyId = req.user.id;

        const result = await AvailabilitySlot.deleteMany({ faculty: facultyId });

        res.status(200).json({
            message: `${result.deletedCount} availability slot(s) deleted successfully`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getApprovedFacultyDirectory,
    getFacultyProfile,
    updateFacultyProfile,
    getFacultyAppointments,
    getFacultyStudents,
    getFacultyAvailabilitySlots,
    createAvailabilitySlot,
    deleteAvailabilitySlot,
    updateAvailabilitySlot,
    updateDayCapacity,
    deleteAvailabilitySlotsByDay,
    deleteAllAvailabilitySlots,
};
