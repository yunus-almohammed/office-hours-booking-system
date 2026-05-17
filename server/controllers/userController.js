const User = require("../models/User");
const { buildClientUserPayload } = require("../utils/buildClientUserPayload");

const updateMyProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Please choose an image to upload.",
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.profileImage = `/uploads/profile-images/${req.file.filename}`;

        const updatedUser = await user.save();

        res.status(200).json({
            message: "Profile image uploaded successfully.",
            user: buildClientUserPayload(updatedUser),
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { updateMyProfileImage };
