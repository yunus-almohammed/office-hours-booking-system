import { useEffect, useEffectEvent, useRef, useState } from "react";
import "./AdminDashboard.css";
import api from "./api";
import logo from "./assets/logo.png";

const formatModeLabel = (mode) =>
    mode === "in-person" ? "In-person" : mode === "online" ? "Online" : mode;

const formatStatusLabel = (status) =>
    status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";

const getAppointmentDisplayId = (appointment) =>
    appointment?.appointmentId || appointment?._id || "";

const getUserFullName = (user) => {
    if (!user) {
        return "Unknown";
    }

    return (
        user.fullName ||
        user.name ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.profile?.name ||
        user.email ||
        "Unknown"
    );
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

const parseAppointmentStartMinutes = (timeValue) => {
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

const getAppointmentTimestamp = (appointment) => {
    const parsedDate = parseAppointmentDate(appointment?.date);
    const startMinutes = parseAppointmentStartMinutes(appointment?.time);

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

const isPastAppointment = (appointment) => getAppointmentTimestamp(appointment) < Date.now();

const canApproveAppointment = (appointment) =>
    !isPastAppointment(appointment) &&
    ["pending", "rejected"].includes(appointment?.status);

const canRejectAppointment = (appointment) =>
    !isPastAppointment(appointment) &&
    ["pending", "approved"].includes(appointment?.status);

function AdminDashboard({ onLogout }) {
    const [activeSection, setActiveSection] = useState("dashboard");
    const [pendingRequests, setPendingRequests] = useState([]);
    const [facultyMembers, setFacultyMembers] = useState([]);
    const [students, setStudents] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [adminNotifications, setAdminNotifications] = useState([]);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [loadingAppointments, setLoadingAppointments] = useState(true);
    const [loadingNotifications, setLoadingNotifications] = useState(true);
    const [dashboardMessage, setDashboardMessage] = useState("");
    const [requestsMessage, setRequestsMessage] = useState("");
    const [appointmentsMessage, setAppointmentsMessage] = useState("");
    const [facultyMessage, setFacultyMessage] = useState("");
    const [studentsMessage, setStudentsMessage] = useState("");
    const [notificationsMessage, setNotificationsMessage] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);
    const [appointmentSearch, setAppointmentSearch] = useState("");
    const [facultySearchTerm, setFacultySearchTerm] = useState("");
    const [studentSearchTerm, setStudentSearchTerm] = useState("");
    const activeSectionRef = useRef(activeSection);

    const clearSectionMessages = () => {
        setDashboardMessage("");
        setRequestsMessage("");
        setAppointmentsMessage("");
        setFacultyMessage("");
        setStudentsMessage("");
        setNotificationsMessage("");
    };

    const setFacultyRequestMessage = (section, message) => {
        if (activeSectionRef.current !== section) {
            return;
        }

        if (section === "dashboard") {
            setDashboardMessage(message);
            return;
        }

        setRequestsMessage(message);
    };

    const fetchDashboardData = async () => {
        try {
            setLoadingRequests(true);

            const [pendingRes, facultyRes, studentsRes] = await Promise.all([
                api.get("/api/admin/pending-faculty"),
                api.get("/api/admin/faculty-members"),
                api.get("/api/admin/students"),
            ]);

            setPendingRequests(pendingRes.data);
            setFacultyMembers(facultyRes.data);
            setStudents(studentsRes.data);
        } catch (error) {
            console.error("Failed to load admin dashboard data", error);
        } finally {
            setLoadingRequests(false);
        }
    };

    const fetchAppointments = async () => {
        try {
            setLoadingAppointments(true);

            const response = await api.get("/api/appointments");

            setAppointments(response.data);
        } catch (error) {
            console.error("Failed to load appointments", error);
        } finally {
            setLoadingAppointments(false);
        }
    };

    const fetchAdminNotifications = async () => {
        try {
            setLoadingNotifications(true);

            const response = await api.get("/api/notifications/my");

            setAdminNotifications(response.data);
        } catch (error) {
            console.error("Failed to load admin notifications", error);
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
        await fetchAdminNotifications();
    };

    const handleFacultyRequestAction = async (requestId, action, section) => {
        try {
            const response = await api.patch(
                `/api/admin/faculty-requests/${requestId}/${action}`
            );

            setFacultyRequestMessage(section, response.data.message);
            await fetchDashboardData();
        } catch (error) {
            setFacultyRequestMessage(
                section,
                error.response?.data?.message || "Faculty request update failed"
            );
        }
    };

    const handleFacultyRequestBulkAction = async (action, section) => {
        try {
            const response = await api.patch(
                `/api/admin/faculty-requests/${action}-all`
            );

            setFacultyRequestMessage(section, response.data.message);
            await fetchDashboardData();
        } catch (error) {
            setFacultyRequestMessage(
                section,
                error.response?.data?.message || "Bulk faculty request update failed"
            );
        }
    };

    const handleAppointmentAction = async (appointmentId, action) => {
        try {
            const response = await api.patch(
                `/api/appointments/${appointmentId}/${action}`
            );

            if (activeSectionRef.current === "appointments") {
                setAppointmentsMessage(response.data.message);
            }
            await fetchAppointments();
        } catch (error) {
            if (activeSectionRef.current === "appointments") {
                setAppointmentsMessage(
                    error.response?.data?.message || "Appointment update failed"
                );
            }
        }
    };

    const handleAppointmentBulkAction = async (action) => {
        try {
            const response = await api.patch(
                `/api/appointments/admin/${action}-all`
            );

            if (activeSectionRef.current === "appointments") {
                setAppointmentsMessage(response.data.message);
            }
            await fetchAppointments();
        } catch (error) {
            if (activeSectionRef.current === "appointments") {
                setAppointmentsMessage(
                    error.response?.data?.message || "Bulk appointment update failed"
                );
            }
        }
    };

    const handleDeleteFacultyAccount = async (facultyId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this faculty account?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await api.delete(`/api/admin/faculty/${facultyId}`);

            if (activeSectionRef.current === "faculty") {
                setFacultyMessage(response.data.message);
            }
            setFacultyMembers((currentFacultyMembers) =>
                currentFacultyMembers.filter((faculty) => faculty._id !== facultyId)
            );
            setAppointments((currentAppointments) =>
                currentAppointments.filter(
                    (appointment) => appointment.faculty?._id !== facultyId
                )
            );
            setAdminNotifications((currentNotifications) =>
                currentNotifications.filter(
                    (notification) => notification.sender?._id !== facultyId
                )
            );
        } catch (error) {
            if (activeSectionRef.current === "faculty") {
                setFacultyMessage(
                    error.response?.data?.message || "Faculty account deletion failed"
                );
            }
        }
    };

    const handleDeleteStudentAccount = async (studentId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this student account?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await api.delete(`/api/admin/students/${studentId}`);

            if (activeSectionRef.current === "students") {
                setStudentsMessage(response.data.message);
            }
            setStudents((currentStudents) =>
                currentStudents.filter((student) => student._id !== studentId)
            );
            setAppointments((currentAppointments) =>
                currentAppointments.filter(
                    (appointment) => appointment.student?._id !== studentId
                )
            );
        } catch (error) {
            if (activeSectionRef.current === "students") {
                setStudentsMessage(
                    error.response?.data?.message || "Student account deletion failed"
                );
            }
        }
    };

    const handleDeleteNotification = async (notificationId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this notification?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await api.delete(
                `/api/admin/notifications/${notificationId}`
            );

            if (activeSectionRef.current === "notifications") {
                setNotificationsMessage(response.data.message);
            }
            setAdminNotifications((currentNotifications) =>
                currentNotifications.filter(
                    (notification) => notification._id !== notificationId
                )
            );
        } catch (error) {
            if (activeSectionRef.current === "notifications") {
                setNotificationsMessage(
                    error.response?.data?.message || "Notification deletion failed"
                );
            }
        }
    };

    const loadDashboardData = useEffectEvent(fetchDashboardData);
    const loadAppointments = useEffectEvent(fetchAppointments);
    const loadNotifications = useEffectEvent(fetchAdminNotifications);
    const loadUnreadCount = useEffectEvent(fetchUnreadCount);

    useEffect(() => {
        loadDashboardData();
        loadAppointments();
        loadNotifications();
        loadUnreadCount();
    }, []);

    useEffect(() => {
        activeSectionRef.current = activeSection;
        clearSectionMessages();

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

    const recentAppointments = appointments.slice(0, 5);
    const pendingAppointments = appointments.filter(
        (appointment) => appointment.status === "pending"
    );
    const filteredAppointments = appointments.filter((appointment) =>
        getAppointmentDisplayId(appointment)
            .toLowerCase()
            .includes(appointmentSearch.trim().toLowerCase())
    );
    const filteredFacultyMembers = facultyMembers.filter((faculty) => {
        const query = facultySearchTerm.trim().toLowerCase();

        if (!query) {
            return true;
        }

        return (
            faculty._id?.toLowerCase().includes(query) ||
            faculty.fullName?.toLowerCase().includes(query) ||
            faculty.displayName?.toLowerCase().includes(query)
        );
    });
    const filteredStudents = students.filter((student) => {
        const query = studentSearchTerm.trim().toLowerCase();

        if (!query) {
            return true;
        }

        return (
            student._id?.toLowerCase().includes(query) ||
            student.fullName?.toLowerCase().includes(query)
        );
    });

    const renderRequestActions = (requestId, section) => (
        <div className="table-actions">
            <button
                type="button"
                className="approve-btn"
                onClick={() => handleFacultyRequestAction(requestId, "approve", section)}
            >
                Approve
            </button>
            <button
                type="button"
                className="reject-btn"
                onClick={() => handleFacultyRequestAction(requestId, "reject", section)}
            >
                Reject
            </button>
        </div>
    );

    const renderAppointmentActions = (appointment) => {
        if (!canApproveAppointment(appointment) && !canRejectAppointment(appointment)) {
            return <span className="status expired">No actions</span>;
        }

        return (
            <div className="table-actions">
                {canApproveAppointment(appointment) && (
                    <button
                        type="button"
                        className="approve-btn"
                        onClick={() => handleAppointmentAction(appointment._id, "approve")}
                    >
                        Approve
                    </button>
                )}
                {canRejectAppointment(appointment) && (
                    <button
                        type="button"
                        className="reject-btn"
                        onClick={() => handleAppointmentAction(appointment._id, "reject")}
                    >
                        Reject
                    </button>
                )}
            </div>
        );
    };

    const renderDashboard = () => (
        <>
            {dashboardMessage && <p className="dashboard-message">{dashboardMessage}</p>}

            <div className="stats-grid">
                <div className="stat-card">
                    <h3>{pendingRequests.length}</h3>
                    <p>Pending Faculty Requests</p>
                </div>
                <div className="stat-card">
                    <h3>{facultyMembers.length}</h3>
                    <p>Total Faculty</p>
                </div>
                <div className="stat-card">
                    <h3>{students.length}</h3>
                    <p>Total Students</p>
                </div>
                <div className="stat-card">
                    <h3>{appointments.length}</h3>
                    <p>Total Appointments</p>
                </div>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2>Pending Faculty Requests</h2>
                    <div className="panel-header-actions">
                        <button
                            type="button"
                            className="approve-btn"
                            onClick={() =>
                                handleFacultyRequestBulkAction("approve", "dashboard")
                            }
                        >
                            Accept All
                        </button>
                        <button
                            type="button"
                            className="reject-btn"
                            onClick={() =>
                                handleFacultyRequestBulkAction("reject", "dashboard")
                            }
                        >
                            Reject All
                        </button>
                        <span onClick={() => setActiveSection("requests")}>View All</span>
                    </div>
                </div>

                {loadingRequests ? (
                    <p>Loading requests...</p>
                ) : pendingRequests.length === 0 ? (
                    <p>No pending faculty requests.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Requested Role</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingRequests.map((request) => (
                                <tr key={request._id}>
                                    <td>{request.fullName}</td>
                                    <td>{request.email}</td>
                                    <td>{request.requestedRole}</td>
                                    <td>
                                        <span className="status pending">
                                            {formatStatusLabel(request.approvalStatus)}
                                        </span>
                                    </td>
                                    <td>{renderRequestActions(request._id, "dashboard")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>Recent Appointments</h2>
                    <span onClick={() => setActiveSection("appointments")}>View All</span>
                </div>

                {loadingAppointments ? (
                    <p>Loading appointments...</p>
                ) : recentAppointments.length === 0 ? (
                    <p>No appointments found.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Faculty</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentAppointments.map((appointment) => (
                                <tr key={appointment._id}>
                                    <td>{getUserFullName(appointment.student)}</td>
                                    <td>{getUserFullName(appointment.faculty)}</td>
                                    <td>{appointment.date}</td>
                                    <td>{appointment.time}</td>
                                    <td>
                                        <span className={`status ${appointment.status}`}>
                                            {formatStatusLabel(appointment.status)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </>
    );

    const renderFacultyRequests = () => (
        <section className="panel">
            <div className="panel-header">
                <h2>Faculty Requests</h2>
                <div className="panel-header-actions">
                    <button
                        type="button"
                        className="approve-btn"
                        onClick={() => handleFacultyRequestBulkAction("approve", "requests")}
                    >
                        Accept All
                    </button>
                    <button
                        type="button"
                        className="reject-btn"
                        onClick={() => handleFacultyRequestBulkAction("reject", "requests")}
                    >
                        Reject All
                    </button>
                    <span>{pendingRequests.length} pending</span>
                </div>
            </div>

            {requestsMessage && <p className="dashboard-message">{requestsMessage}</p>}

            {loadingRequests ? (
                <p>Loading requests...</p>
            ) : pendingRequests.length === 0 ? (
                <p>No pending faculty requests.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Requested Role</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingRequests.map((request) => (
                            <tr key={request._id}>
                                <td>{request.fullName}</td>
                                <td>{request.email}</td>
                                <td>{request.requestedRole}</td>
                                <td>
                                    <span className="status pending">
                                        {formatStatusLabel(request.approvalStatus)}
                                    </span>
                                </td>
                                <td>{renderRequestActions(request._id, "requests")}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );

    const renderAppointments = () => (
        <section className="panel">
            <div className="panel-header">
                <h2>Appointments</h2>
                <div className="panel-header-actions">
                    <button
                        type="button"
                        className="approve-btn"
                        onClick={() => handleAppointmentBulkAction("approve")}
                    >
                        Accept All
                    </button>
                    <button
                        type="button"
                        className="reject-btn"
                        onClick={() => handleAppointmentBulkAction("reject")}
                    >
                        Reject All
                    </button>
                    <span>{pendingAppointments.length} pending</span>
                </div>
            </div>

            {appointmentsMessage && (
                <p className="dashboard-message">{appointmentsMessage}</p>
            )}

            <div className="appointment-search-bar">
                <input
                    type="text"
                    className="appointment-search-input"
                    placeholder="Search by appointment ID"
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                />
            </div>

            {loadingAppointments ? (
                <p>Loading appointments...</p>
            ) : filteredAppointments.length === 0 ? (
                <p>No appointments found.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Appointment ID</th>
                            <th>Student</th>
                            <th>Faculty</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Mode</th>
                            <th>Topic</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAppointments.map((appointment) => (
                            <tr key={appointment._id}>
                                <td>
                                    <span
                                        className="appointment-id-cell"
                                        title={getAppointmentDisplayId(appointment)}
                                    >
                                        {getAppointmentDisplayId(appointment)}
                                    </span>
                                </td>
                                <td>{getUserFullName(appointment.student)}</td>
                                <td>{getUserFullName(appointment.faculty)}</td>
                                <td>{appointment.date}</td>
                                <td>{appointment.time}</td>
                                <td>{formatModeLabel(appointment.mode)}</td>
                                <td className="table-topic">
                                    {appointment.notes || "No topic provided"}
                                </td>
                                <td>
                                    <span className={`status ${appointment.status}`}>
                                        {formatStatusLabel(appointment.status)}
                                    </span>
                                </td>
                                <td>{renderAppointmentActions(appointment)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );

    const renderFacultyMembers = () => (
        <section className="panel">
            <div className="panel-header">
                <h2>Faculty Members</h2>
                <span>{facultyMembers.length} total</span>
            </div>

            {facultyMessage && <p className="dashboard-message">{facultyMessage}</p>}

            <div className="appointment-search-bar">
                <input
                    type="text"
                    className="appointment-search-input"
                    placeholder="Search faculty by name or ID"
                    value={facultySearchTerm}
                    onChange={(e) => setFacultySearchTerm(e.target.value)}
                />
            </div>

            {loadingRequests ? (
                <p>Loading faculty members...</p>
            ) : filteredFacultyMembers.length === 0 ? (
                <p>No faculty members found.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredFacultyMembers.map((faculty) => (
                            <tr key={faculty._id}>
                                <td>
                                    <span className="user-id-cell" title={faculty._id}>
                                        {faculty._id}
                                    </span>
                                </td>
                                <td>{getUserFullName(faculty)}</td>
                                <td>{faculty.email}</td>
                                <td>{faculty.role}</td>
                                <td>
                                    <span className={`status ${faculty.approvalStatus}`}>
                                        {formatStatusLabel(faculty.approvalStatus)}
                                    </span>
                                </td>
                                <td>
                                    <div className="table-actions">
                                        <button
                                            type="button"
                                            className="reject-btn"
                                            onClick={() => handleDeleteFacultyAccount(faculty._id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );

    const renderStudents = () => (
        <section className="panel">
            <div className="panel-header">
                <h2>Students</h2>
                <span>{students.length} total</span>
            </div>

            {studentsMessage && <p className="dashboard-message">{studentsMessage}</p>}

            <div className="appointment-search-bar">
                <input
                    type="text"
                    className="appointment-search-input"
                    placeholder="Search students by name or ID"
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                />
            </div>

            {loadingRequests ? (
                <p>Loading students...</p>
            ) : filteredStudents.length === 0 ? (
                <p>No students found.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>User ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.map((student) => (
                            <tr key={student._id}>
                                <td>
                                    <span className="user-id-cell" title={student._id}>
                                        {student._id}
                                    </span>
                                </td>
                                <td>{student.fullName}</td>
                                <td>{student.email}</td>
                                <td>{student.role}</td>
                                <td>
                                    <span className={`status ${student.approvalStatus}`}>
                                        {formatStatusLabel(student.approvalStatus)}
                                    </span>
                                </td>
                                <td>
                                    <div className="table-actions">
                                        <button
                                            type="button"
                                            className="reject-btn"
                                            onClick={() => handleDeleteStudentAccount(student._id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );

    const renderNotifications = () => (
        <section className="panel">
            <div className="panel-header">
                <h2>Notifications</h2>
                <span>{adminNotifications.length} total</span>
            </div>

            {notificationsMessage && (
                <p className="dashboard-message">{notificationsMessage}</p>
            )}

            {loadingNotifications ? (
                <p>Loading notifications...</p>
            ) : adminNotifications.length === 0 ? (
                <p>No notifications found.</p>
            ) : (
                <div className="notification-list">
                    {adminNotifications.map((notification) => (
                        <div className="notification-card" key={notification._id}>
                            <div className="notification-card-header">
                                <h3>{notification.title}</h3>
                                <span>{new Date(notification.createdAt).toLocaleString()}</span>
                            </div>
                            <p>{notification.message}</p>
                            <div className="notification-meta">
                                <span>
                                    Sender: {notification.sender?.fullName || "Unknown faculty"}
                                </span>
                                <span>Type: {notification.type}</span>
                            </div>
                            <div className="notification-card-actions">
                                <button
                                    type="button"
                                    className="reject-btn"
                                    onClick={() => handleDeleteNotification(notification._id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );

    const getTitle = () => {
        if (activeSection === "requests") return "Faculty Requests";
        if (activeSection === "faculty") return "Faculty Members";
        if (activeSection === "students") return "Students";
        if (activeSection === "appointments") return "Appointments";
        if (activeSection === "notifications") return "Notifications";
        return "Admin Dashboard";
    };

    return (
        <div className="admin-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <img src={logo} alt="Office Hours Logo" className="sidebar-logo-img" />
                </div>

                <nav className="sidebar-menu sidebar-nav">
                    <button
                        className={`menu-item ${activeSection === "dashboard" ? "active" : ""}`}
                        onClick={() => setActiveSection("dashboard")}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`menu-item ${activeSection === "requests" ? "active" : ""}`}
                        onClick={() => setActiveSection("requests")}
                    >
                        Faculty Requests
                    </button>
                    <button
                        className={`menu-item ${activeSection === "faculty" ? "active" : ""}`}
                        onClick={() => setActiveSection("faculty")}
                    >
                        Faculty Members
                    </button>
                    <button
                        className={`menu-item ${activeSection === "students" ? "active" : ""}`}
                        onClick={() => setActiveSection("students")}
                    >
                        Students
                    </button>
                    <button
                        className={`menu-item ${activeSection === "appointments" ? "active" : ""}`}
                        onClick={() => setActiveSection("appointments")}
                    >
                        Appointments
                    </button>
                    <button
                        className={`menu-item ${activeSection === "notifications" ? "active" : ""}`}
                        onClick={handleNotificationsClick}
                    >
                        <span className="menu-item-label">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="notification-badge">{unreadCount}</span>
                        )}
                    </button>
                </nav>

                <button className="logout-btn" onClick={onLogout}>
                    Logout
                </button>
            </aside>

            <main className="dashboard-content">
                <div className="topbar">
                    <h1>{getTitle()}</h1>
                    <div className="admin-badge">Admin</div>
                </div>

                {activeSection === "dashboard" && renderDashboard()}
                {activeSection === "requests" && renderFacultyRequests()}
                {activeSection === "faculty" && renderFacultyMembers()}
                {activeSection === "students" && renderStudents()}
                {activeSection === "appointments" && renderAppointments()}
                {activeSection === "notifications" && renderNotifications()}
            </main>
        </div>
    );
}

export default AdminDashboard;
