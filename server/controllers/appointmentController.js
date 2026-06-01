const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
    APPOINTMENT_STATUSES,
    getAppointmentTimestamp,
    releaseSlotSeat,
    syncPastAppointmentStatuses,
} = require("../utils/appointmentSchedule");

const appointmentPopulate = (query) =>
    query
        .populate(
            "student",
            "fullName email contactEmail major phoneNumber profileImage"
        )
        .populate(
            "faculty",
            "fullName email displayName profileImage major room building phoneNumber contactEmail"
        )
        .populate("slot", "day period availableModes isBooked capacity bookedCount");

const isAdmin = (req) => req.user?.role === "admin";
const isFaculty = (req) => req.user?.role === "faculty";
const isStudent = (req) => req.user?.role === "student";
const approvableFacultyStatuses = [
    APPOINTMENT_STATUSES.pending,
    APPOINTMENT_STATUSES.rejected,
];
const rejectableFacultyStatuses = [
    APPOINTMENT_STATUSES.pending,
    APPOINTMENT_STATUSES.approved,
];
const pendingFacultyStatuses = [APPOINTMENT_STATUSES.pending];

const ensureAdmin = (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ message: "Only admins can access this resource" });
        return false;
    }

    return true;
};

const ensureFaculty = (req, res) => {
    if (!isFaculty(req)) {
        res.status(403).json({ message: "Only faculty can access this resource" });
        return false;
    }

    return true;
};

const ensureStudent = (req, res) => {
    if (!isStudent(req)) {
        res.status(403).json({ message: "Only students can access this resource" });
        return false;
    }

    return true;
};

const canManageAppointment = (req, appointment) =>
    isAdmin(req) ||
    (isFaculty(req) && appointment.faculty?._id?.toString() === req.user.id);

const canCancelOrReschedule = (req, appointment) =>
    isAdmin(req) ||
    (isFaculty(req) && appointment.faculty?._id?.toString() === req.user.id) ||
    (isStudent(req) && appointment.student?._id?.toString() === req.user.id);

const syncAppointmentSlot = async (appointment, nextStatus) => {
    if (!appointment.slot?._id) {
        return null;
    }

    const slot = await AvailabilitySlot.findById(appointment.slot._id);

    if (!slot) {
        return null;
    }

    if (nextStatus === "approved") {
        if (appointment.status === "rejected") {
            // Re-approving a rejected appointment: need to atomically reclaim a seat
            const updatedSlot = await AvailabilitySlot.findOneAndUpdate(
                { _id: slot._id, $expr: { $lt: ["$bookedCount", "$capacity"] } },
                { $inc: { bookedCount: 1 } },
                { new: true }
            );

            if (!updatedSlot) {
                const error = new Error("This appointment slot has already been booked again.");
                error.statusCode = 409;
                throw error;
            }

            updatedSlot.isBooked = updatedSlot.bookedCount >= updatedSlot.capacity;
            await updatedSlot.save();
            return updatedSlot;
        }

        // pending -> approved: seat was taken at booking, just recompute isBooked
        slot.isBooked = slot.bookedCount >= slot.capacity;
        await slot.save();
    }

    if (nextStatus === "rejected") {
        // Free the seat
        slot.bookedCount = Math.max(0, (slot.bookedCount || 0) - 1);
        slot.isBooked = slot.bookedCount >= slot.capacity;
        await slot.save();
    }

    return slot;
};

const normalizeAppointmentIds = (appointmentIds) =>
    Array.isArray(appointmentIds)
        ? [
            ...new Set(
                appointmentIds
                    .filter((appointmentId) => typeof appointmentId === "string")
                    .map((appointmentId) => appointmentId.trim())
                    .filter((appointmentId) => mongoose.Types.ObjectId.isValid(appointmentId))
            ),
        ]
        : [];

const getBulkStatusMessage = (nextStatus, updatedCount, skippedCount = 0) => {
    if (updatedCount === 0 && skippedCount === 0) {
        return "No appointments matched the request.";
    }

    const actionLabel = nextStatus === "approved" ? "approved" : "rejected";
    let message = `${updatedCount} appointment(s) ${actionLabel} successfully.`;

    if (skippedCount > 0) {
        message += ` ${skippedCount} appointment(s) could not be updated.`;
    }

    return message;
};

