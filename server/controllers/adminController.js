const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const AvailabilitySlot = require("../models/AvailabilitySlot");
const Notification = require("../models/Notification");
const User = require("../models/User");

const ensureAdmin = (req, res) => {
    if (req.user?.role !== "admin") {
        res.status(403).json({ message: "Only admins can access this resource" });
        return false;
    }

    return true;
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const deleteNotificationsForUserAndAppointments = async (userId, appointmentIds = []) => {
    const conditions = [{ recipient: userId }, { sender: userId }];

    if (appointmentIds.length > 0) {
        conditions.push({ appointment: { $in: appointmentIds } });
    }

    await Notification.deleteMany({ $or: conditions });
};

const getPendingFacultyRequests = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const pendingUsers = await User.find({
            requestedRole: "faculty",
            approvalStatus: "pending",
        });

        res.status(200).json(pendingUsers);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const approveFacultyRequest = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const { id } = req.params;

        const user = await User.findOne({ _id: id, requestedRole: "faculty" });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.role = "faculty";
        user.approvalStatus = "approved";

        await user.save();

        res.status(200).json({
            message: "Faculty account approved successfully",
            user,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const rejectFacultyRequest = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const { id } = req.params;

        const user = await User.findOne({ _id: id, requestedRole: "faculty" });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.role = "student";
        user.approvalStatus = "rejected";

        await user.save();

        res.status(200).json({
            message: "Faculty account request rejected successfully",
            user,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const approveAllFacultyRequests = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const result = await User.updateMany(
            {
                requestedRole: "faculty",
                approvalStatus: "pending",
            },
            {
                $set: {
                    role: "faculty",
                    approvalStatus: "approved",
                },
            }
        );

        res.status(200).json({
            message: `${result.modifiedCount} faculty request(s) approved successfully`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const rejectAllFacultyRequests = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const result = await User.updateMany(
            {
                requestedRole: "faculty",
                approvalStatus: "pending",
            },
            {
                $set: {
                    role: "student",
                    approvalStatus: "rejected",
                },
            }
        );

        res.status(200).json({
            message: `${result.modifiedCount} faculty request(s) rejected successfully`,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getFacultyMembers = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const facultyMembers = await User.find({ role: "faculty" });

        res.status(200).json(facultyMembers);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const getStudents = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const students = await User.find({
            role: "student",
            requestedRole: "student",
        });

        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteFacultyAccount = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid faculty id" });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({ message: "Faculty account not found" });
        }

        if (user.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot be deleted here" });
        }

        if (user.role !== "faculty") {
            return res.status(400).json({ message: "User is not a faculty account" });
        }

        const facultyAppointments = await Appointment.find({ faculty: id }).select("_id");
        const appointmentIds = facultyAppointments.map((appointment) => appointment._id);

        await AvailabilitySlot.deleteMany({ faculty: id });
        await Appointment.deleteMany({ faculty: id });
        await deleteNotificationsForUserAndAppointments(id, appointmentIds);
        await User.findByIdAndDelete(id);

        res.status(200).json({ message: "Faculty account deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteStudentAccount = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid student id" });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({ message: "Student account not found" });
        }

        if (user.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot be deleted here" });
        }

        if (user.role !== "student") {
            return res.status(400).json({ message: "User is not a student account" });
        }

        const studentAppointments = await Appointment.find({ student: id }).select("_id slot");
        const appointmentIds = studentAppointments.map((appointment) => appointment._id);
        const slotIds = studentAppointments
            .map((appointment) => appointment.slot)
            .filter(Boolean);

        if (slotIds.length > 0) {
            await AvailabilitySlot.updateMany(
                { _id: { $in: slotIds } },
                {
                    $set: {
                        isBooked: false,
                    },
                }
            );
        }

        await Appointment.deleteMany({ student: id });
        await deleteNotificationsForUserAndAppointments(id, appointmentIds);
        await User.findByIdAndDelete(id);

        res.status(200).json({ message: "Student account deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteAdminNotification = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) {
            return;
        }

        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid notification id" });
        }

        const notification = await Notification.findOne({
            _id: id,
            recipientRole: "admin",
        });

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        await Notification.findByIdAndDelete(id);

        res.status(200).json({ message: "Notification deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    getPendingFacultyRequests,
    approveFacultyRequest,
    rejectFacultyRequest,
    approveAllFacultyRequests,
    rejectAllFacultyRequests,
    getFacultyMembers,
    getStudents,
    deleteFacultyAccount,
    deleteStudentAccount,
    deleteAdminNotification,
};
