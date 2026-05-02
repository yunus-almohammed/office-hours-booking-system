const Appointment = require("../models/Appointment");
const AvailabilitySlot = require("../models/AvailabilitySlot");

const APPOINTMENT_STATUSES = {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    completed: "completed",
    expired: "expired",
};

const ACTIVE_APPOINTMENT_STATUSES = [
    APPOINTMENT_STATUSES.pending,
    APPOINTMENT_STATUSES.approved,
];

const parseAppointmentDateValue = (rawDate) => {
    if (!rawDate) {
        return null;
    }

    if (rawDate instanceof Date) {
        return Number.isNaN(rawDate.getTime()) ? null : rawDate;
    }

    const dateText = String(rawDate).trim();

    if (!dateText) {
        return null;
    }

    const isoDateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoDateMatch) {
        const [, year, month, day] = isoDateMatch;

        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsedDate = new Date(dateText);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const parseAppointmentStartMinutes = (timeValue) => {
    const startText =
        typeof timeValue === "string" ? timeValue.split("-")[0].trim() : "";
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

const getAppointmentTimestamp = (appointment) => {
    const parsedDate = parseAppointmentDateValue(appointment?.date);
    const startMinutes = parseAppointmentStartMinutes(appointment?.time);

    if (parsedDate) {
        return new Date(
            parsedDate.getFullYear(),
            parsedDate.getMonth(),
            parsedDate.getDate(),
            startMinutes !== null ? Math.floor(startMinutes / 60) : 0,
            startMinutes !== null ? startMinutes % 60 : 0
        ).getTime();
    }

    const createdAtTimestamp = Date.parse(appointment?.createdAt || "");

    return Number.isNaN(createdAtTimestamp) ? 0 : createdAtTimestamp;
};

const isPastAppointment = (appointment, now = Date.now()) => {
    const appointmentTimestamp = getAppointmentTimestamp(appointment);

    return appointmentTimestamp > 0 && appointmentTimestamp < now;
};

const getAutomaticPastStatus = (appointment, now = Date.now()) => {
    if (!isPastAppointment(appointment, now)) {
        return null;
    }

    if (appointment?.status === APPOINTMENT_STATUSES.approved) {
        return APPOINTMENT_STATUSES.completed;
    }

    if (appointment?.status === APPOINTMENT_STATUSES.pending) {
        return APPOINTMENT_STATUSES.expired;
    }

    return null;
};

const syncPastAppointmentStatuses = async (filter = {}) => {
    const appointments = await Appointment.find({
        ...filter,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    }).select("_id status date time slot createdAt");

    if (appointments.length === 0) {
        return {
            updatedCount: 0,
            completedCount: 0,
            expiredCount: 0,
            releasedSlotCount: 0,
        };
    }

    const now = Date.now();
    const completedAppointmentIds = [];
    const expiredAppointmentIds = [];
    const releasedSlotIdSet = new Set();

    appointments.forEach((appointment) => {
        const nextStatus = getAutomaticPastStatus(appointment, now);

        if (!nextStatus) {
            return;
        }

        if (nextStatus === APPOINTMENT_STATUSES.completed) {
            completedAppointmentIds.push(appointment._id);
        }

        if (nextStatus === APPOINTMENT_STATUSES.expired) {
            expiredAppointmentIds.push(appointment._id);
        }

        if (appointment.slot) {
            releasedSlotIdSet.add(String(appointment.slot));
        }
    });

    if (completedAppointmentIds.length > 0) {
        await Appointment.updateMany(
            { _id: { $in: completedAppointmentIds } },
            { $set: { status: APPOINTMENT_STATUSES.completed } }
        );
    }

    if (expiredAppointmentIds.length > 0) {
        await Appointment.updateMany(
            { _id: { $in: expiredAppointmentIds } },
            { $set: { status: APPOINTMENT_STATUSES.expired } }
        );
    }

    const releasedSlotIds = [...releasedSlotIdSet];

    if (releasedSlotIds.length > 0) {
        await AvailabilitySlot.updateMany(
            { _id: { $in: releasedSlotIds } },
            { $set: { isBooked: false } }
        );
    }

    return {
        updatedCount: completedAppointmentIds.length + expiredAppointmentIds.length,
        completedCount: completedAppointmentIds.length,
        expiredCount: expiredAppointmentIds.length,
        releasedSlotCount: releasedSlotIds.length,
    };
};

module.exports = {
    APPOINTMENT_STATUSES,
    ACTIVE_APPOINTMENT_STATUSES,
    parseAppointmentDateValue,
    parseAppointmentStartMinutes,
    getAppointmentTimestamp,
    isPastAppointment,
    getAutomaticPastStatus,
    syncPastAppointmentStatuses,
};
