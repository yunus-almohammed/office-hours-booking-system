import { useEffect, useEffectEvent, useState } from "react";
import "./FacultyDashboard.css";
import api, { getProfileImageSrc } from "./api";
import logo from "./assets/logo.png";

const weekDays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const periodOptions = [
    "07:00 AM - 08:00 AM",
    "08:00 AM - 09:00 AM",
    "09:00 AM - 10:00 AM",
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 01:00 PM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM",
    "04:00 PM - 05:00 PM",
    "05:00 PM - 06:00 PM",
    "06:00 PM - 07:00 PM",
    "07:00 PM - 08:00 PM",
    "08:00 PM - 09:00 PM",
    "09:00 PM - 10:00 PM",
];

const modeOptions = [
    { label: "Online", value: "online" },
    { label: "In-person", value: "in-person" },
];

const emptyProfileForm = {
    fullName: "",
    email: "",
    profileImage: "",
    displayName: "",
    major: "",
    building: "",
    room: "",
    phoneNumber: "",
    contactEmail: "",
};

const getInitials = (value) => {
    const parts = (value || "Faculty")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "FA";
};

const PHONE_VALIDATION_MESSAGE = "Phone number must be exactly 10 digits.";
const CONTACT_EMAIL_VALIDATION_MESSAGE = "Please enter a valid contact email.";

const sanitizePhoneNumber = (value) =>
    String(value || "")
        .replace(/\D/g, "")
        .slice(0, 10);

const isValidOptionalPhoneNumber = (value) => !value || /^\d{10}$/.test(value);
const isValidOptionalEmail = (value) =>
    !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toSafeArray = (value) => (Array.isArray(value) ? value : []);

const toSafeObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : null;

const formatRoleLabel = (role) =>
    role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown";

const formatModeLabel = (mode) =>
    mode === "in-person" ? "In-person" : mode === "online" ? "Online" : mode;

const formatStatusLabel = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";

const getAppointmentDisplayId = (appointment) =>
    appointment?.appointmentId || appointment?._id || "";

const getAppointmentStudentId = (appointment) =>
    appointment?.student?._id || appointment?.student || "";

const getAppointmentDate = (appointment) =>
    appointment?.date ||
    appointment?.appointmentDate ||
    appointment?.slotDate ||
    appointment?.selectedDate ||
    appointment?.slot?.date ||
    appointment?.slot?.slotDate ||
    appointment?.slot?.selectedDate ||
    "";

