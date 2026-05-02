const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
    getApprovedFaculty,
    getFacultyAvailabilityForStudents,
    createStudentAppointment,
} = require("../controllers/studentController");

router.get("/faculty", protect, getApprovedFaculty);
router.get("/faculty/:facultyId/availability", protect, getFacultyAvailabilityForStudents);
router.post("/appointments", protect, createStudentAppointment);

module.exports = router;
