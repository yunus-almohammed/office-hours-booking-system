const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const Notification = require("../models/Notification");
const {
    APPOINTMENT_STATUSES,
    getAppointmentTimestamp,
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
        .populate("slot", "day period availableModes isBooked");

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

const syncAppointmentSlot = async (appointment, nextStatus) => {
    if (!appointment.slot?._id) {
        return null;
    }

    const slot = await AvailabilitySlot.findById(appointment.slot._id);

    if (!slot) {
        return null;
    }

    if (nextStatus === "approved") {
        if (appointment.status === "rejected" && slot.isBooked) {
            const error = new Error("This appointment slot has already been booked again.");
            error.statusCode = 409;
            throw error;
        }

        slot.isBooked = true;
    }

    if (nextStatus === "rejected") {
        slot.isBooked = false;
    }

    await slot.save();

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
        const slotIds = appointments
            .map((appointment) => appointment.slot)
            .filter(Boolean);

        const result = await Appointment.updateMany(
            { _id: { $in: appointmentIds } },
            { $set: { status: APPOINTMENT_STATUSES.rejected } }
        );

        if (slotIds.length > 0) {
            await AvailabilitySlot.updateMany(
                { _id: { $in: slotIds } },
                { $set: { isBooked: false } }
            );
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
        const slotIds = pendingAppointments
            .map((appointment) => appointment.slot)
            .filter(Boolean);

        const result = await Appointment.updateMany(
            { status: APPOINTMENT_STATUSES.pending },
            { $set: { status: APPOINTMENT_STATUSES.rejected } }
        );

        if (slotIds.length > 0) {
            await AvailabilitySlot.updateMany(
                { _id: { $in: slotIds } },
                { $set: { isBooked: false } }
            );
        }

        res.status(200).json({
            message: `${result.modifiedCount} pending appointment(s) rejected successfully.`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
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
};
