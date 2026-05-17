const fs = require("fs");
const path = require("path");
const multer = require("multer");

const profileImagesDirectory = path.join(
    __dirname,
    "..",
    "uploads",
    "profile-images"
);

fs.mkdirSync(profileImagesDirectory, { recursive: true });

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, profileImagesDirectory);
    },
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname || "").toLowerCase();
        const safeBaseName = path
            .basename(file.originalname || "profile-image", extension)
            .replace(/[^a-zA-Z0-9_-]/g, "-")
            .slice(0, 50);
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        callback(
            null,
            `${safeBaseName || "profile-image"}-${uniqueSuffix}${extension || ".jpg"}`
        );
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
        const extension = path.extname(file.originalname || "").toLowerCase();
        const isAllowedExtension = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
        const isAllowedMimeType = allowedMimeTypes.has(file.mimetype);

        if (!isAllowedExtension || !isAllowedMimeType) {
            callback(
                new Error("Only JPG, JPEG, PNG, and WEBP images are allowed.")
            );
            return;
        }

        callback(null, true);
    },
});

const uploadSingleProfileImage = (req, res, next) => {
    upload.single("profileImage")(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                res.status(400).json({
                    message: "Profile image must be 2MB or smaller.",
                });
                return;
            }

            res.status(400).json({
                message: error.message || "Invalid profile image upload.",
            });
            return;
        }

        res.status(400).json({
            message: error.message || "Invalid profile image upload.",
        });
    });
};

module.exports = { uploadSingleProfileImage };