const sortAppointmentsByDateAndTime = (appointments) =>
    [...appointments].sort((firstAppointment, secondAppointment) => {
        const firstTimestamp = getAppointmentTimestamp(firstAppointment);
        const secondTimestamp = getAppointmentTimestamp(secondAppointment);

        if (firstTimestamp !== secondTimestamp) {
            return firstTimestamp - secondTimestamp;
        }

        return (firstAppointment.appointmentId || firstAppointment._id || "").localeCompare(
            secondAppointment.appointmentId || secondAppointment._id || ""
        );
    });

const getFacultyDisplayName = (faculty, fallbackUser = null) =>
    faculty?.fullName?.trim?.() ||
    faculty?.displayName?.trim?.() ||
    fallbackUser?.fullName?.trim?.() ||
    fallbackUser?.displayName?.trim?.() ||
    faculty?.email ||
    fallbackUser?.email ||
    "Faculty Member";

const buildStudentAppointmentStatusNotification = ({
    appointment,
    nextStatus,
    sender,
}) => {
    const studentId = appointment?.student?._id || appointment?.student;

    if (!studentId) {
        return null;
    }

    const actionLabel = nextStatus === "approved" ? "accepted" : "rejected";

    return {
        recipientRole: "student",
        recipient: studentId,
        sender: sender?._id || sender?.id || sender || null,
        type: "appointment_status",
        title: nextStatus === "approved" ? "Appointment accepted" : "Appointment rejected",
        message: `Your appointment with ${getFacultyDisplayName(
            appointment?.faculty,
            sender
        )} on ${appointment?.date || "the selected date"} at ${appointment?.time || "the selected time"} has been ${actionLabel}.`,
        appointment: appointment?._id || null,
    };
};

const notifyStudentsAboutAppointmentStatus = async ({
    appointments,
    nextStatus,
    sender,
}) => {
    const notifications = appointments
        .map((appointment) =>
            buildStudentAppointmentStatusNotification({
                appointment,
                nextStatus,
                sender,
            })
        )
        .filter(Boolean);

    if (notifications.length === 0) {
        return;
    }

    await Notification.insertMany(notifications);
};

