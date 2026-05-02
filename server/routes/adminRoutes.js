const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
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
} = require("../controllers/adminController");

router.use(protect, adminOnly);

router.get("/pending-faculty", getPendingFacultyRequests);
router.put("/approve-faculty/:id", approveFacultyRequest);
router.patch("/faculty-requests/:id/approve", approveFacultyRequest);
router.patch("/faculty-requests/:id/reject", rejectFacultyRequest);
router.patch("/faculty-requests/approve-all", approveAllFacultyRequests);
router.patch("/faculty-requests/reject-all", rejectAllFacultyRequests);
router.get("/faculty-members", getFacultyMembers);
router.delete("/faculty/:id", deleteFacultyAccount);
router.get("/students", getStudents);
router.delete("/students/:id", deleteStudentAccount);
router.delete("/notifications/:id", deleteAdminNotification);

module.exports = router;
