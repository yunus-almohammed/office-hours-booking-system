import { useEffect, useEffectEvent, useState } from "react";
import "./StudentDashboard.css";
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

const buildUpcomingDates = (slots) => {
    const safeSlots = toSafeArray(slots);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uniqueDays = [...new Set(safeSlots.map((slot) => slot?.day).filter(Boolean))];

    return uniqueDays
        .map((day) => {
            const targetDayIndex = weekDays.indexOf(day);

            if (targetDayIndex === -1) {
                return null;
            }

            const nextDate = new Date(today);
            const dayOffset = (targetDayIndex - today.getDay() + 7) % 7;
            nextDate.setDate(today.getDate() + dayOffset);

            return {
                day,
                value: formatDateValue(nextDate),
                label: formatDateLabel(nextDate),
                appointmentLabel: formatAppointmentDate(nextDate),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.value.localeCompare(b.value));
};

function StudentDashboard({ onLogout, user }) {
    const [activeSection, setActiveSection] = useState("booking");
    const [facultyMembers, setFacultyMembers] = useState([]);
    const [loadingFaculty, setLoadingFaculty] = useState(true);
    const [facultyMessage, setFacultyMessage] = useState("");
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
    const [bookingMessage, setBookingMessage] = useState("");
    const [isBookingAppointment, setIsBookingAppointment] = useState(false);

    const safeFacultyMembers = toSafeArray(facultyMembers);
    const safeFacultyAvailability = toSafeArray(facultyAvailability);
    const bookingDays = buildUpcomingDates(safeFacultyAvailability);
    const selectedDateOption = bookingDays.find((day) => day.value === selectedDate) || null;
    const selectedDay = selectedDateOption?.day || "";
    const visibleSlots = safeFacultyAvailability.filter((slot) => slot?.day === selectedDay);
    const selectedSlot =
        safeFacultyAvailability.find((slot) => slot?._id === selectedSlotId) || null;
    const { upcomingAppointments, pastAppointments } = splitAppointmentsByTime(
        toSafeArray(studentAppointments)
    );
    const totalStudentAppointments = upcomingAppointments.length + pastAppointments.length;
    const safeNotifications = toSafeArray(notifications);

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
        setBookingMessage("");
        setFacultyAvailability([]);
    };

    const handleViewAvailability = async (faculty) => {
        setSelectedFaculty(faculty);
        setSelectedSlotId("");
        setSelectedMode("");
        setTopic("");
        setBookingMessage("");
        setSelectedDate("");
        await fetchFacultyAvailability(faculty._id);
    };

    const handleBackToFacultySelection = () => {
        setSelectedFaculty(null);
        resetBookingSelection();
    };

    const handleSelectSlot = (slot) => {
        setSelectedSlotId(slot._id);
        setSelectedMode(toSafeArray(slot?.availableModes)[0] || "");
        setBookingMessage("");
    };

    const handleConfirmAppointment = async (e) => {
        e.preventDefault();

        if (!selectedFaculty || !selectedDateOption || !selectedSlotId || !selectedMode) {
            setBookingMessage("Please select a faculty member, date, slot/time, and mode first.");
            return;
        }

        try {
            setIsBookingAppointment(true);

            const trimmedTopic = topic?.trim?.() || "";
            const response = await api.post(
                "/api/student/appointments",
                {
                    facultyId: selectedFaculty._id,
                    day: selectedDay,
                    date: selectedDateOption.appointmentLabel,
                    slotId: selectedSlotId,
                    mode: selectedMode,
                    notes: trimmedTopic || "",
                }
            );

            setBookingMessage(response.data.message || "Appointment request submitted successfully.");
            setSelectedSlotId("");
            setSelectedMode("");
            setTopic("");
            await fetchFacultyAvailability(selectedFaculty._id);
            await fetchStudentAppointments();
        } catch (error) {
            setBookingMessage(
                error.response?.data?.message || "Failed to confirm appointment"
            );
        } finally {
            setIsBookingAppointment(false);
        }
    };

    const loadFacultyMembers = useEffectEvent(fetchFacultyMembers);
    const loadStudentAppointments = useEffectEvent(fetchStudentAppointments);
    const loadNotifications = useEffectEvent(fetchNotifications);
    const loadUnreadCount = useEffectEvent(fetchUnreadCount);

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
            return;
        }

        if (selectedDate && !bookingDays.some((day) => day.value === selectedDate)) {
            setSelectedDate("");
            setSelectedSlotId("");
            setSelectedMode("");
            setTopic("");
        }
    }, [selectedFaculty, facultyAvailability, selectedDate, bookingDays]);

    useEffect(() => {
        if (activeSection === "appointments") {
            loadStudentAppointments();
        }

        if (activeSection === "notifications") {
            loadNotifications();
        }
    }, [activeSection]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            loadUnreadCount();
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, []);

    const renderFacultyCardImage = (faculty) =>
        faculty.profileImage ? (
            <img
                src={faculty.profileImage}
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
                        <span>{safeFacultyMembers.length} faculty available</span>
                    </div>

                    {facultyMessage && (
                        <p className="student-appointments-message">{facultyMessage}</p>
                    )}

                    {loadingFaculty ? (
                        <p>Loading faculty members...</p>
                    ) : safeFacultyMembers.length === 0 ? (
                        <p className="student-empty-state">No approved faculty members found.</p>
                    ) : (
                        <div className="student-faculty-list-grid">
                            {safeFacultyMembers.map((faculty) => (
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
                                This faculty member has no open availability right now.
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
                                        No slots are available for this date.
                                    </p>
                                ) : (
                                    <div className="student-slots-grid">
                                        {visibleSlots.map((slot) => (
                                            <div className="student-slot-card" key={slot._id}>
                                                <h3>{slot.period}</h3>
                                                <p>
                                                    {slot.availableModes
                                                        ? toSafeArray(slot.availableModes)
                                                        .map((mode) => formatModeLabel(mode))
                                                        .join(", ")
                                                        : ""}
                                                </p>
                                                <button
                                                    type="button"
                                                    className="student-book-slot-btn"
                                                    onClick={() => handleSelectSlot(slot)}
                                                >
                                                    {selectedSlotId === slot._id
                                                        ? "Selected"
                                                        : "Book Appointment"}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {selectedSlot && (
                        <form
                            className="student-details-section"
                            onSubmit={handleConfirmAppointment}
                        >
                            <div className="student-panel-header">
                                <h2>Appointment Details</h2>
                                <span>Complete the request</span>
                            </div>

                            <div className="student-details-row">
                                <label htmlFor="student-selected-time">Selected time</label>
                                <select
                                    id="student-selected-time"
                                    className="student-details-input"
                                    value={selectedSlotId}
                                    onChange={(e) => {
                                        const nextSlot = visibleSlots.find(
                                            (slot) => slot._id === e.target.value
                                        );
                                        setSelectedSlotId(e.target.value);
                                        setSelectedMode(
                                            toSafeArray(nextSlot?.availableModes)[0] || ""
                                        );
                                        setBookingMessage("");
                                    }}
                                >
                                    <option value="">Choose a time slot</option>
                                    {visibleSlots.map((slot) => (
                                        <option key={slot._id} value={slot._id}>
                                            {slot.period}
                                        </option>
                                    ))}
                                </select>
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
                                <label htmlFor="student-topic">Topic (Optional)</label>
                                <input
                                    id="student-topic"
                                    type="text"
                                    className="student-details-input"
                                    placeholder="Describe what you want to discuss"
                                    value={topic}
                                    onChange={(e) => {
                                        setTopic(e.target.value);
                                        setBookingMessage("");
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="student-confirm-btn"
                                disabled={isBookingAppointment}
                            >
                                {isBookingAppointment
                                    ? "Confirming Appointment..."
                                    : "Confirm Appointment"}
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
                {appointmentList.map((appointment) => (
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
                                <strong>{appointment.notes || "No topic provided"}</strong>
                            </div>
                            <div className="student-appointment-detail">
                                <span>Status</span>
                                <strong>{formatStatusLabel(appointment.status)}</strong>
                            </div>
                        </div>
                    </div>
                ))}
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

    const getTitle = () => {
        if (activeSection === "appointments") return "My Appointments";
        if (activeSection === "notifications") return "Notifications";
        return "Book Appointment";
    };

    return (
        <div className="student-layout">
            <aside className="student-sidebar">
                <div className="student-sidebar-logo">
                    <img src={logo} alt="Office Hours Logo" className="student-sidebar-logo-img" />
                </div>

                <nav className="student-sidebar-menu">
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
                {activeSection === "notifications" && renderNotifications()}
            </main>
        </div>
    );
}

export default StudentDashboard;
