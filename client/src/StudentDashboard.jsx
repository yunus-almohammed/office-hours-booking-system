import { useEffect, useEffectEvent, useRef, useState } from "react";
import "./StudentDashboard.css";
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

const toSafeArray = (value) => (Array.isArray(value) ? value : []);

const getFacultyName = (faculty) =>
    faculty?.displayName?.trim?.() || faculty?.fullName || "Faculty Member";

const getStudentAppointmentFacultyName = (faculty) =>
    faculty?.fullName ||
    faculty?.name ||
    faculty?.displayName?.trim?.() ||
    faculty?.contactEmail ||
    faculty?.email ||
    "Unknown faculty";

const getInitials = (value) => {
    const parts = (value || "Faculty Member")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "FM";
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

const formatModeLabel = (mode) =>
    mode === "in-person" ? "In-person" : mode === "online" ? "Online" : mode;

const formatDateLabel = (date) =>
    date
        .toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "2-digit",
        })
        .replace(",", "");

const formatDateValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const formatAppointmentDate = (date) =>
    date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    });

const formatStatusLabel = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";

const formatRoleLabel = (role) =>
    role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown";

const getAppointmentDisplayId = (appointment) =>
    appointment?.appointmentId || appointment?._id || "N/A";

const formatNotificationTimestamp = (timestamp) => {
    const parsedTimestamp = timestamp ? new Date(timestamp) : null;

    if (!parsedTimestamp || Number.isNaN(parsedTimestamp.getTime())) {
        return "";
    }

    return parsedTimestamp.toLocaleString();
};

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

    const isoDateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoDateMatch) {
        const [, year, month, day] = isoDateMatch;

        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsedDate = new Date(dateText);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const parseAppointmentTimeMinutes = (timeValue) => {
    const startText =
        typeof timeValue === "string" ? timeValue.split("-")[0].trim() : "";
    const timeMatch = startText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!timeMatch) {
        return null;
    }

    const [, hourText, minuteText, meridiem] = timeMatch;
    let hours = Number(hourText) % 12;

    if (meridiem.toUpperCase() === "PM") {
        hours += 12;
    }

    return hours * 60 + Number(minuteText);
};

const getAppointmentSortTimestamp = (appointment) => {
    const parsedDate = parseAppointmentDate(appointment?.date);
    const startMinutes = parseAppointmentTimeMinutes(appointment?.time);

    if (parsedDate) {
        return new Date(
            parsedDate.getFullYear(),
            parsedDate.getMonth(),
            parsedDate.getDate(),
            startMinutes !== null ? Math.floor(startMinutes / 60) : 0,
            startMinutes !== null ? startMinutes % 60 : 0
        ).getTime();
    }

    const createdAtTimestamp = Date.parse(appointment?.createdAt || "");

    return Number.isNaN(createdAtTimestamp) ? 0 : createdAtTimestamp;
};

const compareAppointmentsByDateAndTime = (
    firstAppointment,
    secondAppointment,
    direction = "asc"
) => {
    const firstTimestamp = getAppointmentSortTimestamp(firstAppointment);
    const secondTimestamp = getAppointmentSortTimestamp(secondAppointment);

    if (firstTimestamp !== secondTimestamp) {
        return direction === "asc"
            ? firstTimestamp - secondTimestamp
            : secondTimestamp - firstTimestamp;
    }

    return getAppointmentDisplayId(firstAppointment).localeCompare(
        getAppointmentDisplayId(secondAppointment)
    );
};

const splitAppointmentsByTime = (appointments) => {
    const now = Date.now();
    const upcoming = [];
    const past = [];

    appointments.forEach((appointment) => {
        if (getAppointmentSortTimestamp(appointment) < now) {
            past.push(appointment);
            return;
        }

        upcoming.push(appointment);
    });

    return {
        upcomingAppointments: [...upcoming].sort((firstAppointment, secondAppointment) =>
            compareAppointmentsByDateAndTime(firstAppointment, secondAppointment, "asc")
        ),
        pastAppointments: [...past].sort((firstAppointment, secondAppointment) =>
            compareAppointmentsByDateAndTime(firstAppointment, secondAppointment, "desc")
        ),
    };
};

