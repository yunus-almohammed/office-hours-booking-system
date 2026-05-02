const Notification = require("../models/Notification");
const User = require("../models/User");
const { syncPastAppointmentStatuses } = require("../utils/appointmentSchedule");

const getNotificationRecipientFilter = (user) => ({
    recipientRole: user.role,
    recipient: user.id,
});

const getUnreadNotificationFilter = (user) => ({
    ...getNotificationRecipientFilter(user),
    $or: [
        { read: false },
        { read: { $exists: false }, isRead: false },
        { read: { $exists: false }, isRead: { $exists: false } },
    ],
});

const syncNotificationAppointmentStatuses = async (user) => {
    if (user.role === "student") {
        await syncPastAppointmentStatuses({ student: user.id });
        return;
    }

    if (user.role === "faculty") {
        await syncPastAppointmentStatuses({ faculty: user.id });
        return;
    }

    if (user.role === "admin") {
        await syncPastAppointmentStatuses();
    }
};

const findMyNotifications = async (user, senderFields = "fullName displayName email role") =>
    Notification.find(getNotificationRecipientFilter(user))
        .populate("sender", senderFields)
        .populate("appointment", "appointmentId date time mode status")
        .sort({ createdAt: -1 });

const getMyNotifications = async (req, res) => {
    try {
        await syncNotificationAppointmentStatuses(req.user);

        const notifications = await findMyNotifications(req.user);

        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyNotifications = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can view these notifications" });
        }

        await syncNotificationAppointmentStatuses(req.user);

        const notifications = await findMyNotifications(req.user, "fullName email role");

        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getAdminNotifications = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Only admins can view these notifications" });
        }

        await syncNotificationAppointmentStatuses(req.user);

        const notifications = await findMyNotifications(req.user, "fullName email role");

        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getUnreadNotificationCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments(
            getUnreadNotificationFilter(req.user)
        );

        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const markMyNotificationsAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            getUnreadNotificationFilter(req.user),
            { $set: { read: true, isRead: true } }
        );

        res.status(200).json({
            message: "Notifications marked as read.",
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const createFacultyReport = async (req, res) => {
    try {
        if (req.user.role !== "faculty") {
            return res.status(403).json({ message: "Only faculty can send reports" });
        }

        const { title, message } = req.body;

        if (!title || !message) {
            return res.status(400).json({ message: "Please fill all required fields" });
        }

        const admins = await User.find({ role: "admin" }).select("_id");

        if (admins.length === 0) {
            return res.status(404).json({ message: "No admin accounts found" });
        }

        const notifications = await Notification.insertMany(
            admins.map((admin) => ({
                recipientRole: "admin",
                recipient: admin._id,
                sender: req.user.id,
                type: "faculty_report",
                title,
                message,
                read: false,
                isRead: false,
            }))
        );

        const populatedNotification = await Notification.findById(
            notifications[0]?._id
        ).populate("sender", "fullName email role");

        res.status(201).json({
            message: "Report sent successfully",
            notification: populatedNotification,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getMyNotifications,
    getFacultyNotifications,
    getAdminNotifications,
    getUnreadNotificationCount,
    markMyNotificationsAsRead,
    createFacultyReport,
};