const parseAppointmentDate = (rawDate) => {
    if (!rawDate) {
        return null;
    }

    if (rawDate instanceof Date) {
        return Number.isNaN(rawDate.getTime()) ? null : rawDate;
    }

    const dateText = String(rawDate).trim();

    if (!dateText) {
        return null;
    }

    const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (dateMatch) {
        const [, year, month, day] = dateMatch;

        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsedDate = new Date(dateText);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getAppointmentStartText = (appointment) =>
    (appointment?.startTime || appointment?.time || "").split("-")[0].trim();

const getAppointmentTimestamp = (appointment) => {
    const parsedDate = parseAppointmentDate(getAppointmentDate(appointment));
    const startText = getAppointmentStartText(appointment);
    const timeMatch = startText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (parsedDate) {
        if (timeMatch) {
            const [, hourText, minuteText, meridiem] = timeMatch;
            let hours = Number(hourText) % 12;

            if (meridiem.toUpperCase() === "PM") {
                hours += 12;
            }

            return new Date(
                parsedDate.getFullYear(),
                parsedDate.getMonth(),
                parsedDate.getDate(),
                hours,
                Number(minuteText)
            ).getTime();
        }

        return new Date(
            parsedDate.getFullYear(),
            parsedDate.getMonth(),
            parsedDate.getDate()
        ).getTime();
    }

    const fallbackTimestamp = Date.parse(
        `${getAppointmentDate(appointment)} ${getAppointmentStartText(appointment)}`
    );

    if (!Number.isNaN(fallbackTimestamp)) {
        return fallbackTimestamp;
    }

    return Date.parse(appointment?.createdAt || "") || 0;
};

const compareAppointmentsByTimestamp = (
    firstAppointment,
    secondAppointment,
    direction = "asc"
) => {
    const firstTimestamp = getAppointmentTimestamp(firstAppointment);
    const secondTimestamp = getAppointmentTimestamp(secondAppointment);

    if (firstTimestamp !== secondTimestamp) {
        return direction === "asc"
            ? firstTimestamp - secondTimestamp
            : secondTimestamp - firstTimestamp;
    }

    return getAppointmentDisplayId(firstAppointment).localeCompare(
        getAppointmentDisplayId(secondAppointment)
    );
};

const splitAppointmentsByTime = (appointmentList) => {
    const now = Date.now();
    const upcoming = [];
    const past = [];

    appointmentList.forEach((appointment) => {
        if (getAppointmentTimestamp(appointment) < now) {
            past.push(appointment);
            return;
        }

        upcoming.push(appointment);
    });

    return {
        upcomingAppointments: [...upcoming].sort((firstAppointment, secondAppointment) =>
            compareAppointmentsByTimestamp(firstAppointment, secondAppointment, "asc")
        ),
        pastAppointments: [...past].sort((firstAppointment, secondAppointment) =>
            compareAppointmentsByTimestamp(firstAppointment, secondAppointment, "desc")
        ),
    };
};

const getFacultyStatusClassName = (status) => {
    if (status === "approved") {
        return "faculty-approved";
    }

    if (status === "rejected") {
        return "faculty-rejected";
    }

    if (status === "completed") {
        return "faculty-completed";
    }

    if (status === "expired") {
        return "faculty-expired";
    }

    return "faculty-pending";
};

const isPastAppointment = (appointment) => getAppointmentTimestamp(appointment) < Date.now();

const canApproveAppointment = (appointment) =>
    !isPastAppointment(appointment) &&
    ["pending", "rejected"].includes(appointment?.status);

const canRejectAppointment = (appointment) =>
    !isPastAppointment(appointment) &&
    ["pending", "approved"].includes(appointment?.status);

const matchesAppointmentSearch = (appointment, rawQuery) => {
    const query = rawQuery.trim().toLowerCase();

    if (!query) {
        return true;
    }

    const searchableValues = [
        appointment?.student?.fullName,
        appointment?.student?.email,
        getAppointmentDisplayId(appointment),
        appointment?.topic || appointment?.notes,
        appointment?.date,
        appointment?.status,
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

    return searchableValues.some((value) => value.includes(query));
};

const getResponseCollection = (payload, collectionKeys = []) => {
    if (Array.isArray(payload)) {
        return payload;
    }

    const safePayload = toSafeObject(payload);

    if (!safePayload) {
        return [];
    }

    for (const collectionKey of collectionKeys) {
        if (Array.isArray(safePayload?.[collectionKey])) {
            return safePayload[collectionKey];
        }
    }

    return [];
};

const normalizeAppointment = (appointment) => {
    const safeAppointment = toSafeObject(appointment);

    if (!safeAppointment) {
        return null;
    }

    return {
        ...safeAppointment,
        student: toSafeObject(safeAppointment.student),
        faculty: toSafeObject(safeAppointment.faculty),
        slot: toSafeObject(safeAppointment.slot),
    };
};

const normalizeAvailabilitySlot = (slot) => {
    const safeSlot = toSafeObject(slot);

    if (!safeSlot) {
        return null;
    }

    return {
        ...safeSlot,
        availableModes: toSafeArray(safeSlot.availableModes),
    };
};

const normalizeNotification = (notification) => {
    const safeNotification = toSafeObject(notification);

    if (!safeNotification) {
        return null;
    }

    return {
        ...safeNotification,
        sender: toSafeObject(safeNotification.sender),
        appointment: toSafeObject(safeNotification.appointment),
    };
};

const getProfileFormState = (profile) => {
    const safeProfile = toSafeObject(profile);

    return {
        ...emptyProfileForm,
        fullName: safeProfile?.fullName || "",
        email: safeProfile?.email || "",
        profileImage: safeProfile?.profileImage || "",
        displayName: safeProfile?.displayName || "",
        major: safeProfile?.major || "",
        building: safeProfile?.building || "",
        room: safeProfile?.room || "",
        phoneNumber: sanitizePhoneNumber(safeProfile?.phoneNumber),
        contactEmail: safeProfile?.contactEmail || "",
    };
};

const getProfileResponseState = (payload) => {
    const safePayload = toSafeObject(payload);
    const profile =
        toSafeObject(safePayload?.profile) ||
        toSafeObject(safePayload?.user) ||
        safePayload;

    return getProfileFormState(profile);
};

function FacultyDashboard({ onLogout, onUserUpdate, user }) {
    const [activeSection, setActiveSection] = useState("dashboard");
    const [appointments, setAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(true);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(true);
    const [selectedStudentId, setSelectedStudentId] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(true);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);

    const [availabilitySlots, setAvailabilitySlots] = useState([]);
    const [loadingAvailability, setLoadingAvailability] = useState(true);

    const [slotDays, setSlotDays] = useState([]);
    const [slotPeriods, setSlotPeriods] = useState([]);
    const [slotModes, setSlotModes] = useState([]);
    const [availabilityMessage, setAvailabilityMessage] = useState("");
    const [appointmentMessage, setAppointmentMessage] = useState("");
    const [appointmentSearchTerm, setAppointmentSearchTerm] = useState("");
    const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
    const [editingSlotId, setEditingSlotId] = useState(null);
    const [editPeriod, setEditPeriod] = useState("");
    const [editModes, setEditModes] = useState([]);
    const [editCapacity, setEditCapacity] = useState(1);
    const [dayCapacityInputs, setDayCapacityInputs] = useState({});
    const [dayCapacityMessage, setDayCapacityMessage] = useState({});

    // Cancel modal state
    const [cancelModalAppointment, setCancelModalAppointment] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelMessage, setCancelMessage] = useState("");

    // Reschedule modal state
    const [rescheduleModalAppointment, setRescheduleModalAppointment] = useState(null);
    const [rescheduleReason, setRescheduleReason] = useState("");
    const [rescheduleSelectedSlotId, setRescheduleSelectedSlotId] = useState("");
    const [rescheduleMode, setRescheduleMode] = useState("");
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleMessage, setRescheduleMessage] = useState("");
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [reportTitle, setReportTitle] = useState("");
    const [reportMessage, setReportMessage] = useState("");
    const [notificationMessage, setNotificationMessage] = useState("");
    const [profileForm, setProfileForm] = useState(() => getProfileFormState(user));
    const [profileMessage, setProfileMessage] = useState("");
    const [profileMessageType, setProfileMessageType] = useState("");
    const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
    const [profileImageFile, setProfileImageFile] = useState(null);
    const [profileImagePreview, setProfileImagePreview] = useState("");

    const fetchAppointments = async () => {
        try {
            setLoadingAppointments(true);
            const response = await api.get("/api/appointments/faculty/my");
            console.log("Faculty appointments response:", response?.data);
            setAppointments(
                getResponseCollection(response?.data, ["appointments"])
                    .map(normalizeAppointment)
                    .filter(Boolean)
            );
        } catch (error) {
            console.error("Failed to load faculty appointments", error);
            setAppointments([]);
        } finally {
            setLoadingAppointments(false);
        }
    };

    const fetchStudents = async () => {
        try {
            setLoadingStudents(true);
            const response = await api.get("/api/faculty/students");

            setStudents(
                getResponseCollection(response?.data, ["students"])
                    .map((student) => toSafeObject(student))
                    .filter(Boolean)
            );
        } catch (error) {
            console.error("Failed to load faculty students", error);
            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    // Approve or reject a single student appointment
    const updateAppointmentStatus = async (appointmentId, status) => {
        const endpoint =
            status === "approved"
                ? `/api/appointments/${appointmentId}/approve`
                : `/api/appointments/${appointmentId}/reject`;

        try {
            const response = await api.patch(endpoint);

            setAppointmentMessage(response.data.message);
            await fetchAppointments();
        } catch (error) {
            setAppointmentMessage(
                error.response?.data?.message || "Failed to update appointment"
            );
        }
    };

    // Approve or reject all appointments at once
    const handleAllAppointmentsAction = async (status) => {
        const canManage =
            status === "approved" ? canApproveAppointment : canRejectAppointment;
        const appointmentIds = appointments
            .filter(canManage)
            .map((appointment) => appointment._id)
            .filter(Boolean);

        if (appointmentIds.length === 0) {
            setAppointmentMessage(
                status === "approved"
                    ? "No appointments are available to accept."
                    : "No appointments are available to reject."
            );
            return;
        }

        const isApproveAction = status === "approved";
        const confirmed = window.confirm(
            isApproveAction
                ? "Are you sure you want to accept all your appointments?"
                : "Are you sure you want to reject all your appointments?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await api.patch(
                isApproveAction
                    ? "/api/appointments/faculty/approve-all"
                    : "/api/appointments/faculty/reject-all"
            );

            setAppointmentMessage(response.data.message);
            await fetchAppointments();
        } catch (error) {
            setAppointmentMessage(
                error.response?.data?.message ||
                `Failed to ${isApproveAction ? "accept" : "reject"} all appointments`
            );
        }
    };

    const handleSelectedStudentAppointmentsAction = async (status) => {
        if (!selectedStudentId) {
            return;
        }

        const isApproveAction = status === "approved";
        const confirmed = window.confirm(
            isApproveAction
                ? "Do you want to accept all pending requests?"
                : "Do you want to reject all pending requests?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await api.patch(
                isApproveAction
                    ? `/api/appointments/faculty/student/${selectedStudentId}/approve-all-pending`
                    : `/api/appointments/faculty/student/${selectedStudentId}/reject-all-pending`
            );

            setAppointmentMessage(response.data.message);
            await fetchAppointments();
            await fetchStudents();
        } catch (error) {
            setAppointmentMessage(
                error.response?.data?.message ||
                `Failed to ${isApproveAction ? "accept" : "reject"} pending appointments`
            );
        }
    };

    const fetchAvailabilitySlots = async () => {
        try {
            setLoadingAvailability(true);
            const response = await api.get("/api/faculty/availability");

            setAvailabilitySlots(
                getResponseCollection(response?.data, ["slots", "availability"])
                    .map(normalizeAvailabilitySlot)
                    .filter(Boolean)
            );
        } catch (error) {
            console.error("Failed to load availability slots", error);
            setAvailabilitySlots([]);
        } finally {
            setLoadingAvailability(false);
        }
    };

    const fetchNotifications = async () => {
        try {
            setLoadingNotifications(true);
            const response = await api.get("/api/notifications/my");

            setNotifications(
                getResponseCollection(response?.data, ["notifications"])
                    .map(normalizeNotification)
                    .filter(Boolean)
            );
        } catch (error) {
            console.error("Failed to load faculty notifications", error);
            setNotifications([]);
        } finally {
            setLoadingNotifications(false);
        }
    };

    const fetchUnreadCount = async () => {
        try {
            const response = await api.get("/api/notifications/unread-count");

            setUnreadCount(response.data?.count || 0);
        } catch (error) {
            console.error("Failed to load unread notification count", error);
        }
    };

    const markNotificationsAsRead = async () => {
        try {
            await api.patch("/api/notifications/mark-read");
            setUnreadCount(0);
        } catch (error) {
            console.error("Failed to mark notifications as read", error);
        }
    };

    const handleNotificationsClick = async () => {
        setActiveSection("notifications");
        await markNotificationsAsRead();
        await fetchNotifications();
    };

    const fetchProfile = async () => {
        try {
            setLoadingProfile(true);
            const response = await api.get("/api/faculty/profile");
            console.log("Faculty profile response:", response?.data);
            setProfileForm(getProfileResponseState(response?.data));
        } catch (error) {
            console.error("Failed to load faculty profile", error);
            setProfileForm(getProfileFormState(user));
        } finally {
            setLoadingProfile(false);
        }
    };

    const handleModeChange = (mode) => {
        setSlotModes((currentModes) =>
            currentModes.includes(mode)
                ? currentModes.filter((item) => item !== mode)
                : [...currentModes, mode]
        );
    };

    const handleEditModeChange = (mode) => {
        setEditModes((currentModes) =>
            currentModes.includes(mode)
                ? currentModes.filter((item) => item !== mode)
                : [...currentModes, mode]
        );
    };

    const handleDayChange = (day) => {
        setSlotDays((currentDays) =>
            currentDays.includes(day)
                ? currentDays.filter((item) => item !== day)
                : [...currentDays, day]
        );
    };

    const handlePeriodChange = (period) => {
        setSlotPeriods((currentPeriods) =>
            currentPeriods.includes(period)
                ? currentPeriods.filter((item) => item !== period)
                : [...currentPeriods, period]
        );
    };

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        const nextValue =
            name === "phoneNumber" ? sanitizePhoneNumber(value) : value;

        setProfileForm((currentProfile) => ({
            ...currentProfile,
            [name]: nextValue,
        }));
        setProfileMessage("");
        setProfileMessageType("");
    };

    const handleProfileImageFileChange = (e) => {
        const nextFile = e.target.files?.[0] || null;

        setProfileImageFile(nextFile);
        setProfileMessage("");
        setProfileMessageType("");
    };

    const resetEditState = () => {
        setEditingSlotId(null);
        setEditPeriod("");
        setEditModes([]);
        setEditCapacity(1);
    };

    const handleStartEditSlot = (slot) => {
        setEditingSlotId(slot?._id || null);
        setEditPeriod(slot?.period || "");
        setEditModes(toSafeArray(slot?.availableModes));
        setEditCapacity(slot?.capacity != null ? slot.capacity : 1);
    };

    const handleCancelEditSlot = () => {
        resetEditState();
    };

    // Save new availability slots (days + time periods + modes) for students to see and book
    const handleCreateAvailabilitySlot = async (e) => {
        e.preventDefault();

        try {
            const response = await api.post(
                "/api/faculty/availability",
                {
                    days: slotDays,
                    periods: slotPeriods,
                    availableModes: slotModes,
                }
            );

            setAvailabilityMessage(response.data.message);
            setSlotDays([]);
            setSlotPeriods([]);
            setSlotModes([]);
            resetEditState();
            await fetchAvailabilitySlots();
        } catch (error) {
            setAvailabilityMessage(
                error.response?.data?.message || "Failed to create availability slot"
            );
        }
    };

    const handleSaveAvailabilitySlot = async (slotId) => {
        try {
            const response = await api.put(
                `/api/faculty/availability/${slotId}`,
                {
                    period: editPeriod,
                    availableModes: editModes,
                    capacity: editCapacity,
                }
            );

            setAvailabilityMessage(response.data.message);
            resetEditState();
            await fetchAvailabilitySlots();
        } catch (error) {
            setAvailabilityMessage(
                error.response?.data?.message || "Failed to update availability slot"
            );
        }
    };

    const handleSetDayCapacity = async (day) => {
        const value = dayCapacityInputs[day];

        if (!value || isNaN(parseInt(value, 10))) {
            setDayCapacityMessage((prev) => ({ ...prev, [day]: "Please enter a valid capacity." }));
            return;
        }

        try {
            const response = await api.patch(
                `/api/faculty/availability/day/${encodeURIComponent(day)}/capacity`,
                { capacity: parseInt(value, 10) }
            );

            setDayCapacityMessage((prev) => ({ ...prev, [day]: response.data.message }));
            await fetchAvailabilitySlots();
        } catch (error) {
            setDayCapacityMessage((prev) => ({
                ...prev,
                [day]: error.response?.data?.message || "Failed to update capacity",
            }));
        }
    };

    const handleDeleteAllAvailabilitySlots = async () => {
        try {
            const response = await api.delete("/api/faculty/availability");

            setAvailabilityMessage(response.data.message);
            resetEditState();
            await fetchAvailabilitySlots();
        } catch (error) {
            setAvailabilityMessage(
                error.response?.data?.message || "Failed to delete availability slots"
            );
        }
    };

    const handleDeleteAvailabilityDay = async (day) => {
        try {
            const response = await api.delete(
                `/api/faculty/availability/day/${encodeURIComponent(day)}`
            );

            setAvailabilityMessage(response.data.message);
            resetEditState();
            await fetchAvailabilitySlots();
        } catch (error) {
            setAvailabilityMessage(
                error.response?.data?.message || "Failed to delete day availability"
            );
        }
    };

    // Remove a specific availability slot from the faculty's schedule
    const handleDeleteAvailabilitySlot = async (slotId) => {
        try {
            const response = await api.delete(`/api/faculty/availability/${slotId}`);

            setAvailabilityMessage(response.data.message);
            if (editingSlotId === slotId) {
                resetEditState();
            }
            await fetchAvailabilitySlots();
        } catch (error) {
            setAvailabilityMessage(
                error.response?.data?.message || "Failed to delete availability slot"
            );
        }
    };

    // Send a report or message to the admin
    const handleCreateReport = async (e) => {
        e.preventDefault();

        try {
            const response = await api.post(
                "/api/notifications/faculty-report",
                {
                    title: reportTitle,
                    message: reportMessage,
                }
            );

            setNotificationMessage(response.data.message);
            setReportTitle("");
            setReportMessage("");
        } catch (error) {
            setNotificationMessage(
                error.response?.data?.message || "Failed to send report"
            );
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();

        if (!isValidOptionalPhoneNumber(profileForm.phoneNumber)) {
            setProfileMessage(PHONE_VALIDATION_MESSAGE);
            setProfileMessageType("error");
            return;
        }

        if (!isValidOptionalEmail(profileForm.contactEmail)) {
            setProfileMessage(CONTACT_EMAIL_VALIDATION_MESSAGE);
            setProfileMessageType("error");
            return;
        }

        try {
            const response = await api.put(
                "/api/faculty/profile",
                {
                    fullName: profileForm.fullName,
                    major: profileForm.major,
                    phoneNumber: profileForm.phoneNumber,
                    contactEmail: profileForm.contactEmail,
                }
            );

            setProfileMessage(response.data.message);
            setProfileMessageType("success");
            setProfileForm((currentProfile) => ({
                ...currentProfile,
                ...response.data.user,
            }));
            onUserUpdate?.({
                ...user,
                ...response.data.user,
            });
        } catch (error) {
            setProfileMessage(
                error.response?.data?.message || "Failed to update profile"
            );
            setProfileMessageType("error");
        }
    };

    const handleUploadProfileImage = async () => {
        if (!profileImageFile) {
            setProfileMessage("Please choose an image to upload.");
            setProfileMessageType("error");
            return;
        }

        try {
            setIsUploadingProfileImage(true);
            setProfileMessage("");
            setProfileMessageType("");

            const formData = new FormData();
            formData.append("profileImage", profileImageFile);

            const response = await api.patch("/api/users/me/profile-image", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            const updatedUser = response.data?.user;

            if (!updatedUser) {
                throw new Error("Updated profile was not returned");
            }

            setProfileForm((currentProfile) => ({
                ...currentProfile,
                fullName: updatedUser.fullName ?? currentProfile.fullName,
                email: updatedUser.email ?? currentProfile.email,
                profileImage: updatedUser.profileImage ?? "",
                displayName: updatedUser.displayName ?? currentProfile.displayName,
                major: updatedUser.major ?? currentProfile.major,
                building: updatedUser.building ?? currentProfile.building,
                room: updatedUser.room ?? currentProfile.room,
                phoneNumber: sanitizePhoneNumber(
                    updatedUser.phoneNumber ?? currentProfile.phoneNumber
                ),
                contactEmail:
                    updatedUser.contactEmail ?? currentProfile.contactEmail,
            }));
            setProfileImageFile(null);
            setProfileMessage(
                response.data?.message || "Profile image uploaded successfully."
            );
            setProfileMessageType("success");
            onUserUpdate?.(updatedUser);
        } catch (error) {
            setProfileMessage(
                error.response?.data?.message || "Failed to upload profile image."
            );
            setProfileMessageType("error");
        } finally {
            setIsUploadingProfileImage(false);
        }
    };

    const openCancelModal = (appointment) => {
        setCancelModalAppointment(appointment);
        setCancelReason("");
        setCancelMessage("");
    };

    const closeCancelModal = () => {
        setCancelModalAppointment(null);
        setCancelReason("");
        setCancelMessage("");
    };

    const handleCancelAppointment = async () => {
        if (!cancelModalAppointment) return;

        const trimmedReason = cancelReason.trim();

        if (!trimmedReason) {
            setCancelMessage("Please provide a cancellation reason.");
            return;
        }

        try {
            setIsCancelling(true);
            setCancelMessage("");

            await api.patch(`/api/appointments/${cancelModalAppointment._id}/cancel`, {
                reason: trimmedReason,
            });

            closeCancelModal();
            setAppointmentMessage("Appointment cancelled successfully.");
            await fetchAppointments();
        } catch (error) {
            setCancelMessage(
                error.response?.data?.message || "Failed to cancel appointment."
            );
        } finally {
            setIsCancelling(false);
        }
    };

    const openRescheduleModal = (appointment) => {
        setRescheduleModalAppointment(appointment);
        setRescheduleReason("");
        setRescheduleSelectedSlotId("");
        setRescheduleMode("");
        setRescheduleDate("");
        setRescheduleMessage("");
    };

    const closeRescheduleModal = () => {
        setRescheduleModalAppointment(null);
        setRescheduleReason("");
        setRescheduleSelectedSlotId("");
        setRescheduleMode("");
        setRescheduleDate("");
        setRescheduleMessage("");
    };

    const handleRescheduleSelectSlot = (slot) => {
        setRescheduleSelectedSlotId(slot._id);
        setRescheduleMode(toSafeArray(slot.availableModes)[0] || "");

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const slotDayIdx = weekDays.indexOf(slot.day);

        if (slotDayIdx !== -1) {
            const offset = (slotDayIdx - today.getDay() + 7) % 7;
            const slotDate = new Date(today);
            slotDate.setDate(today.getDate() + offset);
            setRescheduleDate(
                slotDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                })
            );
        }
    };

    const handleRescheduleAppointment = async () => {
        if (!rescheduleModalAppointment) return;

        const trimmedReason = rescheduleReason.trim();

        if (!trimmedReason) {
            setRescheduleMessage("Please provide a reschedule reason.");
            return;
        }

        if (!rescheduleSelectedSlotId) {
            setRescheduleMessage("Please select a new time slot.");
            return;
        }

        if (!rescheduleMode) {
            setRescheduleMessage("Please select a mode.");
            return;
        }

        const selectedSlot = safeAvailabilitySlots.find((s) => s._id === rescheduleSelectedSlotId);

        if (!selectedSlot) {
            setRescheduleMessage("Selected slot not found.");
            return;
        }

        try {
            setIsRescheduling(true);
            setRescheduleMessage("");

            await api.patch(`/api/appointments/${rescheduleModalAppointment._id}/reschedule`, {
                slotId: selectedSlot.slotId || rescheduleSelectedSlotId,
                date: rescheduleDate,
                time: selectedSlot.period,
                mode: rescheduleMode,
                reason: trimmedReason,
            });

            closeRescheduleModal();
            setAppointmentMessage("Appointment rescheduled successfully.");
            await fetchAppointments();
        } catch (error) {
            setRescheduleMessage(
                error.response?.data?.message || "Failed to reschedule appointment."
            );
        } finally {
            setIsRescheduling(false);
        }
    };

    const loadAppointments = useEffectEvent(fetchAppointments);
    const loadStudents = useEffectEvent(fetchStudents);
    const loadAvailabilitySlots = useEffectEvent(fetchAvailabilitySlots);
    const loadNotifications = useEffectEvent(fetchNotifications);
    const loadProfile = useEffectEvent(fetchProfile);
    const loadUnreadCount = useEffectEvent(fetchUnreadCount);

    useEffect(() => {
        if (user?.id) {
            loadAppointments();
            loadStudents();
            loadAvailabilitySlots();
            loadNotifications();
            loadProfile();
            loadUnreadCount();
        } else {
            setLoadingAppointments(false);
            setLoadingStudents(false);
            setLoadingAvailability(false);
            setLoadingNotifications(false);
            setLoadingProfile(false);
        }
    }, [user?.id]);

    useEffect(() => {
        if (user?.id && activeSection === "notifications") {
            loadNotifications();
        }
    }, [activeSection, user?.id]);

    useEffect(() => {
        if (user?.id && activeSection === "profile") {
            loadProfile();
        }
    }, [activeSection, user?.id]);

    useEffect(() => {
        if (user?.id && activeSection === "students") {
            loadStudents();
            loadAppointments();
        }
    }, [activeSection, user?.id]);

    useEffect(() => {
        if (
            selectedStudentId &&
            !toSafeArray(students).some((student) => student?._id === selectedStudentId)
        ) {
            setSelectedStudentId(null);
        }
    }, [selectedStudentId, students]);

    useEffect(() => {
        if (!user?.id) {
            return undefined;
        }

        const intervalId = window.setInterval(() => {
            loadUnreadCount();
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, [user?.id]);

    useEffect(() => {
        if (!profileImageFile) {
            setProfileImagePreview("");
            return undefined;
        }

        const objectUrl = window.URL.createObjectURL(profileImageFile);
        setProfileImagePreview(objectUrl);

        return () => window.URL.revokeObjectURL(objectUrl);
    }, [profileImageFile]);

    const safeAppointments = toSafeArray(appointments);
    const safeStudents = toSafeArray(students);
    const safeNotifications = toSafeArray(notifications);
    const safeAvailabilitySlots = toSafeArray(availabilitySlots);
    const facultyPreviewName =
        profileForm.fullName || profileForm.displayName || user?.fullName || "Faculty";
    const facultyPreviewMajor = profileForm.major || "Major not provided";
    const facultyPreviewRoom = profileForm.room || "Room not provided";
    const facultyPreviewBuilding = profileForm.building || "Building not provided";
    const facultyPreviewPhone = profileForm.phoneNumber || "Phone not provided";
    const facultyPreviewEmail =
        profileForm.contactEmail || profileForm.email || user?.email || "Email not provided";
    const facultyRoleLabel = formatRoleLabel(user?.role || "faculty");
    const facultyLoginEmail = profileForm.email || user?.email || "";
    const currentFacultyProfileImage =
        profileImagePreview || getProfileImageSrc(profileForm.profileImage);
    const { upcomingAppointments, pastAppointments } = splitAppointmentsByTime(safeAppointments);
    const filteredAppointments = safeAppointments.filter((appointment) =>
        matchesAppointmentSearch(appointment, appointmentSearchTerm)
    );
    const {
        upcomingAppointments: filteredUpcomingAppointments,
        pastAppointments: filteredPastAppointments,
    } = splitAppointmentsByTime(filteredAppointments);
    const recentPastAppointments = pastAppointments.slice(0, 5);
    const selectedAppointment =
        filteredAppointments.find((appointment) => appointment._id === selectedAppointmentId) ||
        null;
    const selectedStudent =
        safeStudents.find((student) => student?._id === selectedStudentId) || null;
    const selectedStudentAppointments = safeAppointments.filter(
        (appointment) => getAppointmentStudentId(appointment) === selectedStudentId
    );
    const {
        upcomingAppointments: selectedStudentUpcomingAppointments,
        pastAppointments: selectedStudentPastAppointments,
    } = splitAppointmentsByTime(selectedStudentAppointments);
    const selectedStudentPendingAppointments = selectedStudentUpcomingAppointments.filter(
        (appointment) => appointment.status === "pending"
    );
    const pendingAppointments = safeAppointments.filter(
        (appointment) => appointment.status === "pending"
    );

    useEffect(() => {
        if (
            selectedAppointmentId &&
            !filteredAppointments.some((appointment) => appointment._id === selectedAppointmentId)
        ) {
            setSelectedAppointmentId(null);
        }
    }, [filteredAppointments, selectedAppointmentId]);

    const groupedAvailability = weekDays
        .map((day) => ({
            day,
            slots: safeAvailabilitySlots
                .filter((slot) => slot?.day === day)
                .sort(
                    (a, b) =>
                        periodOptions.indexOf(a?.period) - periodOptions.indexOf(b?.period)
                ),
        }))
        .filter((group) => group.slots.length > 0);

    const renderAppointmentsTable = (
        appointmentList,
        {
            showActions = true,
            enableDetails = false,
            emptyMessage = "No appointments found.",
        } = {}
    ) => {
        if (loadingAppointments) {
            return <p>Loading appointments...</p>;
        }

        if (appointmentList.length === 0) {
            return <p className="faculty-appointments-empty">{emptyMessage}</p>;
        }

        return (
            <table>
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Mode</th>
                        <th>Topic</th>
                        <th>Status</th>
                        <th>Appointment ID</th>
                        {(showActions || enableDetails) && <th>Action</th>}
                    </tr>
                </thead>
                <tbody>
                    {appointmentList.map((appointment) => (
                        <tr key={appointment._id || appointment.appointmentId}>
                            <td>{appointment.student?.fullName || "Unknown Student"}</td>
                            <td>{appointment.date}</td>
                            <td>{appointment.time}</td>
                            <td>{formatModeLabel(appointment.mode)}</td>
                            <td className="faculty-topic-cell">
                                {appointment.topic || appointment.notes || "No topic provided"}
                            </td>
                            <td>
                                <span
                                    className={`faculty-status ${getFacultyStatusClassName(
                                        appointment.status
                                    )}`}
                                >
                                    {formatStatusLabel(appointment.status)}
                                </span>
                            </td>
                            <td>{getAppointmentDisplayId(appointment)}</td>
                            {(showActions || enableDetails) && (
                                <td>
                                    <div className="faculty-appointment-actions">
                                        {enableDetails && (
                                            <button
                                                type="button"
                                                className={`faculty-view-student-btn ${selectedAppointmentId === appointment._id
                                                        ? "active"
                                                        : ""
                                                    }`}
                                                onClick={() =>
                                                    setSelectedAppointmentId((currentId) =>
                                                        currentId === appointment._id
                                                            ? null
                                                            : appointment._id
                                                    )
                                                }
                                            >
                                                {selectedAppointmentId === appointment._id
                                                    ? "Hide Details"
                                                    : "View Details"}
                                            </button>
                                        )}
                                        {showActions && canApproveAppointment(appointment) && (
                                            <button
                                                type="button"
                                                className="faculty-approve-btn"
                                                onClick={() =>
                                                    updateAppointmentStatus(
                                                        appointment._id,
                                                        "approved"
                                                    )
                                                }
                                            >
                                                Accept
                                            </button>
                                        )}
                                        {showActions && canRejectAppointment(appointment) && (
                                            <button
                                                type="button"
                                                className="faculty-reject-btn"
                                                onClick={() =>
                                                    updateAppointmentStatus(
                                                        appointment._id,
                                                        "rejected"
                                                    )
                                                }
                                            >
                                                Reject
                                            </button>
                                        )}
                                        {showActions &&
                                            appointment.status === "approved" &&
                                            !isPastAppointment(appointment) && (
                                                <>
                                                    <button
                                                        type="button"
                                                        style={{ padding: "0.3rem 0.7rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                                                        onClick={() => openRescheduleModal(appointment)}
                                                    >
                                                        Reschedule
                                                    </button>
                                                    <button
                                                        type="button"
                                                        style={{ padding: "0.3rem 0.7rem", background: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                                                        onClick={() => openCancelModal(appointment)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        {showActions &&
                                            !enableDetails &&
                                            !canApproveAppointment(appointment) &&
                                            !canRejectAppointment(appointment) &&
                                            !(appointment.status === "approved" && !isPastAppointment(appointment)) && (
                                                <span className="faculty-action-placeholder">
                                                    No actions
                                                </span>
                                            )}
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const renderAppointmentGroup = ({
        title,
        appointments: appointmentList,
        showActions = true,
        enableDetails = false,
        emptyMessage,
        headerActions = null,
    }) => (
        <div className="faculty-appointments-group">
            <div className="faculty-appointments-group-header">
                <div className="faculty-appointments-header-group">
                    <h3>{title}</h3>
                    <span className="faculty-appointments-total">
                        {appointmentList.length} appointment
                        {appointmentList.length === 1 ? "" : "s"}
                    </span>
                </div>
                {headerActions && (
                    <div className="faculty-appointments-page-actions">
                        {headerActions}
                    </div>
                )}
            </div>

            {renderAppointmentsTable(appointmentList, {
                showActions,
                enableDetails,
                emptyMessage,
            })}
        </div>
    );

    const renderDashboard = () => (
        <>
            <div className="faculty-stats-grid">
                <div className="faculty-stat-card">
                    <h3>{safeAppointments.length}</h3>
                    <p>Total Appointments</p>
                </div>
                <div className="faculty-stat-card">
                    <h3>{upcomingAppointments.length}</h3>
                    <p>Upcoming Appointments</p>
                </div>
                <div className="faculty-stat-card">
                    <h3>{pendingAppointments.length}</h3>
                    <p>Pending Requests</p>
                </div>
                <div className="faculty-stat-card">
                    <h3>{pastAppointments.length}</h3>
                    <p>Past Appointments</p>
                </div>
            </div>

            <section className="faculty-panel">
                <div className="faculty-panel-header">
                    <h2>My Profile Preview</h2>
                    <span>Visible to students</span>
                </div>

                {loadingProfile ? (
                    <p>Loading profile...</p>
                ) : (
                    <div className="faculty-dashboard-profile-card">
                        {currentFacultyProfileImage ? (
                            <img
                                src={currentFacultyProfileImage}
                                alt={facultyPreviewName}
                                className="faculty-dashboard-profile-image"
                            />
                        ) : (
                            <div className="faculty-dashboard-profile-avatar">
                                {getInitials(facultyPreviewName)}
                            </div>
                        )}

                        <div className="faculty-dashboard-profile-content">
                            <div className="faculty-dashboard-profile-heading">
                                <h3>{facultyPreviewName}</h3>
                                <p>{facultyPreviewMajor}</p>
                            </div>

                            <div className="faculty-dashboard-profile-details">
                                <div className="faculty-dashboard-profile-item">
                                    <strong>Room:</strong>
                                    <span>{facultyPreviewRoom}</span>
                                </div>
                                <div className="faculty-dashboard-profile-item">
                                    <strong>Building:</strong>
                                    <span>{facultyPreviewBuilding}</span>
                                </div>
                                <div className="faculty-dashboard-profile-item">
                                    <strong>Phone:</strong>
                                    <span>{facultyPreviewPhone}</span>
                                </div>
                                <div className="faculty-dashboard-profile-item">
                                    <strong>Role:</strong>
                                    <span>{facultyRoleLabel}</span>
                                </div>
                                <div className="faculty-dashboard-profile-item">
                                    <strong>Contact Email:</strong>
                                    <span>{facultyPreviewEmail}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className="faculty-panel">
                <div className="faculty-panel-header">
                    <h2>Upcoming Appointments</h2>
                    <span onClick={() => setActiveSection("appointments")}>View All</span>
                </div>

                {appointmentMessage && (
                    <p className="faculty-appointment-message">{appointmentMessage}</p>
                )}

                {renderAppointmentsTable(upcomingAppointments, {
                    enableDetails: false,
                    emptyMessage: "No upcoming appointments found.",
                })}
            </section>

            <section className="faculty-panel">
                <div className="faculty-panel-header">
                    <div className="faculty-appointments-header-group">
                        <h2>Past Appointments</h2>
                        <span className="faculty-appointments-total">
                            {recentPastAppointments.length} appointment
                            {recentPastAppointments.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    <span onClick={() => setActiveSection("appointments")}>View All</span>
                </div>

                {renderAppointmentsTable(recentPastAppointments, {
                    showActions: false,
                    enableDetails: false,
                    emptyMessage: "No past appointments found.",
                })}
            </section>

            <section className="faculty-panel">
                <div className="faculty-panel-header">
                    <h2>My Availability</h2>
                    <span onClick={() => setActiveSection("availability")}>Edit</span>
                </div>

                {loadingAvailability ? (
                    <p>Loading availability...</p>
                ) : safeAvailabilitySlots.length === 0 ? (
                    <p>No availability slots found.</p>
                ) : (
                    <ul className="availability-list">
                        {safeAvailabilitySlots.slice(0, 3).map((slot) => (
                            <li key={slot?._id || `${slot?.day}-${slot?.period}`}>
                                {slot?.day} - {slot?.period} -{" "}
                                {toSafeArray(slot?.availableModes).join(", ")}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );

    const renderAppointments = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <div className="faculty-appointments-header-group">
                    <h2>My Appointments</h2>
                    <span className="faculty-appointments-total">
                        {appointmentSearchTerm.trim()
                            ? `${filteredAppointments.length} of ${safeAppointments.length} shown`
                            : `${safeAppointments.length} total`}
                    </span>
                </div>
                <div className="faculty-appointments-page-actions">
                    <button
                        type="button"
                        className="faculty-approve-btn"
                        onClick={() => handleAllAppointmentsAction("approved")}
                    >
                        Accept All
                    </button>
                    <button
                        type="button"
                        className="faculty-reject-btn"
                        onClick={() => handleAllAppointmentsAction("rejected")}
                    >
                        Reject All
                    </button>
                </div>
            </div>

            {appointmentMessage && (
                <p className="faculty-appointment-message">{appointmentMessage}</p>
            )}

            <div className="faculty-search-bar">
                <input
                    type="text"
                    className="faculty-search-input"
                    placeholder="Search by student, email, appointment ID, topic, date, or status"
                    value={appointmentSearchTerm}
                    onChange={(e) => setAppointmentSearchTerm(e.target.value)}
                />
            </div>

            <div className="faculty-appointments-group-stack">
                {renderAppointmentGroup({
                    title: "Upcoming Appointments",
                    appointments: filteredUpcomingAppointments,
                    showActions: true,
                    enableDetails: true,
                    emptyMessage: appointmentSearchTerm.trim()
                        ? "No upcoming appointments match this search."
                        : "No upcoming appointments found.",
                })}
                {renderAppointmentGroup({
                    title: "Past Appointments",
                    appointments: filteredPastAppointments,
                    showActions: false,
                    enableDetails: true,
                    emptyMessage: appointmentSearchTerm.trim()
                        ? "No past appointments match this search."
                        : "No past appointments found.",
                })}
            </div>

            {selectedAppointment && (
                <div className="faculty-selected-appointment-card">
                    <div className="faculty-panel-header">
                        <div className="faculty-appointments-header-group">
                            <h2>Student Appointment Details</h2>
                            <span className="faculty-appointments-total">
                                Appointment ID: {getAppointmentDisplayId(selectedAppointment)}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="faculty-student-close-btn"
                            onClick={() => setSelectedAppointmentId(null)}
                        >
                            Close
                        </button>
                    </div>

                    <div className="faculty-selected-appointment-layout">
                        <div className="faculty-selected-appointment-student">
                            {getProfileImageSrc(selectedAppointment.student?.profileImage) ? (
                                <img
                                    src={getProfileImageSrc(selectedAppointment.student?.profileImage)}
                                    alt={selectedAppointment.student?.fullName || "Student"}
                                    className="faculty-selected-appointment-image"
                                />
                            ) : (
                                <div className="faculty-selected-appointment-avatar">
                                    {getInitials(
                                        selectedAppointment.student?.fullName || "Student"
                                    )}
                                </div>
                            )}

                            <h3>{selectedAppointment.student?.fullName || "Unknown Student"}</h3>
                            <p>
                                {selectedAppointment.student?.contactEmail ||
                                    selectedAppointment.student?.email ||
                                    "Email not provided"}
                            </p>
                            <span>
                                {selectedAppointment.student?.major || "Major not provided"}
                            </span>
                            <span>
                                {selectedAppointment.student?.phoneNumber ||
                                    "Phone not provided"}
                            </span>
                        </div>

                        <div className="faculty-selected-appointment-details">
                            <div className="faculty-selected-appointment-item">
                                <strong>Topic / Notes</strong>
                                <span>
                                    {selectedAppointment.topic ||
                                        selectedAppointment.notes ||
                                        "No topic provided"}
                                </span>
                            </div>
                            <div className="faculty-selected-appointment-item">
                                <strong>Date</strong>
                                <span>
                                    {getAppointmentDate(selectedAppointment) ||
                                        "Date not provided"}
                                </span>
                            </div>
                            <div className="faculty-selected-appointment-item">
                                <strong>Time</strong>
                                <span>{selectedAppointment.time || "Time not provided"}</span>
                            </div>
                            <div className="faculty-selected-appointment-item">
                                <strong>Mode</strong>
                                <span>
                                    {selectedAppointment.mode
                                        ? formatModeLabel(selectedAppointment.mode)
                                        : "Mode not provided"}
                                </span>
                            </div>
                            <div className="faculty-selected-appointment-item">
                                <strong>Status</strong>
                                <span>{formatStatusLabel(selectedAppointment.status)}</span>
                            </div>
                            <div className="faculty-selected-appointment-item">
                                <strong>Contact Email</strong>
                                <span>
                                    {selectedAppointment.student?.contactEmail ||
                                        selectedAppointment.student?.email ||
                                        "Email not provided"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );

    const renderAvailability = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <h2>My Availability</h2>
                <span>{safeAvailabilitySlots.length} slots</span>
            </div>

            <form className="availability-form" onSubmit={handleCreateAvailabilitySlot}>
                <div className="availability-checkbox-group">
                    <p className="availability-checkbox-title">Days</p>
                    <div className="availability-checkbox-list">
                        {weekDays.map((day) => (
                            <label key={day} className="availability-checkbox">
                                <input
                                    type="checkbox"
                                    checked={slotDays.includes(day)}
                                    onChange={() => handleDayChange(day)}
                                />
                                {day}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="availability-checkbox-group">
                    <p className="availability-checkbox-title">Periods</p>
                    <div className="availability-checkbox-list">
                        {periodOptions.map((period) => (
                            <label key={period} className="availability-checkbox">
                                <input
                                    type="checkbox"
                                    checked={slotPeriods.includes(period)}
                                    onChange={() => handlePeriodChange(period)}
                                />
                                {period}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="availability-checkbox-group">
                    <p className="availability-checkbox-title">Modes</p>
                    <div className="availability-checkbox-list">
                        {modeOptions.map((mode) => (
                            <label key={mode.value} className="availability-checkbox">
                                <input
                                    type="checkbox"
                                    checked={slotModes.includes(mode.value)}
                                    onChange={() => handleModeChange(mode.value)}
                                />
                                {mode.label}
                            </label>
                        ))}
                    </div>
                </div>

                <button type="submit">Add Slot</button>
            </form>

            <div className="availability-actions">
                <button
                    type="button"
                    className="availability-delete-all-btn"
                    onClick={handleDeleteAllAvailabilitySlots}
                >
                    Delete All
                </button>
            </div>

            {availabilityMessage && (
                <p className="availability-message">{availabilityMessage}</p>
            )}

            {loadingAvailability ? (
                <p>Loading availability...</p>
            ) : safeAvailabilitySlots.length === 0 ? (
                <p>No availability slots found.</p>
            ) : (
                <div className="availability-groups">
                    {groupedAvailability.map((group) => (
                        <div className="availability-day-card" key={group.day}>
                            <div className="availability-day-header">
                                <h3>{group.day}</h3>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <input
                                        type="number"
                                        min={1}
                                        style={{ width: "60px", padding: "0.25rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                                        placeholder="Cap"
                                        value={dayCapacityInputs[group.day] || ""}
                                        onChange={(e) => setDayCapacityInputs((prev) => ({ ...prev, [group.day]: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        style={{ padding: "0.3rem 0.6rem", borderRadius: "4px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: "0.8rem" }}
                                        onClick={() => handleSetDayCapacity(group.day)}
                                    >
                                        Set All
                                    </button>
                                    <button
                                        type="button"
                                        className="delete-day-btn"
                                        onClick={() => handleDeleteAvailabilityDay(group.day)}
                                    >
                                        Delete Day
                                    </button>
                                </div>
                            </div>
                            {dayCapacityMessage[group.day] && (
                                <p style={{ fontSize: "0.8rem", color: "#374151", margin: "0.25rem 0" }}>{dayCapacityMessage[group.day]}</p>
                            )}

                            {group.slots.map((slot) => (
                                <div className="availability-period-row" key={slot._id}>
                                    {editingSlotId === slot._id ? (
                                        <>
                                            <div className="availability-period-details">
                                                <select
                                                    className="availability-edit-select"
                                                    value={editPeriod}
                                                    onChange={(e) => setEditPeriod(e.target.value)}
                                                >
                                                    {periodOptions.map((period) => (
                                                        <option key={period} value={period}>
                                                            {period}
                                                        </option>
                                                    ))}
                                                </select>

                                                <div className="availability-inline-modes">
                                                    {modeOptions.map((mode) => (
                                                        <label key={mode.value} className="availability-checkbox">
                                                            <input
                                                                type="checkbox"
                                                                checked={editModes.includes(mode.value)}
                                                                onChange={() => handleEditModeChange(mode.value)}
                                                            />
                                                            {mode.label}
                                                        </label>
                                                    ))}
                                                </div>

                                                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem" }}>
                                                    Capacity:
                                                    <input
                                                        type="number"
                                                        min={slot.bookedCount || 1}
                                                        style={{ width: "60px", padding: "0.25rem", borderRadius: "4px", border: "1px solid #d1d5db" }}
                                                        value={editCapacity}
                                                        onChange={(e) => setEditCapacity(parseInt(e.target.value, 10) || 1)}
                                                    />
                                                </label>
                                            </div>

                                            <div className="availability-row-actions">
                                                <button
                                                    type="button"
                                                    className="save-slot-btn"
                                                    onClick={() => handleSaveAvailabilitySlot(slot._id)}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    className="cancel-slot-btn"
                                                    onClick={handleCancelEditSlot}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="availability-period-details">
                                                <span className="availability-period-value">{slot.period}</span>
                                                <span>{toSafeArray(slot?.availableModes).join(", ")}</span>
                                                <span style={{ fontSize: "0.85rem", color: (slot.bookedCount || 0) >= (slot.capacity || 1) ? "#dc2626" : "#6b7280" }}>
                                                    {slot.bookedCount || 0} / {slot.capacity || 1} booked
                                                </span>
                                            </div>

                                            <div className="availability-row-actions">
                                                <button
                                                    type="button"
                                                    className="edit-slot-btn"
                                                    onClick={() => handleStartEditSlot(slot)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="availability-delete-btn"
                                                    onClick={() => handleDeleteAvailabilitySlot(slot._id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    const renderStudents = () => (
        <>
            <section className="faculty-panel">
                <div className="faculty-panel-header">
                    <div className="faculty-appointments-header-group">
                        <h2>My Students</h2>
                        <span className="faculty-appointments-total">
                            {safeStudents.length} student{safeStudents.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </div>

                {loadingStudents ? (
                    <p>Loading students...</p>
                ) : safeStudents.length === 0 ? (
                    <p>No students have booked appointments with you yet.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Student Name</th>
                                <th>Contact Email</th>
                                <th>Course / Major</th>
                                <th>Appointments</th>
                                <th>Last Appointment</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {safeStudents.map((student) => (
                                <tr key={student?._id || student?.email || student?.name}>
                                    <td>{student?.name}</td>
                                    <td>{student?.contactEmail || student?.email || "Not provided"}</td>
                                    <td>{student?.course || "Not provided"}</td>
                                    <td>{student?.appointmentCount}</td>
                                    <td>{student?.lastAppointmentDate || "Not available"}</td>
                                    <td className="faculty-student-action-cell">
                                        <button
                                            type="button"
                                            className={`faculty-view-student-btn ${selectedStudentId === student?._id ? "active" : ""
                                                }`}
                                            onClick={() =>
                                                setSelectedStudentId((currentStudentId) =>
                                                    currentStudentId === student?._id
                                                        ? null
                                                        : student?._id || null
                                                )
                                            }
                                        >
                                            View Appointments
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {selectedStudent && (
                <section className="faculty-panel">
                    <div className="faculty-panel-header">
                        <div className="faculty-appointments-header-group">
                            <h2>{selectedStudent.name}</h2>
                            <span className="faculty-appointments-total">
                                {selectedStudent.appointmentCount} appointment
                                {selectedStudent.appointmentCount === 1 ? "" : "s"} with you
                            </span>
                        </div>
                        <button
                            type="button"
                            className="faculty-student-close-btn"
                            onClick={() => setSelectedStudentId(null)}
                        >
                            Close
                        </button>
                    </div>

                    <div className="faculty-student-summary">
                        <div className="faculty-student-summary-item">
                            <strong>Contact Email</strong>
                            <span>
                                {selectedStudent.contactEmail ||
                                    selectedStudent.email ||
                                    "Not provided"}
                            </span>
                        </div>
                        <div className="faculty-student-summary-item">
                            <strong>Course / Major</strong>
                            <span>{selectedStudent.course || "Not provided"}</span>
                        </div>
                        <div className="faculty-student-summary-item">
                            <strong>Total Appointments</strong>
                            <span>{selectedStudent.appointmentCount}</span>
                        </div>
                        <div className="faculty-student-summary-item">
                            <strong>Last Appointment</strong>
                            <span>{selectedStudent.lastAppointmentDate || "Not available"}</span>
                        </div>
                    </div>

                    {appointmentMessage && (
                        <p className="faculty-appointment-message">{appointmentMessage}</p>
                    )}

                    <div className="faculty-appointments-group-stack">
                        {renderAppointmentGroup({
                            title: "Upcoming Appointments",
                            appointments: selectedStudentUpcomingAppointments,
                            showActions: true,
                            emptyMessage: `No upcoming appointments found for ${selectedStudent.name}.`,
                            headerActions: (
                                <>
                                    <button
                                        type="button"
                                        className="faculty-approve-btn"
                                        onClick={() =>
                                            handleSelectedStudentAppointmentsAction(
                                                "approved"
                                            )
                                        }
                                        disabled={
                                            loadingAppointments ||
                                            selectedStudentPendingAppointments.length === 0
                                        }
                                    >
                                        Accept All
                                    </button>
                                    <button
                                        type="button"
                                        className="faculty-reject-btn"
                                        onClick={() =>
                                            handleSelectedStudentAppointmentsAction(
                                                "rejected"
                                            )
                                        }
                                        disabled={
                                            loadingAppointments ||
                                            selectedStudentPendingAppointments.length === 0
                                        }
                                    >
                                        Reject All
                                    </button>
                                </>
                            ),
                        })}
                        {renderAppointmentGroup({
                            title: "Past Appointments",
                            appointments: selectedStudentPastAppointments,
                            showActions: false,
                            emptyMessage: `No past appointments found for ${selectedStudent.name}.`,
                        })}
                    </div>
                </section>
            )}
        </>
    );

    const renderNotifications = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <h2>Notifications</h2>
            </div>

            {loadingNotifications ? (
                <p>Loading notifications...</p>
            ) : safeNotifications.length === 0 ? (
                <p>No notifications found.</p>
            ) : (
                <div className="notification-list">
                    {safeNotifications.map((notification) => (
                        <div
                            className="notification-card"
                            key={notification?._id || notification?.createdAt || notification?.title}
                        >
                            <div className="notification-card-header">
                                <h3>{notification?.title}</h3>
                                <span>
                                    {notification?.createdAt
                                        ? new Date(notification.createdAt).toLocaleString()
                                        : ""}
                                </span>
                            </div>
                            <p>{notification?.message}</p>
                            <div className="notification-meta">
                                <span>
                                    From: {notification?.sender?.fullName || "Unknown sender"}
                                </span>
                                {notification?.appointment?.appointmentId && (
                                    <span>
                                        Appointment: {notification.appointment.appointmentId}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    const renderReports = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <h2>Reports</h2>
            </div>

            <form className="report-form" onSubmit={handleCreateReport}>
                <h3>Create Report</h3>
                <input
                    type="text"
                    placeholder="Report title"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                />
                <textarea
                    placeholder="Report message"
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    rows={4}
                />
                <button type="submit">Send Report</button>
            </form>

            {notificationMessage && (
                <p className="notification-message">{notificationMessage}</p>
            )}
        </section>
    );

    const renderProfile = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <h2>Public Profile</h2>
                <span>Visible to students</span>
            </div>

            {loadingProfile ? (
                <p>Loading profile...</p>
            ) : (
                <div className="faculty-profile-layout">
                    <div className="faculty-profile-preview">
                        {currentFacultyProfileImage ? (
                            <img
                                src={currentFacultyProfileImage}
                                alt={facultyPreviewName}
                                className="faculty-profile-image"
                            />
                        ) : (
                            <div className="faculty-profile-avatar">
                                {getInitials(facultyPreviewName)}
                            </div>
                        )}

                        <h3>{facultyPreviewName}</h3>
                        <p>{profileForm.major || "Add your department or major"}</p>
                        <span>Role: {facultyRoleLabel}</span>
                        <span>{facultyPreviewEmail}</span>
                        <span>
                            {[profileForm.building, profileForm.room].filter(Boolean).join(", ") ||
                                "Add your office location"}
                        </span>
                        <span>{profileForm.phoneNumber || "Add a phone number"}</span>

                        <div className="faculty-profile-upload-box">
                            <label className="faculty-profile-upload-field">
                                <span>Choose image from your PC</span>
                                <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                    onChange={handleProfileImageFileChange}
                                />
                            </label>
                            <button
                                type="button"
                                className="faculty-profile-upload-btn"
                                onClick={handleUploadProfileImage}
                                disabled={isUploadingProfileImage}
                            >
                                {isUploadingProfileImage ? "Uploading Image..." : "Upload Image"}
                            </button>
                        </div>
                    </div>

                    <form className="faculty-profile-form" onSubmit={handleSaveProfile}>
                        <div className="faculty-profile-grid">
                            <label className="faculty-profile-field">
                                <span>Full name</span>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={profileForm.fullName}
                                    onChange={handleProfileChange}
                                    placeholder="Enter your full name"
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Login email</span>
                                <input
                                    type="email"
                                    value={facultyLoginEmail}
                                    readOnly
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Major / Department</span>
                                <input
                                    type="text"
                                    name="major"
                                    value={profileForm.major}
                                    onChange={handleProfileChange}
                                    placeholder="Computer Science"
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Phone number</span>
                                <input
                                    type="text"
                                    name="phoneNumber"
                                    value={profileForm.phoneNumber}
                                    onChange={handleProfileChange}
                                    inputMode="numeric"
                                    maxLength={10}
                                    placeholder="05XXXXXXXX"
                                />
                            </label>

                            <label className="faculty-profile-field faculty-profile-field-wide">
                                <span>Contact email</span>
                                <input
                                    type="email"
                                    name="contactEmail"
                                    value={profileForm.contactEmail}
                                    onChange={handleProfileChange}
                                    placeholder={facultyLoginEmail || "officehours@example.com"}
                                />
                            </label>
                        </div>

                        {profileMessage && (
                            <p
                                className={`faculty-profile-message ${profileMessageType || "success"
                                    }`}
                            >
                                {profileMessage}
                            </p>
                        )}

                        <button type="submit" className="faculty-profile-save-btn">
                            Save Profile
                        </button>
                    </form>
                </div>
            )}
        </section>
    );

    const getTitle = () => {
        if (activeSection === "appointments") return "My Appointments";
        if (activeSection === "availability") return "Availability";
        if (activeSection === "profile") return "Profile";
        if (activeSection === "reports") return "Reports";
        if (activeSection === "students") return "Students";
        if (activeSection === "notifications") return "Notifications";
        return "Faculty Dashboard";
    };

    return (
        <div className="faculty-layout">
            <aside className="faculty-sidebar">
                <div className="faculty-sidebar-logo">
                    <img src={logo} alt="Office Hours Logo" className="faculty-sidebar-logo-img" />
                </div>

                <nav className="faculty-sidebar-menu faculty-sidebar-nav">
                    <button
                        className={`faculty-menu-item ${activeSection === "dashboard" ? "active" : ""}`}
                        onClick={() => setActiveSection("dashboard")}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "appointments" ? "active" : ""}`}
                        onClick={() => setActiveSection("appointments")}
                    >
                        My Appointments
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "availability" ? "active" : ""}`}
                        onClick={() => setActiveSection("availability")}
                    >
                        Availability
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "profile" ? "active" : ""}`}
                        onClick={() => setActiveSection("profile")}
                    >
                        Profile
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "students" ? "active" : ""}`}
                        onClick={() => setActiveSection("students")}
                    >
                        Students
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "reports" ? "active" : ""}`}
                        onClick={() => setActiveSection("reports")}
                    >
                        Reports
                    </button>
                    <button
                        className={`faculty-menu-item ${activeSection === "notifications" ? "active" : ""}`}
                        onClick={handleNotificationsClick}
                    >
                        <span className="faculty-menu-item-label">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="notification-badge">{unreadCount}</span>
                        )}
                    </button>
                </nav>


                <button className="faculty-logout-btn" onClick={onLogout}>
                    Logout
                </button>
            </aside>

            <main className="faculty-dashboard-content">
                <div className="faculty-topbar">
                    <h1>{getTitle()}</h1>
                    <div className="faculty-badge">
                        {profileForm.displayName || profileForm.fullName || user?.fullName || "Faculty"}
                    </div>
                </div>

                {activeSection === "dashboard" && renderDashboard()}
                {activeSection === "appointments" && renderAppointments()}
                {activeSection === "availability" && renderAvailability()}
                {activeSection === "profile" && renderProfile()}
                {activeSection === "students" && renderStudents()}
                {activeSection === "reports" && renderReports()}
                {activeSection === "notifications" && renderNotifications()}
            </main>

            {/* Cancel modal */}
            {cancelModalAppointment && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: "10px", padding: "1.5rem", width: "100%", maxWidth: "440px" }}>
                        <h3 style={{ margin: "0 0 0.75rem" }}>Cancel Appointment</h3>
                        <p style={{ fontSize: "0.9rem", color: "#374151", marginBottom: "1rem" }}>
                            {cancelModalAppointment.date} at {cancelModalAppointment.time} — {cancelModalAppointment.student?.fullName || "Student"}
                        </p>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                            Reason <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea
                            rows={4}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical", boxSizing: "border-box" }}
                            placeholder="Please explain why you are cancelling..."
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                        />
                        {cancelMessage && <p style={{ color: "#dc2626", marginTop: "0.5rem", fontSize: "0.875rem" }}>{cancelMessage}</p>}
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end" }}>
                            <button type="button" onClick={closeCancelModal} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}>
                                Back
                            </button>
                            <button type="button" onClick={handleCancelAppointment} disabled={isCancelling} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer" }}>
                                {isCancelling ? "Cancelling..." : "Confirm Cancel"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule modal */}
            {rescheduleModalAppointment && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: "10px", padding: "1.5rem", width: "100%", maxWidth: "520px", maxHeight: "85vh", overflowY: "auto" }}>
                        <h3 style={{ margin: "0 0 0.75rem" }}>Reschedule Appointment</h3>
                        <p style={{ fontSize: "0.9rem", color: "#374151", marginBottom: "1rem" }}>
                            Current: {rescheduleModalAppointment.date} at {rescheduleModalAppointment.time} — {rescheduleModalAppointment.student?.fullName || "Student"}
                        </p>

                        {loadingAvailability ? (
                            <p>Loading available slots...</p>
                        ) : safeAvailabilitySlots.length === 0 ? (
                            <p style={{ color: "#6b7280" }}>No availability slots configured.</p>
                        ) : (
                            <>
                                <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Select a new slot:</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                                    {safeAvailabilitySlots.map((slot) => {
                                        const capacity = slot.capacity != null ? slot.capacity : 1;
                                        const booked = slot.bookedCount != null ? slot.bookedCount : 0;
                                        const remaining = Math.max(0, capacity - booked);
                                        const isSelected = rescheduleSelectedSlotId === slot._id;
                                        return (
                                            <button
                                                key={slot._id}
                                                type="button"
                                                onClick={() => handleRescheduleSelectSlot(slot)}
                                                style={{
                                                    padding: "0.6rem 0.9rem",
                                                    borderRadius: "6px",
                                                    border: isSelected ? "2px solid #2563eb" : "1px solid #d1d5db",
                                                    background: isSelected ? "#eff6ff" : "#f9fafb",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                            >
                                                <strong>{slot.day} — {slot.period}</strong>
                                                <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
                                                    {toSafeArray(slot.availableModes).map(formatModeLabel).join(", ")} · {remaining} seat{remaining === 1 ? "" : "s"} left
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {rescheduleSelectedSlotId && (() => {
                                    const sel = safeAvailabilitySlots.find(s => s._id === rescheduleSelectedSlotId);
                                    return sel && toSafeArray(sel.availableModes).length > 1 ? (
                                        <div style={{ marginBottom: "1rem" }}>
                                            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Mode</label>
                                            <select
                                                value={rescheduleMode}
                                                onChange={(e) => setRescheduleMode(e.target.value)}
                                                style={{ padding: "0.4rem", borderRadius: "6px", border: "1px solid #d1d5db", width: "100%" }}
                                            >
                                                {toSafeArray(sel.availableModes).map((m) => (
                                                    <option key={m} value={m}>{formatModeLabel(m)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null;
                                })()}
                            </>
                        )}

                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
                            Reason <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea
                            rows={3}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical", boxSizing: "border-box" }}
                            placeholder="Please explain why you are rescheduling..."
                            value={rescheduleReason}
                            onChange={(e) => setRescheduleReason(e.target.value)}
                        />

                        {rescheduleMessage && <p style={{ color: "#dc2626", marginTop: "0.5rem", fontSize: "0.875rem" }}>{rescheduleMessage}</p>}

                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end" }}>
                            <button type="button" onClick={closeRescheduleModal} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}>
                                Back
                            </button>
                            <button type="button" onClick={handleRescheduleAppointment} disabled={isRescheduling} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}>
                                {isRescheduling ? "Rescheduling..." : "Confirm Reschedule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FacultyDashboard;
