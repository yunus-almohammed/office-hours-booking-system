const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { uploadSingleProfileImage } = require("../middleware/profileImageUploadMiddleware");
const { updateMyProfileImage } = require("../controllers/userController");

const router = express.Router();

router.patch(
    "/me/profile-image",
    protect,
    uploadSingleProfileImage,
    updateMyProfileImage
);

module.exports = router;
