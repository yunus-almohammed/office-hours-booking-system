const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/facultyController");

const { protect } = require("../middleware/authMiddleware");

router.get("/approved", protect, getApprovedFacultyDirectory);
router.get("/profile", protect, getFacultyProfile);
router.put("/profile", protect, updateFacultyProfile);

router.get("/appointments", protect, getFacultyAppointments);
router.get("/students", protect, getFacultyStudents);

router.get("/availability", protect, getFacultyAvailabilitySlots);
router.post("/availability", protect, createAvailabilitySlot);
router.delete("/availability", protect, deleteAllAvailabilitySlots);
router.patch("/availability/day/:day/capacity", protect, updateDayCapacity);
router.put("/availability/:id", protect, updateAvailabilitySlot);
router.delete("/availability/day/:day", protect, deleteAvailabilitySlotsByDay);
router.delete("/availability/:id", protect, deleteAvailabilitySlot);

module.exports = router;
