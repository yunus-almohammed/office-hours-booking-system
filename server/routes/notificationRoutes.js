const express = require("express");
const router = express.Router();

const {
    getMyNotifications,
    getFacultyNotifications,
    getAdminNotifications,
    getUnreadNotificationCount,
    markMyNotificationsAsRead,
    createFacultyReport,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.get("/my", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadNotificationCount);
router.get("/faculty", protect, getFacultyNotifications);
router.get("/admin", protect, getAdminNotifications);
router.patch("/mark-read", protect, markMyNotificationsAsRead);
router.post("/faculty-report", protect, createFacultyReport);

module.exports = router;