// Build tab descriptors from server-returned slots.
// Each slot now carries occurrenceValue (YYYY-MM-DD) and occurrenceDate ("Jun 01, 2026")
// so we don't re-derive dates on the client.
const buildUpcomingDates = (slots) => {
    const safeSlots = toSafeArray(slots);
    const seen = new Map(); // occurrenceValue -> first slot with that value

    for (const slot of safeSlots) {
        if (slot?.occurrenceValue && !seen.has(slot.occurrenceValue)) {
            seen.set(slot.occurrenceValue, slot);
        }
    }

    return [...seen.entries()]
        .map(([value, slot]) => ({
            day: slot.day,
            value,
            // Short label for the tab button e.g. "Mon Jun 01"
            label: (() => {
                const d = new Date(value + "T00:00:00");
                return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" }).replace(",", "");
            })(),
            appointmentLabel: slot.occurrenceDate,
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
};

const getSlotStartTimestamp = (slot, now = new Date()) => {
    const startMinutes = parseAppointmentTimeMinutes(slot?.period);
    const targetDayIndex = weekDays.indexOf(slot?.day);

    if (startMinutes === null || targetDayIndex === -1) {
        return null;
    }

    const currentDate = now instanceof Date ? now : new Date(now);
    const today = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate()
    );
    const dayOffset = (targetDayIndex - today.getDay() + 7) % 7;
    const slotDate = new Date(today);

    slotDate.setDate(today.getDate() + dayOffset);

    return new Date(
        slotDate.getFullYear(),
        slotDate.getMonth(),
        slotDate.getDate(),
        Math.floor(startMinutes / 60),
        startMinutes % 60
    ).getTime();
};

// Server now returns seatsRemaining per-occurrence; fall back to capacity math for safety.
const getSlotRemainingSeats = (slot) => {
    if (slot?.seatsRemaining != null) return slot.seatsRemaining;
    const capacity = slot?.capacity != null ? slot.capacity : 1;
    const bookedCount = slot?.bookedCount != null ? slot.bookedCount : 0;
    return Math.max(0, capacity - bookedCount);
};

const isUpcomingAvailabilitySlot = (slot, now = new Date()) => {
    if (!slot) {
        return false;
    }

    if (getSlotRemainingSeats(slot) <= 0) {
        return false;
    }

    const slotStartTimestamp = getSlotStartTimestamp(slot, now);

    return slotStartTimestamp !== null && slotStartTimestamp >= now.getTime();
};

const getStudentProfileFormState = (user) => ({
    fullName: user?.fullName || "",
    major: user?.major || "",
    phoneNumber: sanitizePhoneNumber(user?.phoneNumber),
    contactEmail: user?.contactEmail || "",
});

function StudentDashboard({ onLogout, onUserUpdate, user }) {
    const [activeSection, setActiveSection] = useState("booking");
    const [facultyMembers, setFacultyMembers] = useState([]);
    const [loadingFaculty, setLoadingFaculty] = useState(true);
    const [facultyMessage, setFacultyMessage] = useState("");
    const [facultySearchTerm, setFacultySearchTerm] = useState("");
    const [studentAppointments, setStudentAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);
    const [appointmentsMessage, setAppointmentsMessage] = useState("");
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [notificationsMessage, setNotificationsMessage] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);
    const [selectedFaculty, setSelectedFaculty] = useState(null);
    const [facultyAvailability, setFacultyAvailability] = useState([]);
    const [loadingAvailability, setLoadingAvailability] = useState(false);
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedSlotId, setSelectedSlotId] = useState("");
    const [selectedMode, setSelectedMode] = useState("");
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [bookingMessage, setBookingMessage] = useState("");
    const [isBookingAppointment, setIsBookingAppointment] = useState(false);
    const [profileForm, setProfileForm] = useState(() => getStudentProfileFormState(user));
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
    const [profileImageFile, setProfileImageFile] = useState(null);
    const [profileImagePreview, setProfileImagePreview] = useState("");
    const [profileMessage, setProfileMessage] = useState("");
    const [profileMessageType, setProfileMessageType] = useState("");
    const bookingDetailsRef = useRef(null);

    // Cancel modal state
    const [cancelModalAppointment, setCancelModalAppointment] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelMessage, setCancelMessage] = useState("");

    // Reschedule modal state
    const [rescheduleModalAppointment, setRescheduleModalAppointment] = useState(null);
    const [rescheduleReason, setRescheduleReason] = useState("");
    const [rescheduleSlots, setRescheduleSlots] = useState([]);
    const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
    const [rescheduleSelectedSlotId, setRescheduleSelectedSlotId] = useState("");
    const [rescheduleMode, setRescheduleMode] = useState("");
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleMessage, setRescheduleMessage] = useState("");
    const [isRescheduling, setIsRescheduling] = useState(false);

    const safeFacultyMembers = toSafeArray(facultyMembers);
    const normalizedFacultySearch = facultySearchTerm.trim().toLowerCase();
    const filteredFacultyMembers = safeFacultyMembers.filter((faculty) => {
        if (!normalizedFacultySearch) {
            return true;
        }

        const searchableValues = [
            faculty?.fullName,
            faculty?.displayName,
            faculty?.major,
            faculty?.contactEmail,
            faculty?.email,
            faculty?.building,
            faculty?.room,
            [faculty?.building, faculty?.room].filter(Boolean).join(" "),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchableValues.includes(normalizedFacultySearch);
    });
    const safeFacultyAvailability = toSafeArray(facultyAvailability);
    // Server already returns only bookable slots with occurrenceValue/occurrenceDate
    const bookingDays = buildUpcomingDates(safeFacultyAvailability);
    const selectedDateOption = bookingDays.find((day) => day.value === selectedDate) || null;
    // Slots for the selected tab: match by occurrenceValue (server-assigned date)
    const visibleSlots = safeFacultyAvailability.filter(
        (slot) => slot?.occurrenceValue === selectedDate
    );
    const selectedSlot =
        safeFacultyAvailability.find((slot) => slot?._id === selectedSlotId) || null;
    const { upcomingAppointments, pastAppointments } = splitAppointmentsByTime(
        toSafeArray(studentAppointments)
    );
    const totalStudentAppointments = upcomingAppointments.length + pastAppointments.length;
    const safeNotifications = toSafeArray(notifications);
    const currentStudentProfileImage =
        profileImagePreview || getProfileImageSrc(user?.profileImage);
    const studentProfilePhone = sanitizePhoneNumber(user?.phoneNumber);
    const studentLoginEmail = user?.email || "";
    const studentContactEmail =
        user?.contactEmail || user?.email || "Email not provided";

    // Load all approved faculty members from the server to display in the booking section
    const fetchFacultyMembers = async () => {
        try {
            setLoadingFaculty(true);
            setFacultyMessage("");

            const response = await api.get("/api/faculty/approved");

            setFacultyMembers(toSafeArray(response.data));
        } catch (error) {
            console.error("Failed to load faculty members", error);
            setFacultyMembers([]);
            setFacultyMessage(
                error.response?.data?.message || "Failed to load faculty members"
            );
        } finally {
            setLoadingFaculty(false);
        }
    };

    // Load the available time slots for a selected faculty member
    const fetchFacultyAvailability = async (facultyId) => {
        try {
            setLoadingAvailability(true);

            const response = await api.get(
                `/api/student/faculty/${facultyId}/availability`
            );

            setFacultyAvailability(toSafeArray(response.data));
        } catch (error) {
            console.error("Failed to load faculty availability", error);
            setFacultyAvailability([]);
        } finally {
            setLoadingAvailability(false);
        }
    };

    const fetchNotifications = async () => {
        try {
            setLoadingNotifications(true);
            setNotificationsMessage("");

            const response = await api.get("/api/notifications/my");

            setNotifications(toSafeArray(response.data));
        } catch (error) {
            console.error("Failed to load student notifications", error);
            setNotifications([]);
            setNotificationsMessage(
                error.response?.data?.message || "Failed to load notifications"
            );
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

    // Load all appointments the student has made
    const fetchStudentAppointments = async () => {
        try {
            setLoadingAppointments(true);
            setAppointmentsMessage("");

            const response = await api.get("/api/appointments/student/my");

            setStudentAppointments(toSafeArray(response.data));
        } catch (error) {
            console.error("Failed to load student appointments", error);
            setStudentAppointments([]);
            setAppointmentsMessage(
                error.response?.data?.message || "Failed to load appointments"
            );
        } finally {
            setLoadingAppointments(false);
        }
    };

    const resetBookingSelection = () => {
        setSelectedDate("");
        setSelectedSlotId("");
        setSelectedMode("");
        setTopic("");
        setDescription("");
        setBookingMessage("");
        setFacultyAvailability([]);
    };

    const handleViewAvailability = async (faculty) => {
        setSelectedFaculty(faculty);
        setFacultyAvailability([]);
        setSelectedSlotId("");
        setSelectedMode("");
        setTopic("");
        setDescription("");
        setBookingMessage("");
        setSelectedDate("");
        await fetchFacultyAvailability(faculty._id);
    };

    const handleBackToFacultySelection = () => {
        setSelectedFaculty(null);
        resetBookingSelection();
    };

    const handleSelectSlot = (slot) => {
        if (!isUpcomingAvailabilitySlot(slot)) {
            setBookingMessage("Selected slot has expired. Please choose another time.");
            setSelectedSlotId("");
            setSelectedMode("");
            return;
        }

        const isSameSlot = selectedSlotId === slot._id;
        setSelectedSlotId(slot._id);
        setSelectedMode(toSafeArray(slot?.availableModes)[0] || "");
        setBookingMessage("");

        if (isSameSlot && bookingDetailsRef.current) {
            bookingDetailsRef.current.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    };

    // Submit the booking request to the server with the selected faculty, date, time, and topic
    const handleConfirmAppointment = async (e) => {
        e.preventDefault();

        if (
            !selectedFaculty ||
            !selectedDateOption ||
            !selectedSlotId ||
            !selectedMode ||
            !selectedSlot
        ) {
            setBookingMessage("Please select a faculty member, date, slot/time, and mode first.");
            return;
        }

        if (!selectedSlot?.bookable && !selectedSlot?.occurrenceDate) {
            setBookingMessage("Selected slot is no longer available. Please choose another time.");
            setSelectedSlotId("");
            setSelectedMode("");
            return;
        }

        const trimmedTopic = topic?.trim?.() || "";

        if (!trimmedTopic) {
            setBookingMessage("Please enter a topic for your appointment.");
            return;
        }

        try {
            setIsBookingAppointment(true);

            const response = await api.post(
                "/api/student/appointments",
                {
                    facultyId: selectedFaculty._id,
                    slotId: selectedSlot?.slotId || selectedSlotId,
                    // Send the server-supplied occurrence date label as the appointment date
                    date: selectedSlot.occurrenceDate,
                    time: selectedSlot.period,
                    mode: selectedMode,
                    topic: trimmedTopic,
                    description: description.trim(),
                }
            );

            setBookingMessage(response.data.message || "Appointment request submitted successfully.");
            setSelectedSlotId("");
            setSelectedMode("");
            setTopic("");
            setDescription("");
            await fetchFacultyAvailability(selectedFaculty._id);
            await fetchStudentAppointments();
        } catch (error) {
            setBookingMessage(
                error.response?.data?.message ||
                    error.message ||
                    "Failed to confirm appointment"
            );
        } finally {
            setIsBookingAppointment(false);
        }
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

    const handleStartEditProfile = () => {
        setProfileForm(getStudentProfileFormState(user));
        setIsEditingProfile(true);
        setProfileImageFile(null);
        setProfileMessage("");
        setProfileMessageType("");
    };

    const handleCancelEditProfile = () => {
        setProfileForm(getStudentProfileFormState(user));
        setIsEditingProfile(false);
        setProfileImageFile(null);
        setProfileMessage("");
        setProfileMessageType("");
    };

    // Upload a new profile image for the student
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

            onUserUpdate?.(updatedUser);
            setProfileImageFile(null);
            setProfileMessage(
                response.data?.message || "Profile image uploaded successfully."
            );
            setProfileMessageType("success");
        } catch (error) {
            setProfileMessage(
                error.response?.data?.message || "Failed to upload profile image."
            );
            setProfileMessageType("error");
        } finally {
            setIsUploadingProfileImage(false);
        }
    };

    // Save the student's updated profile details to the server
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
            setIsSavingProfile(true);
            setProfileMessage("");
            setProfileMessageType("");

            const response = await api.patch("/api/auth/me", {
                fullName: profileForm.fullName,
                major: profileForm.major,
                phoneNumber: profileForm.phoneNumber,
                contactEmail: profileForm.contactEmail,
            });

            const updatedUser = response.data?.user;

            if (!updatedUser) {
                throw new Error("Updated profile was not returned");
            }

            localStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
            onUserUpdate?.(updatedUser);
            setProfileForm(getStudentProfileFormState(updatedUser));
            setIsEditingProfile(false);
            setProfileMessage(response.data.message || "Profile updated successfully.");
            setProfileMessageType("success");
        } catch (error) {
            setProfileMessage(
                error.response?.data?.message || "Failed to update profile."
            );
            setProfileMessageType("error");
        } finally {
            setIsSavingProfile(false);
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
            await fetchStudentAppointments();
            setAppointmentsMessage("Appointment cancelled successfully.");
        } catch (error) {
            setCancelMessage(
                error.response?.data?.message || "Failed to cancel appointment."
            );
        } finally {
            setIsCancelling(false);
        }
    };

    const openRescheduleModal = async (appointment) => {
        setRescheduleModalAppointment(appointment);
        setRescheduleReason("");
        setRescheduleSelectedSlotId("");
        setRescheduleMode("");
        setRescheduleDate("");
        setRescheduleMessage("");

        const facultyId = appointment.faculty?._id || appointment.faculty;

        if (!facultyId) return;

        try {
            setLoadingRescheduleSlots(true);
            const response = await api.get(`/api/student/faculty/${facultyId}/availability`);
            setRescheduleSlots(toSafeArray(response.data));
        } catch (error) {
            setRescheduleSlots([]);
        } finally {
            setLoadingRescheduleSlots(false);
        }
    };

    const closeRescheduleModal = () => {
        setRescheduleModalAppointment(null);
        setRescheduleReason("");
        setRescheduleSlots([]);
        setRescheduleSelectedSlotId("");
        setRescheduleMode("");
        setRescheduleDate("");
        setRescheduleMessage("");
    };

    const handleRescheduleSelectSlot = (slot) => {
        setRescheduleSelectedSlotId(slot._id);
        setRescheduleMode(toSafeArray(slot.availableModes)[0] || "");
        // Use the server-supplied occurrence date directly
        setRescheduleDate(slot.occurrenceDate || "");
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

        const selectedSlot = rescheduleSlots.find((s) => s._id === rescheduleSelectedSlotId);

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
            await fetchStudentAppointments();
            setAppointmentsMessage("Appointment rescheduled successfully. Awaiting faculty approval.");
        } catch (error) {
            setRescheduleMessage(
                error.response?.data?.message || "Failed to reschedule appointment."
            );
        } finally {
            setIsRescheduling(false);
        }
    };

    const loadFacultyMembers = useEffectEvent(fetchFacultyMembers);
    const loadStudentAppointments = useEffectEvent(fetchStudentAppointments);
    const loadNotifications = useEffectEvent(fetchNotifications);
    const loadUnreadCount = useEffectEvent(fetchUnreadCount);

    useEffect(() => {
        setProfileForm(getStudentProfileFormState(user));
    }, [user]);

    useEffect(() => {
        if (!profileImageFile) {
            setProfileImagePreview("");
            return undefined;
        }

        const objectUrl = window.URL.createObjectURL(profileImageFile);
        setProfileImagePreview(objectUrl);

        return () => window.URL.revokeObjectURL(objectUrl);
    }, [profileImageFile]);

    useEffect(() => {
        loadFacultyMembers();
        loadUnreadCount();
    }, []);

    useEffect(() => {
        if (!selectedFaculty) {
            return;
        }

        if (bookingDays.length === 0) {
            setSelectedDate("");
            setSelectedSlotId("");
            setSelectedMode("");
            setTopic("");
            setDescription("");
            return;
        }

        if (!selectedDate) {
            setSelectedDate(bookingDays[0].value);
            return;
        }

        if (selectedDate && !bookingDays.some((day) => day.value === selectedDate)) {
            setSelectedDate(bookingDays[0].value);
            setSelectedSlotId("");
            setSelectedMode("");
            setTopic("");
            setDescription("");
        }
    }, [selectedFaculty, facultyAvailability, selectedDate, bookingDays]);

    useEffect(() => {
        if (!selectedSlotId || !bookingDetailsRef.current) {
            return undefined;
        }

        const animationFrameId = window.requestAnimationFrame(() => {
            bookingDetailsRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });

        return () => window.cancelAnimationFrame(animationFrameId);
    }, [selectedSlotId]);

    useEffect(() => {
        if (activeSection === "appointments") {
            loadStudentAppointments();
        }

        if (activeSection === "notifications") {
            loadNotifications();
        }
    }, [activeSection]);

    // Check for new notifications every 30 seconds while the student is logged in
    useEffect(() => {
        const intervalId = window.setInterval(() => {
            loadUnreadCount();
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, []);

    const renderFacultyCardImage = (faculty) =>
        faculty.profileImage ? (
            <img
                src={getProfileImageSrc(faculty.profileImage)}
                alt={getFacultyName(faculty)}
                className="student-faculty-avatar-image"
            />
        ) : (
            <div className="student-faculty-avatar">{getInitials(getFacultyName(faculty))}</div>
        );

    const renderBooking = () => (
        <div className="student-booking-wrapper">
            {!selectedFaculty ? (
                <section className="student-panel">
                    <div className="student-panel-header">
                        <h2>Select Faculty Member</h2>
                        <span>
                            {normalizedFacultySearch
                                ? `${filteredFacultyMembers.length} of ${safeFacultyMembers.length} faculty shown`
                                : `${safeFacultyMembers.length} faculty available`}
                        </span>
                    </div>

                    {facultyMessage && (
                        <p className="student-appointments-message">{facultyMessage}</p>
                    )}

                    <div className="student-search-bar">
                        <input
                            type="text"
                            className="student-search-input"
                            placeholder="Search faculty by name, major, email, room, or building"
                            value={facultySearchTerm}
                            onChange={(e) => setFacultySearchTerm(e.target.value)}
                        />
                    </div>

                    {loadingFaculty ? (
                        <p>Loading faculty members...</p>
                    ) : safeFacultyMembers.length === 0 ? (
                        <p className="student-empty-state">No approved faculty members found.</p>
                    ) : filteredFacultyMembers.length === 0 ? (
                        <p className="student-empty-state">
                            No faculty members match your search.
                        </p>
                    ) : (
                        <div className="student-faculty-list-grid">
                            {filteredFacultyMembers.map((faculty) => (
                                <div className="student-faculty-select-card" key={faculty._id}>
                                    <div className="student-faculty-select-top">
                                        {renderFacultyCardImage(faculty)}
                                        <div className="student-faculty-select-info">
                                            <h3>{getFacultyName(faculty)}</h3>
                                            <p>{faculty.major || "Department details will be added soon."}</p>
                                        </div>
                                    </div>

                                    <div className="student-faculty-select-meta">
                                        <span>
                                            {faculty.contactEmail || faculty.email || "No contact email provided"}
                                        </span>
                                        <span>
                                            {[faculty.building, faculty.room].filter(Boolean).join(", ") ||
                                                "Office location not provided"}
                                        </span>
                                        {faculty.phoneNumber && <span>{faculty.phoneNumber}</span>}
                                    </div>

                                    <button
                                        type="button"
                                        className="student-view-availability-btn"
                                        onClick={() => handleViewAvailability(faculty)}
                                    >
                                        View Availability
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    <button
                        type="button"
                        className="student-back-btn"
                        onClick={handleBackToFacultySelection}
                    >
                        Back to Faculty Availability
                    </button>

                    <div className="student-faculty-card">
                        {renderFacultyCardImage(selectedFaculty)}
                        <div className="student-faculty-info">
                            <h2>{getFacultyName(selectedFaculty)}</h2>
                            <p>{selectedFaculty.major || "Department not provided"}</p>
                            <span>
                                {selectedFaculty.contactEmail ||
                                    selectedFaculty.email ||
                                    "No contact email provided"}
                            </span>
                            <span>
                                {[selectedFaculty.building, selectedFaculty.room]
                                    .filter(Boolean)
                                    .join(", ") || "Office location not provided"}
                            </span>
                            {selectedFaculty.phoneNumber && (
                                <span>{selectedFaculty.phoneNumber}</span>
                            )}
                        </div>
                    </div>

                    <div className="student-slot-section">
                        <div className="student-panel-header">
                            <h2>Select an Available Time Slot</h2>
                            <span>{selectedDay || "Choose a date"}</span>
                        </div>

                        {loadingAvailability ? (
                            <p>Loading faculty availability...</p>
                        ) : bookingDays.length === 0 ? (
                            <p className="student-empty-state">
                                No available upcoming slots for this faculty.
                            </p>
                        ) : (
                            <>
                                <div className="student-day-tabs">
                                    {bookingDays.map((day) => (
                                        <button
                                            key={day.value}
                                            type="button"
                                            className={`student-day-tab ${selectedDate === day.value ? "active" : ""}`}
                                            onClick={() => {
                                                setSelectedDate(day.value);
                                                setSelectedSlotId("");
                                                setSelectedMode("");
                                                setTopic("");
                                                setDescription("");
                                                setBookingMessage("");
                                            }}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>

                                {!selectedDate ? (
                                    <p className="student-empty-state">
                                        Select a date to view available time slots.
                                    </p>
                                ) : visibleSlots.length === 0 ? (
                                    <p className="student-empty-state">
                                        No available upcoming slots for this day.
                                    </p>
                                ) : (
                                    <div className="student-slots-grid">
                                        {visibleSlots.map((slot) => {
                                            const remaining = getSlotRemainingSeats(slot);
                                            const isBookable = slot.bookable !== false && remaining > 0;
                                            return (
                                            <div
                                                className={`student-slot-card ${
                                                    selectedSlotId === slot._id ? "selected" : ""
                                                }`}
                                                key={slot._id}
                                            >
                                                <h3>{slot.period}</h3>
                                                <p>
                                                    {slot.availableModes
                                                        ? toSafeArray(slot.availableModes)
                                                        .map((mode) => formatModeLabel(mode))
                                                        .join(", ")
                                                        : ""}
                                                </p>
                                                <p style={{ fontSize: "0.8em", color: remaining <= 1 ? "#dc2626" : "#6b7280" }}>
                                                    {remaining} seat{remaining === 1 ? "" : "s"} remaining
                                                </p>
                                                <button
                                                    type="button"
                                                    className="student-book-slot-btn"
                                                    onClick={() => handleSelectSlot(slot)}
                                                    disabled={!isBookable}
                                                >
                                                    {!isBookable
                                                        ? "Fully booked"
                                                        : selectedSlotId === slot._id
                                                        ? "Selected"
                                                        : "Book Appointment"}
                                                </button>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {selectedSlot && (
                        <form
                            className="student-details-section"
                            onSubmit={handleConfirmAppointment}
                            ref={bookingDetailsRef}
                        >
                            <div className="student-panel-header">
                                <h2>Appointment Details</h2>
                                <span>Review and confirm</span>
                            </div>

                            <div className="student-details-summary-grid">
                                <div className="student-details-row">
                                    <label htmlFor="student-selected-faculty">
                                        Selected faculty
                                    </label>
                                    <input
                                        id="student-selected-faculty"
                                        type="text"
                                        className="student-details-input"
                                        value={getFacultyName(selectedFaculty)}
                                        readOnly
                                    />
                                </div>

                                <div className="student-details-row">
                                    <label htmlFor="student-selected-date">Selected date</label>
                                    <input
                                        id="student-selected-date"
                                        type="text"
                                        className="student-details-input"
                                        value={selectedDateOption?.appointmentLabel || ""}
                                        readOnly
                                    />
                                </div>

                                <div className="student-details-row">
                                    <label htmlFor="student-selected-time">Selected time</label>
                                    <input
                                        id="student-selected-time"
                                        type="text"
                                        className="student-details-input"
                                        value={selectedSlot?.period || ""}
                                        readOnly
                                    />
                                </div>
                            </div>

                            <div className="student-details-row">
                                <label htmlFor="student-selected-mode">Mode</label>
                                <select
                                    id="student-selected-mode"
                                    className="student-details-input"
                                    value={selectedMode}
                                    onChange={(e) => {
                                        setSelectedMode(e.target.value);
                                        setBookingMessage("");
                                    }}
                                >
                                    <option value="">Choose appointment mode</option>
                                    {toSafeArray(selectedSlot?.availableModes).map((mode) => (
                                        <option key={mode} value={mode}>
                                            {formatModeLabel(mode)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="student-details-row">
                                <label htmlFor="student-topic">Topic <span aria-hidden="true" style={{ color: "var(--error-color, #dc2626)" }}>*</span></label>
                                <input
                                    id="student-topic"
                                    type="text"
                                    className="student-details-input"
                                    placeholder="e.g. Midterm review, project guidance"
                                    value={topic}
                                    onChange={(e) => {
                                        setTopic(e.target.value);
                                        setBookingMessage("");
                                    }}
                                />
                            </div>

                            <div className="student-details-row">
                                <label htmlFor="student-description">Description (Optional)</label>
                                <textarea
                                    id="student-description"
                                    className="student-details-input student-details-textarea"
                                    placeholder="Add any additional details or questions"
                                    value={description}
                                    onChange={(e) => {
                                        setDescription(e.target.value);
                                        setBookingMessage("");
                                    }}
                                    rows={3}
                                />
                            </div>

                            <button
                                type="submit"
                                className="student-confirm-btn"
                                disabled={isBookingAppointment}
                            >
                                {isBookingAppointment
                                    ? "Confirming Booking..."
                                    : "Confirm Booking"}
                            </button>
                        </form>
                    )}

                    {bookingMessage && (
                        <p className="student-booking-message">{bookingMessage}</p>
                    )}
                </>
            )}
        </div>
    );

    const renderAppointmentCards = (appointmentList, emptyMessage) => {
        if (loadingAppointments) {
            return <p>Loading appointments...</p>;
        }

        if (appointmentList.length === 0) {
            return <p className="student-empty-state">{emptyMessage}</p>;
        }

        return (
            <div className="student-appointment-list">
                {appointmentList.map((appointment) => {
                    const isApproved = appointment.status === "approved";
                    const isUpcoming = getAppointmentSortTimestamp(appointment) >= Date.now();

                    return (
                    <div className="student-appointment-card" key={appointment._id}>
                        <div className="student-appointment-card-header">
                            <div className="student-appointment-heading">
                                <h3>{getStudentAppointmentFacultyName(appointment.faculty)}</h3>
                                <span className="student-appointment-id">
                                    Appointment ID: {getAppointmentDisplayId(appointment)}
                                </span>
                            </div>
                            <span
                                className={`student-appointment-status ${appointment.status || "unknown"}`}
                            >
                                {formatStatusLabel(appointment.status)}
                            </span>
                        </div>

                        <div className="student-appointment-details-grid">
                            <div className="student-appointment-detail">
                                <span>Faculty</span>
                                <strong>
                                    {getStudentAppointmentFacultyName(appointment.faculty)}
                                </strong>
                            </div>
                            <div className="student-appointment-detail">
                                <span>Date</span>
                                <strong>{appointment.date || "Date not provided"}</strong>
                            </div>
                            <div className="student-appointment-detail">
                                <span>Time</span>
                                <strong>{appointment.time || "Time not provided"}</strong>
                            </div>
                            <div className="student-appointment-detail">
                                <span>Mode</span>
                                <strong>{formatModeLabel(appointment.mode) || "Mode not provided"}</strong>
                            </div>
                            <div className="student-appointment-detail">
                                <span>Topic</span>
                                <strong>
                                    {appointment.topic || appointment.notes || "No topic provided"}
                                </strong>
                            </div>
                            {appointment.description && (
                                <div className="student-appointment-detail">
                                    <span>Description</span>
                                    <strong>{appointment.description}</strong>
                                </div>
                            )}
                            <div className="student-appointment-detail">
                                <span>Status</span>
                                <strong>{formatStatusLabel(appointment.status)}</strong>
                            </div>
                        </div>

                        {isApproved && isUpcoming && (
                            <div className="student-appointment-actions" style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                                <button
                                    type="button"
                                    style={{ padding: "0.4rem 0.9rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem" }}
                                    onClick={() => openRescheduleModal(appointment)}
                                >
                                    Reschedule
                                </button>
                                <button
                                    type="button"
                                    style={{ padding: "0.4rem 0.9rem", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem" }}
                                    onClick={() => openCancelModal(appointment)}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                    );
                })}
            </div>
        );
    };

    const renderAppointments = () => (
        <section className="student-panel">
            <div className="student-panel-header">
                <h2>My Appointments</h2>
                <span>{totalStudentAppointments} total</span>
            </div>

            {appointmentsMessage && (
                <p className="student-appointments-message">{appointmentsMessage}</p>
            )}

            <div className="student-appointments-group-stack">
                <div className="student-appointments-group">
                    <div className="student-appointments-group-header">
                        <h3>Upcoming Appointments</h3>
                        <span>
                            {upcomingAppointments.length} appointment
                            {upcomingAppointments.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    {renderAppointmentCards(
                        upcomingAppointments,
                        "No upcoming appointments found."
                    )}
                </div>

                <div className="student-appointments-group">
                    <div className="student-appointments-group-header">
                        <h3>Past Appointments</h3>
                        <span>
                            {pastAppointments.length} appointment
                            {pastAppointments.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    {renderAppointmentCards(pastAppointments, "No past appointments found.")}
                </div>
            </div>
        </section>
    );

    const renderNotifications = () => (
        <section className="student-panel">
            <div className="student-panel-header">
                <h2>Notifications</h2>
            </div>

            {notificationsMessage && (
                <p className="student-notification-message">{notificationsMessage}</p>
            )}

            {loadingNotifications ? (
                <p>Loading notifications...</p>
            ) : safeNotifications.length === 0 ? (
                <p>No notifications found.</p>
            ) : (
                <div className="student-notification-list">
                    {safeNotifications.map((notification) => (
                        <div className="student-notification-card" key={notification._id}>
                            <div className="student-notification-card-header">
                                <h3>{notification.title || "Notification"}</h3>
                                <span>{formatNotificationTimestamp(notification.createdAt)}</span>
                            </div>
                            <p>{notification.message}</p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    const renderProfile = () => (
        <section className="student-panel">
            <div className="student-panel-header">
                <h2>Student Profile</h2>
                <span>{isEditingProfile ? "Edit your details" : "Your account details"}</span>
            </div>

            <div className="student-profile-layout">
                <div className="student-profile-preview">
                    {currentStudentProfileImage ? (
                        <img
                            src={currentStudentProfileImage}
                            alt={user?.fullName || "Student"}
                            className="student-profile-image"
                        />
                    ) : (
                        <div className="student-profile-avatar">
                            {getInitials(user?.fullName || "Student")}
                        </div>
                    )}

                    <h3>{user?.fullName || "Student"}</h3>
                    <p>{user?.major || "Major not provided"}</p>
                    <span>{studentContactEmail}</span>
                    <span>Role: {formatRoleLabel(user?.role)}</span>
                    <span>{studentProfilePhone || "Phone not provided"}</span>

                    <div className="student-profile-upload-box">
                        <label className="student-profile-upload-field">
                            <span>Choose image from your PC</span>
                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                onChange={handleProfileImageFileChange}
                            />
                        </label>
                        <button
                            type="button"
                            className="student-profile-upload-btn"
                            onClick={handleUploadProfileImage}
                            disabled={isUploadingProfileImage}
                        >
                            {isUploadingProfileImage ? "Uploading Image..." : "Upload Image"}
                        </button>
                    </div>
                </div>

                <div className="student-profile-details-card">
                    {!isEditingProfile ? (
                        <>
                            <div className="student-profile-details">
                                <div className="student-profile-item">
                                    <strong>Full name</strong>
                                    <span>{user?.fullName || "Not provided"}</span>
                                </div>
                                <div className="student-profile-item">
                                    <strong>Login email</strong>
                                    <span>{studentLoginEmail || "Not provided"}</span>
                                </div>
                                <div className="student-profile-item">
                                    <strong>Contact email</strong>
                                    <span>{studentContactEmail}</span>
                                </div>
                                <div className="student-profile-item">
                                    <strong>Role</strong>
                                    <span>{formatRoleLabel(user?.role)}</span>
                                </div>
                                <div className="student-profile-item">
                                    <strong>Major</strong>
                                    <span>{user?.major || "Not provided"}</span>
                                </div>
                                <div className="student-profile-item">
                                    <strong>Phone</strong>
                                    <span>{studentProfilePhone || "Not provided"}</span>
                                </div>
                            </div>

                            {profileMessage && (
                                <p
                                    className={`student-profile-message ${
                                        profileMessageType || "success"
                                    }`}
                                >
                                    {profileMessage}
                                </p>
                            )}

                            <button
                                type="button"
                                className="student-profile-edit-btn"
                                onClick={handleStartEditProfile}
                            >
                                Edit Profile
                            </button>
                        </>
                    ) : (
                        <form className="student-profile-form" onSubmit={handleSaveProfile}>
                            <div className="student-profile-grid">
                                <label className="student-profile-field">
                                    <span>Full name</span>
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={profileForm.fullName}
                                        onChange={handleProfileChange}
                                        placeholder="Enter your full name"
                                    />
                                </label>

                                <label className="student-profile-field">
                                    <span>Login email</span>
                                    <input
                                        type="email"
                                        value={studentLoginEmail}
                                        readOnly
                                    />
                                </label>

                                <label className="student-profile-field">
                                    <span>Major</span>
                                    <input
                                        type="text"
                                        name="major"
                                        value={profileForm.major}
                                        onChange={handleProfileChange}
                                        placeholder="Computer Science"
                                    />
                                </label>

                                <label className="student-profile-field">
                                    <span>Phone</span>
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

                                <label className="student-profile-field">
                                    <span>Contact email</span>
                                    <input
                                        type="email"
                                        name="contactEmail"
                                        value={profileForm.contactEmail}
                                        onChange={handleProfileChange}
                                        placeholder={studentLoginEmail || "contact@example.com"}
                                    />
                                </label>
                            </div>

                            {profileMessage && (
                                <p
                                    className={`student-profile-message ${
                                        profileMessageType || "success"
                                    }`}
                                >
                                    {profileMessage}
                                </p>
                            )}

                            <div className="student-profile-actions">
                                <button
                                    type="submit"
                                    className="student-profile-save-btn"
                                    disabled={isSavingProfile}
                                >
                                    {isSavingProfile ? "Saving Profile..." : "Save Profile"}
                                </button>
                                <button
                                    type="button"
                                    className="student-profile-cancel-btn"
                                    onClick={handleCancelEditProfile}
                                    disabled={isSavingProfile}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </section>
    );

    const getTitle = () => {
        if (activeSection === "appointments") return "My Appointments";
        if (activeSection === "notifications") return "Notifications";
        if (activeSection === "profile") return "Student Profile";
        return "Book Appointment";
    };

    return (
        <div className="student-layout">
            <aside className="student-sidebar">
                <div className="student-sidebar-logo">
                    <img src={logo} alt="Office Hours Logo" className="student-sidebar-logo-img" />
                </div>

                <nav className="student-sidebar-menu student-sidebar-nav">
                    <button
                        className={`student-menu-item ${activeSection === "booking" ? "active" : ""}`}
                        onClick={() => setActiveSection("booking")}
                    >
                        Book Appointment
                    </button>
                    <button
                        className={`student-menu-item ${activeSection === "appointments" ? "active" : ""}`}
                        onClick={() => setActiveSection("appointments")}
                    >
                        My Appointments
                    </button>
                    <button
                        className={`student-menu-item ${activeSection === "profile" ? "active" : ""}`}
                        onClick={() => setActiveSection("profile")}
                    >
                        Profile
                    </button>
                    <button
                        className={`student-menu-item ${activeSection === "notifications" ? "active" : ""}`}
                        onClick={handleNotificationsClick}
                    >
                        <span className="student-menu-item-label">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="notification-badge">{unreadCount}</span>
                        )}
                    </button>
                </nav>

                <button className="student-logout-btn" onClick={onLogout}>
                    Logout
                </button>
            </aside>

            <main className="student-dashboard-content">
                <div className="student-topbar">
                    <h1>{getTitle()}</h1>
                    <div className="student-badge">{user?.fullName || "Student"}</div>
                </div>

                {activeSection === "booking" && renderBooking()}
                {activeSection === "appointments" && renderAppointments()}
                {activeSection === "profile" && renderProfile()}
                {activeSection === "notifications" && renderNotifications()}
            </main>

            {/* Cancel modal */}
            {cancelModalAppointment && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: "10px", padding: "1.5rem", width: "100%", maxWidth: "440px" }}>
                        <h3 style={{ margin: "0 0 0.75rem" }}>Cancel Appointment</h3>
                        <p style={{ fontSize: "0.9rem", color: "#374151", marginBottom: "1rem" }}>
                            {cancelModalAppointment.date} at {cancelModalAppointment.time} with {getStudentAppointmentFacultyName(cancelModalAppointment.faculty)}
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
                            Current: {rescheduleModalAppointment.date} at {rescheduleModalAppointment.time}
                        </p>

                        {loadingRescheduleSlots ? (
                            <p>Loading available slots...</p>
                        ) : rescheduleSlots.length === 0 ? (
                            <p style={{ color: "#6b7280" }}>No available slots for this faculty member.</p>
                        ) : (
                            <>
                                <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Select a new slot:</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                                    {rescheduleSlots.map((slot) => {
                                        const remaining = getSlotRemainingSeats(slot);
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
                                                <strong>{slot.occurrenceDate || slot.day} — {slot.period}</strong>
                                                <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
                                                    {toSafeArray(slot.availableModes).map(formatModeLabel).join(", ")} · {remaining} seat{remaining === 1 ? "" : "s"} left
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {rescheduleSelectedSlotId && (() => {
                                    const sel = rescheduleSlots.find(s => s._id === rescheduleSelectedSlotId);
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

export default StudentDashboard;