const processFacultyAppointmentStatusBatch = async ({
    req,
    nextStatus,
    appointmentIds = null,
    matchAll = false,
    additionalFilter = {},
    allowedStatuses = null,
    successMessage = null,
}) => {
    const batchAllowedStatuses =
        allowedStatuses ||
        (nextStatus === APPOINTMENT_STATUSES.approved
            ? approvableFacultyStatuses
            : rejectableFacultyStatuses);

    await syncPastAppointmentStatuses({
        faculty: req.user.id,
        ...additionalFilter,
    });

    const filter = {
        faculty: req.user.id,
        ...additionalFilter,
        status: { $in: batchAllowedStatuses },
    };

    if (!matchAll) {
        const normalizedAppointmentIds = normalizeAppointmentIds(appointmentIds);

        if (normalizedAppointmentIds.length === 0) {
            return {
                statusCode: 400,
                payload: { message: "Please provide at least one appointment ID" },
            };
        }

        filter._id = { $in: normalizedAppointmentIds };
    }

    const appointments = await appointmentPopulate(Appointment.find(filter));
    const upcomingAppointments = appointments.filter(
        (appointment) => getAppointmentTimestamp(appointment) >= Date.now()
    );

    if (upcomingAppointments.length === 0) {
        return {
            statusCode: 200,
            payload: {
                message: "No appointments matched the request.",
                updatedCount: 0,
                approvedCount: 0,
                rejectedCount: 0,
                skippedCount: 0,
            },
        };
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const updatedAppointments = [];

    for (const appointment of upcomingAppointments) {
        try {
            await syncAppointmentSlot(appointment, nextStatus);
            appointment.status = nextStatus;
            await appointment.save();
            updatedCount += 1;
            updatedAppointments.push(appointment);
        } catch (error) {
            if (error.statusCode === 409) {
                skippedCount += 1;
                continue;
            }

            throw error;
        }
    }

    if (updatedAppointments.length > 0) {
        await notifyStudentsAboutAppointmentStatus({
            appointments: updatedAppointments,
            nextStatus,
            sender: req.user,
        });
    }

    return {
        statusCode: 200,
        payload: {
            message:
                successMessage ||
                getBulkStatusMessage(nextStatus, updatedCount, skippedCount),
            updatedCount,
            approvedCount: nextStatus === "approved" ? updatedCount : 0,
            rejectedCount: nextStatus === "rejected" ? updatedCount : 0,
            skippedCount,
        },
    };
};

const getAllAppointments = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses();

        const appointments = await appointmentPopulate(
            Appointment.find().sort({ createdAt: -1 })
        );

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getMyFacultyAppointments = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses({ faculty: req.user.id });

        const appointments = await appointmentPopulate(
            Appointment.find({ faculty: req.user.id }).sort({ createdAt: -1 })
        );

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getMyStudentAppointments = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses({ student: req.user.id });

        const appointments = await appointmentPopulate(
            Appointment.find({ student: req.user.id })
        );

        res.status(200).json(sortAppointmentsByDateAndTime(appointments));
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const approveManyFacultyAppointments = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        const result = await processFacultyAppointmentStatusBatch({
            req,
            nextStatus: "approved",
            appointmentIds: req.body?.appointmentIds,
        });

        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const rejectManyFacultyAppointments = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        const result = await processFacultyAppointmentStatusBatch({
            req,
            nextStatus: "rejected",
            appointmentIds: req.body?.appointmentIds,
        });

        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const approveAllFacultyAppointments = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        const result = await processFacultyAppointmentStatusBatch({
            req,
            nextStatus: "approved",
            matchAll: true,
        });

        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const rejectAllFacultyAppointments = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        const result = await processFacultyAppointmentStatusBatch({
            req,
            nextStatus: "rejected",
            matchAll: true,
        });

        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const updateAllPendingStudentAppointmentsForFaculty = async (
    req,
    res,
    nextStatus
) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        const studentId =
            typeof req.params.studentId === "string" ? req.params.studentId.trim() : "";

        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ message: "Invalid student ID" });
        }

        const result = await processFacultyAppointmentStatusBatch({
            req,
            nextStatus,
            matchAll: true,
            additionalFilter: { student: studentId },
            allowedStatuses: pendingFacultyStatuses,
            successMessage:
                nextStatus === APPOINTMENT_STATUSES.approved
                    ? "Pending appointments approved successfully."
                    : "Pending appointments rejected successfully.",
        });

        return res.status(result.statusCode).json(result.payload);
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const rejectFacultyAppointmentsByDay = async (req, res) => {
    try {
        if (!ensureFaculty(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses({ faculty: req.user.id });

        const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";

        if (!date) {
            return res.status(400).json({ message: "Please select a date" });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: "Invalid appointment date" });
        }

        const appointments = await Appointment.find({
            faculty: req.user.id,
            date,
            status: { $in: rejectableFacultyStatuses },
        }).select("_id slot");

        if (appointments.length === 0) {
            return res.status(200).json({
                message: "No appointments found for this day",
                rejectedCount: 0,
            });
        }

        const appointmentIds = appointments.map((appointment) => appointment._id);

        // Build per-slot release counts
        const slotReleaseCountMap = new Map();
        appointments.forEach((appt) => {
            if (appt.slot) {
                const slotId = String(appt.slot);
                slotReleaseCountMap.set(slotId, (slotReleaseCountMap.get(slotId) || 0) + 1);
            }
        });

        const result = await Appointment.updateMany(
            { _id: { $in: appointmentIds } },
            { $set: { status: APPOINTMENT_STATUSES.rejected } }
        );

        for (const [slotId, count] of slotReleaseCountMap.entries()) {
            const slot = await AvailabilitySlot.findById(slotId);
            if (!slot) continue;
            slot.bookedCount = Math.max(0, (slot.bookedCount || 0) - count);
            slot.isBooked = slot.bookedCount >= slot.capacity;
            await slot.save();
        }

        return res.status(200).json({
            message: "Appointments for this day rejected successfully",
            rejectedCount: result.modifiedCount,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};

const updateAppointmentStatus = async (req, res, nextStatus) => {
    try {
        await syncPastAppointmentStatuses({ _id: req.params.id });

        const appointment = await appointmentPopulate(Appointment.findById(req.params.id));

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        if (!canManageAppointment(req, appointment)) {
            return res.status(403).json({
                message: "You are not allowed to manage this appointment",
            });
        }

        const allowedStatuses =
            nextStatus === APPOINTMENT_STATUSES.approved
                ? approvableFacultyStatuses
                : rejectableFacultyStatuses;

        if (!allowedStatuses.includes(appointment.status)) {
            return res.status(400).json({
                message:
                    "This appointment can no longer be updated because its current status is final.",
            });
        }

        if (getAppointmentTimestamp(appointment) < Date.now()) {
            return res.status(400).json({
                message: "Past appointments can no longer be updated.",
            });
        }

        await syncAppointmentSlot(appointment, nextStatus);

        appointment.status = nextStatus;
        await appointment.save();

        if (isFaculty(req)) {
            await notifyStudentsAboutAppointmentStatus({
                appointments: [appointment],
                nextStatus,
                sender: req.user,
            });
        }

        res.status(200).json({
            message: `Appointment ${nextStatus} successfully.`,
            appointment,
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            message: error.message || "Server error",
        });
    }
};

const approveAppointment = async (req, res) => {
    if (!isAdmin(req) && !isFaculty(req)) {
        return res.status(403).json({
            message: "Only admins or faculty can approve appointments",
        });
    }

    return updateAppointmentStatus(req, res, "approved");
};

const rejectAppointment = async (req, res) => {
    if (!isAdmin(req) && !isFaculty(req)) {
        return res.status(403).json({
            message: "Only admins or faculty can reject appointments",
        });
    }

    return updateAppointmentStatus(req, res, "rejected");
};

const approveAllPendingStudentAppointmentsForFaculty = async (req, res) =>
    updateAllPendingStudentAppointmentsForFaculty(
        req,
        res,
        APPOINTMENT_STATUSES.approved
    );

const rejectAllPendingStudentAppointmentsForFaculty = async (req, res) =>
    updateAllPendingStudentAppointmentsForFaculty(
        req,
        res,
        APPOINTMENT_STATUSES.rejected
    );

const approveAllPendingAppointments = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses();

        const result = await Appointment.updateMany(
            { status: APPOINTMENT_STATUSES.pending },
            { $set: { status: APPOINTMENT_STATUSES.approved } }
        );

        res.status(200).json({
            message: `${result.modifiedCount} pending appointment(s) approved successfully.`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const rejectAllPendingAppointments = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        await syncPastAppointmentStatuses();

        const pendingAppointments = await Appointment.find({
            status: APPOINTMENT_STATUSES.pending,
        }).select("slot");

        // Build per-slot release counts
        const slotReleaseCountMap = new Map();
        pendingAppointments.forEach((appt) => {
            if (appt.slot) {
                const slotId = String(appt.slot);
                slotReleaseCountMap.set(slotId, (slotReleaseCountMap.get(slotId) || 0) + 1);
            }
        });

        const result = await Appointment.updateMany(
            { status: APPOINTMENT_STATUSES.pending },
            { $set: { status: APPOINTMENT_STATUSES.rejected } }
        );

        for (const [slotId, count] of slotReleaseCountMap.entries()) {
            const slot = await AvailabilitySlot.findById(slotId);
            if (!slot) continue;
            slot.bookedCount = Math.max(0, (slot.bookedCount || 0) - count);
            slot.isBooked = slot.bookedCount >= slot.capacity;
            await slot.save();
        }

        res.status(200).json({
            message: `${result.modifiedCount} pending appointment(s) rejected successfully.`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// ─── Feature 1: Cancel ────────────────────────────────────────────────────────

const cancelAppointment = async (req, res) => {
    try {
        const appointment = await appointmentPopulate(Appointment.findById(req.params.id));

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        if (!canCancelOrReschedule(req, appointment)) {
            return res.status(403).json({
                message: "You are not allowed to cancel this appointment",
            });
        }

        if (appointment.status !== APPOINTMENT_STATUSES.approved) {
            return res.status(400).json({
                message: "Only approved appointments can be cancelled.",
            });
        }

        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

        if (!reason) {
            return res.status(400).json({ message: "A cancellation reason is required." });
        }

        // Free the seat on the linked slot
        if (appointment.slot?._id) {
            await releaseSlotSeat(appointment.slot._id);
        }

        appointment.status = APPOINTMENT_STATUSES.cancelled;
        appointment.cancellationReason = reason;
        appointment.actionBy = req.user.id;
        await appointment.save();

        // Notify the other party
        const actorName =
            req.user?.fullName ||
            req.user?.displayName ||
            req.user?.email ||
            "Someone";

        const studentId = appointment.student?._id || appointment.student;
        const facultyId = appointment.faculty?._id || appointment.faculty;

        if (isStudent(req)) {
            await Notification.create({
                recipientRole: "faculty",
                recipient: facultyId,
                sender: req.user.id,
                type: "appointment_status",
                title: "Appointment cancelled",
                message: `${actorName} cancelled the appointment on ${appointment.date} at ${appointment.time}. Reason: ${reason}`,
                appointment: appointment._id,
            });
        } else {
            await Notification.create({
                recipientRole: "student",
                recipient: studentId,
                sender: req.user.id,
                type: "appointment_status",
                title: "Appointment cancelled",
                message: `Your appointment on ${appointment.date} at ${appointment.time} was cancelled by ${actorName}. Reason: ${reason}`,
                appointment: appointment._id,
            });
        }

        res.status(200).json({
            message: "Appointment cancelled successfully.",
            appointment,
        });
    } catch (error) {
        res.status(500).json({ message: error.message || "Server error" });
    }
};

// ─── Feature 1: Reschedule ────────────────────────────────────────────────────

const RESCHEDULE_VALID_MODES = ["online", "in-person"];
const RESCHEDULE_VALID_DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MAX_RESCHEDULE_WEEKS_AHEAD = 8;

const parseRescheduleSlotStartMinutes = (periodValue) => {
    const startText =
        typeof periodValue === "string" ? periodValue.split("-")[0].trim() : "";
    const timeMatch = startText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!timeMatch) return null;

    const [, hourText, minuteText, meridiem] = timeMatch;
    let hours = Number(hourText) % 12;
    if (meridiem.toUpperCase() === "PM") hours += 12;

    return hours * 60 + Number(minuteText);
};

// Parse "Jun 01, 2026" or ISO "YYYY-MM-DD" into a local-midnight Date
const parseRescheduleDateLabel = (raw) => {
    if (!raw) return null;
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null
        : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const rescheduleAppointment = async (req, res) => {
    try {
        const appointment = await appointmentPopulate(Appointment.findById(req.params.id));

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        if (!canCancelOrReschedule(req, appointment)) {
            return res.status(403).json({
                message: "You are not allowed to reschedule this appointment",
            });
        }

        if (appointment.status !== APPOINTMENT_STATUSES.approved) {
            return res.status(400).json({
                message: "Only approved appointments can be rescheduled.",
            });
        }

        const {
            slotId: rawSlotId,
            date: rawDate,
            time: rawTime,
            mode: rawMode,
            reason: rawReason,
        } = req.body || {};

        const slotId = String(rawSlotId || "").trim();
        const date = String(rawDate || "").trim();
        const time = String(rawTime || "").trim();
        const mode = String(rawMode || "").trim();
        const reason = typeof rawReason === "string" ? rawReason.trim() : "";

        if (!slotId || !date || !time || !mode) {
            return res.status(400).json({
                message: "slotId, date, time, and mode are required for rescheduling.",
            });
        }

        if (!reason) {
            return res.status(400).json({ message: "A reschedule reason is required." });
        }

        if (!RESCHEDULE_VALID_MODES.includes(mode)) {
            return res.status(400).json({ message: "Invalid appointment mode selected." });
        }

        const facultyId = appointment.faculty?._id || appointment.faculty;

        // Look up the new slot (must belong to the same faculty)
        const slotLookupFilter = {
            faculty: facultyId,
            $or: [{ slotId }],
        };

        if (mongoose.Types.ObjectId.isValid(slotId)) {
            slotLookupFilter.$or.unshift({ _id: slotId });
        }

        const newSlotDoc = await AvailabilitySlot.findOne(slotLookupFilter);

        if (!newSlotDoc) {
            return res.status(404).json({ message: "Selected slot was not found." });
        }

        if (!Array.isArray(newSlotDoc.availableModes) || !newSlotDoc.availableModes.includes(mode)) {
            return res.status(400).json({ message: "Selected meeting mode is not available for this slot." });
        }

        if (newSlotDoc.period !== time) {
            return res.status(400).json({ message: "Selected time does not match the chosen slot." });
        }

        // Per-date validation: parse submitted date, check weekday, future time, horizon
        const parsedDate = parseRescheduleDateLabel(date);

        if (!parsedDate) {
            return res.status(400).json({ message: "Invalid date submitted." });
        }

        const submittedWeekday = RESCHEDULE_VALID_DAYS[parsedDate.getDay()];
        if (submittedWeekday !== newSlotDoc.day) {
            return res.status(400).json({ message: "Selected date does not match the slot's weekday." });
        }

        const now = new Date();
        const startMinutes = parseRescheduleSlotStartMinutes(newSlotDoc.period);
        const slotStartTs = startMinutes !== null
            ? new Date(
                parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(),
                Math.floor(startMinutes / 60), startMinutes % 60
              ).getTime()
            : null;

        if (slotStartTs === null || slotStartTs < now.getTime()) {
            return res.status(400).json({ message: "Selected slot has expired." });
        }

        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + MAX_RESCHEDULE_WEEKS_AHEAD * 7);
        if (parsedDate > maxDate) {
            return res.status(400).json({ message: "Selected date is too far in the future." });
        }

        // Per-date seat check: exclude the appointment being rescheduled so it doesn't block itself
        const isSameSlotAndDate =
            String(newSlotDoc._id) === String(appointment.slot?._id) &&
            date === appointment.date;

        const takenQuery = {
            slot: newSlotDoc._id,
            date,
            status: { $in: ["pending", "approved"] },
        };
        if (isSameSlotAndDate) {
            takenQuery._id = { $ne: appointment._id };
        }

        const taken = await Appointment.countDocuments(takenQuery);
        const capacity = Number(newSlotDoc.capacity) || 1;

        if (taken >= capacity) {
            return res.status(409).json({ message: "Selected slot is fully booked for that date. Please choose another time." });
        }

        // Snapshot old date/time then update the appointment
        const oldDate = appointment.date;
        const oldTime = appointment.time;

        appointment.rescheduledFrom = { date: oldDate, time: oldTime };
        appointment.slot = newSlotDoc._id;
        appointment.date = date;
        appointment.time = time;
        appointment.mode = mode;
        appointment.rescheduleReason = reason;
        appointment.actionBy = req.user.id;

        // Student reschedules → pending (faculty re-approves); faculty/admin → keep approved
        if (isStudent(req)) {
            appointment.status = APPOINTMENT_STATUSES.pending;
        }

        await appointment.save();

        const actorName =
            req.user?.fullName ||
            req.user?.displayName ||
            req.user?.email ||
            "Someone";

        const studentId = appointment.student?._id || appointment.student;
        const facultyIdForNotif = appointment.faculty?._id || appointment.faculty;

        if (isStudent(req)) {
            await Notification.create({
                recipientRole: "faculty",
                recipient: facultyIdForNotif,
                sender: req.user.id,
                type: "appointment_status",
                title: "Appointment rescheduled",
                message: `${actorName} rescheduled the appointment to ${date} at ${time}. Reason: ${reason}`,
                appointment: appointment._id,
            });
        } else {
            await Notification.create({
                recipientRole: "student",
                recipient: studentId,
                sender: req.user.id,
                type: "appointment_status",
                title: "Appointment rescheduled",
                message: `Your appointment was rescheduled to ${date} at ${time} by ${actorName}. Reason: ${reason}`,
                appointment: appointment._id,
            });
        }

        const populated = await appointmentPopulate(Appointment.findById(appointment._id));

        res.status(200).json({
            message: "Appointment rescheduled successfully.",
            appointment: populated,
        });
    } catch (error) {
        res.status(500).json({ message: error.message || "Server error" });
    }
};

// ─── Feature 3: Admin delete appointment ─────────────────────────────────────

const deleteAppointment = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const appointment = await Appointment.findById(req.params.id).select("_id status slot");

        if (!appointment) {
            return res.status(404).json({ message: "Appointment not found" });
        }

        // Free the seat if the appointment was holding one
        const seatHoldingStatuses = [APPOINTMENT_STATUSES.pending, APPOINTMENT_STATUSES.approved];

        if (seatHoldingStatuses.includes(appointment.status) && appointment.slot) {
            await releaseSlotSeat(appointment.slot);
        }

        // Remove related notifications
        await Notification.deleteMany({ appointment: appointment._id });

        await Appointment.findByIdAndDelete(appointment._id);

        res.status(200).json({ message: "Appointment deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    getAllAppointments,
    getMyFacultyAppointments,
    getMyStudentAppointments,
    approveManyFacultyAppointments,
    rejectManyFacultyAppointments,
    approveAllFacultyAppointments,
    rejectAllFacultyAppointments,
    approveAllPendingStudentAppointmentsForFaculty,
    rejectAllPendingStudentAppointmentsForFaculty,
    rejectFacultyAppointmentsByDay,
    approveAppointment,
    rejectAppointment,
    approveAllPendingAppointments,
    rejectAllPendingAppointments,
    cancelAppointment,
    rescheduleAppointment,
    deleteAppointment,
};
