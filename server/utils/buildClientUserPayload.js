const buildClientUserPayload = (user) => ({
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    major: user.major || "",
    role: user.role,
    requestedRole: user.requestedRole,
    approvalStatus: user.approvalStatus,
    phoneNumber: user.phoneNumber || "",
    contactEmail: user.contactEmail || "",
    profileImage: user.profileImage || "",
    displayName: user.displayName || "",
    building: user.building || "",
    room: user.room || "",
});

module.exports = { buildClientUserPayload };
