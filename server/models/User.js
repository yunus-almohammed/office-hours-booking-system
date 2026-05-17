const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        role: {
            type: String,
            enum: ["student", "faculty", "admin"],
            default: "student",
        },
        requestedRole: {
            type: String,
            enum: ["student", "faculty", "admin"],
            default: "student",
        },
        approvalStatus: {
            type: String,
            enum: ["approved", "pending", "rejected"],
            default: "approved",
        },
        profileImage: {
            type: String,
            default: "",
        },
        displayName: {
            type: String,
            trim: true,
        },
        major: {
            type: String,
            trim: true,
            default: "",
        },
        building: {
            type: String,
            trim: true,
            default: "",
        },
        room: {
            type: String,
            trim: true,
            default: "",
        },
        phoneNumber: {
            type: String,
            trim: true,
            default: "",
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },
        resetPasswordToken: {
            type: String,
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            select: false,
        },
    },
    { timestamps: true }
);

userSchema.pre("save", async function () {
    if (this.isNew && !this.contactEmail && this.email) {
        this.contactEmail = this.email;
    }

    if (!this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

const removePassword = (_doc, returnedObject) => {
    delete returnedObject.password;
    delete returnedObject.resetPasswordToken;
    delete returnedObject.resetPasswordExpires;
    return returnedObject;
};

userSchema.set("toJSON", { transform: removePassword });
userSchema.set("toObject", { transform: removePassword });

module.exports = mongoose.model("User", userSchema);
