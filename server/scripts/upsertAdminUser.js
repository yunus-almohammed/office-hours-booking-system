const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const User = require("../models/User");

const ADMIN_ACCOUNT = {
    fullName: "Yunus Al Mohammed",
    email: "yunusalmohammed@gmail.com",
    role: "admin",
    requestedRole: "admin",
    approvalStatus: "approved",
};

const rawPassword = process.argv[2];

const requireEnvironmentVariable = (name) => {
    if (!process.env[name]) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return process.env[name];
};

const upsertAdminUser = async () => {
    if (!rawPassword) {
        throw new Error(
            "Please provide the admin password as the first argument, for example: node scripts/upsertAdminUser.js 0505"
        );
    }

    const mongoUri = requireEnvironmentVariable("MONGO_URI");
    const normalizedEmail = ADMIN_ACCOUNT.email.toLowerCase();
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await mongoose.connect(mongoUri);

    const existingUser = await User.findOne({ email: normalizedEmail }).select("_id");
    const didExist = Boolean(existingUser);

    const user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        {
            $set: {
                fullName: ADMIN_ACCOUNT.fullName,
                email: normalizedEmail,
                password: passwordHash,
                role: ADMIN_ACCOUNT.role,
                requestedRole: ADMIN_ACCOUNT.requestedRole,
                approvalStatus: ADMIN_ACCOUNT.approvalStatus,
                contactEmail: normalizedEmail,
            },
        },
        {
            runValidators: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            upsert: true,
        }
    );

    console.log(
        `Admin account ${didExist ? "updated" : "created"} successfully for ${user.email}.`
    );
};

upsertAdminUser()
    .catch((error) => {
        console.error("Failed to upsert admin account:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
