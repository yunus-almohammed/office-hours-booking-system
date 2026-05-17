const nodemailer = require("nodemailer");

const requiredEmailEnvironmentVariables = [
    "EMAIL_HOST",
    "EMAIL_PORT",
    "EMAIL_SECURE",
    "EMAIL_USER",
    "EMAIL_PASS",
    "EMAIL_FROM",
];

const getEnvironmentValue = (environmentVariable) =>
    String(process.env[environmentVariable] || "").trim();

const getMissingEmailConfiguration = () =>
    requiredEmailEnvironmentVariables.filter(
        (environmentVariable) => !getEnvironmentValue(environmentVariable)
    );

const buildMissingEmailConfigurationMessage = (missingConfiguration) =>
    `Missing email configuration: ${missingConfiguration.join(", ")}.`;

const parseEmailPort = () => {
    const emailPort = Number(getEnvironmentValue("EMAIL_PORT"));

    if (!Number.isInteger(emailPort) || emailPort <= 0) {
        const error = new Error(
            "Invalid email configuration: EMAIL_PORT must be a valid number."
        );

        error.code = "EMAIL_CONFIG_INVALID";
        throw error;
    }

    return emailPort;
};

const parseEmailSecure = () => {
    const emailSecure = getEnvironmentValue("EMAIL_SECURE").toLowerCase();

    if (emailSecure !== "true" && emailSecure !== "false") {
        const error = new Error(
            'Invalid email configuration: EMAIL_SECURE must be "true" or "false".'
        );

        error.code = "EMAIL_CONFIG_INVALID";
        throw error;
    }

    return emailSecure === "true";
};

const createTransporter = () => {
    const missingConfiguration = getMissingEmailConfiguration();

    if (missingConfiguration.length > 0) {
        const error = new Error(
            buildMissingEmailConfigurationMessage(missingConfiguration)
        );

        error.code = "EMAIL_CONFIG_MISSING";
        throw error;
    }

    const emailPort = parseEmailPort();
    const emailSecure = parseEmailSecure();

    return nodemailer.createTransport({
        host: getEnvironmentValue("EMAIL_HOST"),
        port: emailPort,
        secure: emailSecure,
        auth: {
            user: getEnvironmentValue("EMAIL_USER"),
            pass: getEnvironmentValue("EMAIL_PASS"),
        },
    });
};

const sendEmail = async ({ to, subject, text, html }) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
        html,
    });
};

module.exports = {
    buildMissingEmailConfigurationMessage,
    getMissingEmailConfiguration,
    sendEmail,
};
