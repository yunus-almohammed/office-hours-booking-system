const getJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured in the environment.");
    }

    return process.env.JWT_SECRET;
};

module.exports = { getJwtSecret };
