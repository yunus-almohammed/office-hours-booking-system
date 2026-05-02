import { useEffect, useEffectEvent, useState } from "react";
import "./FacultyDashboard.css";
import api from "./api";
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

function FacultyDashboard({ onLogout, user }) {
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
    const [editingSlotId, setEditingSlotId] = useState(null);
    const [editPeriod, setEditPeriod] = useState("");
    const [editModes, setEditModes] = useState([]);
    const [reportTitle, setReportTitle] = useState("");
    const [reportMessage, setReportMessage] = useState("");
    const [notificationMessage, setNotificationMessage] = useState("");
    const [profileForm, setProfileForm] = useState(emptyProfileForm);
    const [profileMessage, setProfileMessage] = useState("");

    const fetchAppointments = async () => {
        try {
            setLoadingAppointments(true);
            const response = await api.get("/api/appointments/faculty/my");
            setAppointments(response.data);
        } catch (error) {
            console.error("Failed to load faculty appointments", error);
        } finally {
            setLoadingAppointments(false);
        }
    };

    const fetchStudents = async () => {
        try {
            setLoadingStudents(true);
            const response = await api.get("/api/faculty/students");

            setStudents(response.data);
        } catch (error) {
            console.error("Failed to load faculty students", error);
        } finally {
            setLoadingStudents(false);
        }
    };

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

            setAvailabilitySlots(response.data);
        } catch (error) {
            console.error("Failed to load availability slots", error);
        } finally {
            setLoadingAvailability(false);
        }
    };

    const fetchNotifications = async () => {
        try {
            setLoadingNotifications(true);
            const response = await api.get("/api/notifications/my");

            setNotifications(response.data);
        } catch (error) {
            console.error("Failed to load faculty notifications", error);
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

            setProfileForm({
                fullName: response.data.fullName || "",
                email: response.data.email || "",
                profileImage: response.data.profileImage || "",
                displayName: response.data.displayName || "",
                major: response.data.major || "",
                building: response.data.building || "",
                room: response.data.room || "",
                phoneNumber: response.data.phoneNumber || "",
                contactEmail: response.data.contactEmail || "",
            });
        } catch (error) {
            console.error("Failed to load faculty profile", error);
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

        setProfileForm((currentProfile) => ({
            ...currentProfile,
            [name]: value,
        }));
        setProfileMessage("");
    };

    const resetEditState = () => {
        setEditingSlotId(null);
        setEditPeriod("");
        setEditModes([]);
    };

    const handleStartEditSlot = (slot) => {
        setEditingSlotId(slot._id);
        setEditPeriod(slot.period);
        setEditModes(slot.availableModes);
    };

    const handleCancelEditSlot = () => {
        resetEditState();
    };

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

        try {
            const response = await api.put(
                "/api/faculty/profile",
                {
                    profileImage: profileForm.profileImage,
                    displayName: profileForm.displayName,
                    major: profileForm.major,
                    building: profileForm.building,
                    room: profileForm.room,
                    phoneNumber: profileForm.phoneNumber,
                    contactEmail: profileForm.contactEmail,
                }
            );

            setProfileMessage(response.data.message);
            setProfileForm((currentProfile) => ({
                ...currentProfile,
                ...response.data.user,
            }));
        } catch (error) {
            setProfileMessage(
                error.response?.data?.message || "Failed to update profile"
            );
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
        if (selectedStudentId && !students.some((student) => student._id === selectedStudentId)) {
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

    const facultyPreviewName =
        profileForm.displayName || profileForm.fullName || user?.fullName || "Faculty";
    const facultyPreviewMajor = profileForm.major || "Major not provided";
    const facultyPreviewRoom = profileForm.room || "Room not provided";
    const facultyPreviewBuilding = profileForm.building || "Building not provided";
    const facultyPreviewPhone = profileForm.phoneNumber || "Phone not provided";
    const facultyPreviewEmail =
        profileForm.contactEmail || profileForm.email || user?.email || "Email not provided";
    const { upcomingAppointments, pastAppointments } = splitAppointmentsByTime(appointments);
    const recentPastAppointments = pastAppointments.slice(0, 5);
    const selectedStudent =
        students.find((student) => student._id === selectedStudentId) || null;
    const selectedStudentAppointments = appointments.filter(
        (appointment) => getAppointmentStudentId(appointment) === selectedStudentId
    );
    const {
        upcomingAppointments: selectedStudentUpcomingAppointments,
        pastAppointments: selectedStudentPastAppointments,
    } = splitAppointmentsByTime(selectedStudentAppointments);
    const selectedStudentPendingAppointments = selectedStudentUpcomingAppointments.filter(
        (appointment) => appointment.status === "pending"
    );
    const pendingAppointments = appointments.filter(
        (appointment) => appointment.status === "pending"
    );
    const groupedAvailability = weekDays
        .map((day) => ({
            day,
            slots: availabilitySlots
                .filter((slot) => slot.day === day)
                .sort(
                    (a, b) =>
                        periodOptions.indexOf(a.period) - periodOptions.indexOf(b.period)
                ),
        }))
        .filter((group) => group.slots.length > 0);

    const renderAppointmentsTable = (
        appointmentList,
        {
            showActions = true,
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
                        {showActions && <th>Action</th>}
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
                                {appointment.notes || "No topic provided"}
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
                            {showActions && (
                                <td>
                                    {canApproveAppointment(appointment) ||
                                    canRejectAppointment(appointment) ? (
                                        <div className="faculty-appointment-actions">
                                            {canApproveAppointment(appointment) && (
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
                                            {canRejectAppointment(appointment) && (
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
                                        </div>
                                    ) : (
                                        <span className="faculty-action-placeholder">
                                            No actions
                                        </span>
                                    )}
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
                emptyMessage,
            })}
        </div>
    );

    const renderDashboard = () => (
        <>
            <div className="faculty-stats-grid">
                <div className="faculty-stat-card">
                    <h3>{appointments.length}</h3>
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
                        {profileForm.profileImage ? (
                            <img
                                src={profileForm.profileImage}
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
                                    <strong>Email:</strong>
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
                ) : availabilitySlots.length === 0 ? (
                    <p>No availability slots found.</p>
                ) : (
                    <ul className="availability-list">
                        {availabilitySlots.slice(0, 3).map((slot) => (
                            <li key={slot._id}>
                                {slot.day} - {slot.period} - {slot.availableModes.join(", ")}
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
                        {appointments.length} total
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

            <div className="faculty-appointments-group-stack">
                {renderAppointmentGroup({
                    title: "Upcoming Appointments",
                    appointments: upcomingAppointments,
                    showActions: true,
                    emptyMessage: "No upcoming appointments found.",
                })}
                {renderAppointmentGroup({
                    title: "Past Appointments",
                    appointments: pastAppointments,
                    showActions: false,
                    emptyMessage: "No past appointments found.",
                })}
            </div>
        </section>
    );

    const renderAvailability = () => (
        <section className="faculty-panel">
            <div className="faculty-panel-header">
                <h2>My Availability</h2>
                <span>{availabilitySlots.length} slots</span>
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
            ) : availabilitySlots.length === 0 ? (
                <p>No availability slots found.</p>
            ) : (
                <div className="availability-groups">
                    {groupedAvailability.map((group) => (
                        <div className="availability-day-card" key={group.day}>
                            <div className="availability-day-header">
                                <h3>{group.day}</h3>
                                <button
                                    type="button"
                                    className="delete-day-btn"
                                    onClick={() => handleDeleteAvailabilityDay(group.day)}
                                >
                                    Delete Day
                                </button>
                            </div>

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

                                                <span>{slot.isBooked ? "Booked" : "Available"}</span>
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
                                                <span>{slot.availableModes.join(", ")}</span>
                                                <span>{slot.isBooked ? "Booked" : "Available"}</span>
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
                            {students.length} student{students.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </div>

                {loadingStudents ? (
                    <p>Loading students...</p>
                ) : students.length === 0 ? (
                    <p>No students have booked appointments with you yet.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Student Name</th>
                                <th>Email</th>
                                <th>Course / Major</th>
                                <th>Appointments</th>
                                <th>Last Appointment</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student) => (
                                <tr key={student._id}>
                                    <td>{student.name}</td>
                                    <td>{student.email || "Not provided"}</td>
                                    <td>{student.course || "Not provided"}</td>
                                    <td>{student.appointmentCount}</td>
                                    <td>{student.lastAppointmentDate || "Not available"}</td>
                                    <td className="faculty-student-action-cell">
                                        <button
                                            type="button"
                                            className={`faculty-view-student-btn ${
                                                selectedStudentId === student._id ? "active" : ""
                                            }`}
                                            onClick={() =>
                                                setSelectedStudentId((currentStudentId) =>
                                                    currentStudentId === student._id
                                                        ? null
                                                        : student._id
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
                            <strong>Email</strong>
                            <span>{selectedStudent.email || "Not provided"}</span>
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
            ) : notifications.length === 0 ? (
                <p>No notifications found.</p>
            ) : (
                <div className="notification-list">
                    {notifications.map((notification) => (
                        <div className="notification-card" key={notification._id}>
                            <div className="notification-card-header">
                                <h3>{notification.title}</h3>
                                <span>
                                    {new Date(notification.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <p>{notification.message}</p>
                            <div className="notification-meta">
                                <span>
                                    From: {notification.sender?.fullName || "Unknown sender"}
                                </span>
                                {notification.appointment?.appointmentId && (
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
                        {profileForm.profileImage ? (
                            <img
                                src={profileForm.profileImage}
                                alt={profileForm.displayName || profileForm.fullName || "Faculty"}
                                className="faculty-profile-image"
                            />
                        ) : (
                            <div className="faculty-profile-avatar">
                                {getInitials(profileForm.displayName || profileForm.fullName)}
                            </div>
                        )}

                        <h3>{profileForm.displayName || profileForm.fullName || "Faculty"}</h3>
                        <p>{profileForm.major || "Add your department or major"}</p>
                        <span>{profileForm.contactEmail || profileForm.email || "Add a contact email"}</span>
                        <span>
                            {[profileForm.building, profileForm.room].filter(Boolean).join(", ") ||
                                "Add your office location"}
                        </span>
                        <span>{profileForm.phoneNumber || "Add a phone number"}</span>
                    </div>

                    <form className="faculty-profile-form" onSubmit={handleSaveProfile}>
                        <div className="faculty-profile-grid">
                            <label className="faculty-profile-field">
                                <span>Profile image URL</span>
                                <input
                                    type="text"
                                    name="profileImage"
                                    value={profileForm.profileImage}
                                    onChange={handleProfileChange}
                                    placeholder="https://example.com/profile.jpg"
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Display name</span>
                                <input
                                    type="text"
                                    name="displayName"
                                    value={profileForm.displayName}
                                    onChange={handleProfileChange}
                                    placeholder="How students should see your name"
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
                                <span>Building</span>
                                <input
                                    type="text"
                                    name="building"
                                    value={profileForm.building}
                                    onChange={handleProfileChange}
                                    placeholder="Building C"
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Room</span>
                                <input
                                    type="text"
                                    name="room"
                                    value={profileForm.room}
                                    onChange={handleProfileChange}
                                    placeholder="Room 214"
                                />
                            </label>

                            <label className="faculty-profile-field">
                                <span>Phone number</span>
                                <input
                                    type="text"
                                    name="phoneNumber"
                                    value={profileForm.phoneNumber}
                                    onChange={handleProfileChange}
                                    placeholder="+966 5X XXX XXXX"
                                />
                            </label>

                            <label className="faculty-profile-field faculty-profile-field-wide">
                                <span>Contact email</span>
                                <input
                                    type="email"
                                    name="contactEmail"
                                    value={profileForm.contactEmail}
                                    onChange={handleProfileChange}
                                    placeholder="officehours@example.com"
                                />
                            </label>
                        </div>

                        {profileMessage && (
                            <p className="faculty-profile-message">{profileMessage}</p>
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
        </div>
    );
}

export default FacultyDashboard;
