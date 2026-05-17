const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    loginUser,
    registerUser,
    forgotPassword,
    resetPassword,
    getCurrentUser,
    updateCurrentUserProfile,
} = require("../controllers/authController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/me", protect, getCurrentUser);
router.patch("/me", protect, updateCurrentUserProfile);

module.exports = router;
