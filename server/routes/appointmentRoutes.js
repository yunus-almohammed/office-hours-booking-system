const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/appointmentController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/", getAllAppointments);
router.get("/faculty/my", getMyFacultyAppointments);
router.get("/student/my", getMyStudentAppointments);
router.patch("/faculty/approve-many", approveManyFacultyAppointments);
router.patch("/faculty/reject-many", rejectManyFacultyAppointments);
router.patch("/faculty/approve-all", approveAllFacultyAppointments);
router.patch("/faculty/reject-all", rejectAllFacultyAppointments);
router.patch(
    "/faculty/student/:studentId/approve-all-pending",
    approveAllPendingStudentAppointmentsForFaculty
);
router.patch(
    "/faculty/student/:studentId/reject-all-pending",
    rejectAllPendingStudentAppointmentsForFaculty
);
router.patch("/faculty/reject-day", rejectFacultyAppointmentsByDay);
router.patch("/admin/approve-all", approveAllPendingAppointments);
router.patch("/admin/reject-all", rejectAllPendingAppointments);
router.patch("/:id/approve", approveAppointment);
router.patch("/:id/reject", rejectAppointment);

module.exports = router;
