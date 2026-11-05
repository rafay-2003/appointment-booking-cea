
// BookEase — Appointment Booking System

// Local development uses port 5500 for the frontend.
// In AWS, Nginx will proxy /api requests to Flask.
const API_BASE =
    ["5500", "8000"].includes(window.location.port)
        ? "http://127.0.0.1:5000"
        : "";

const TIME_SLOTS = [
    "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00"
];

const form = document.getElementById("booking-form");
const dateInput = document.getElementById("appointment-date");
const timeInput = document.getElementById("appointment-time");
const slotsContainer = document.getElementById("time-slots");
const tableBody = document.getElementById("appointments-body");
const bookButton = document.getElementById("book-button");
const refreshButton = document.getElementById("refresh-button");
const toast = document.getElementById("toast");

let selectedTime = null;
let slotRequestNumber = 0;
let toastTimeout;

function todayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    if (!value) return "-";

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function formatTime(value) {
    const [hour, minute] = value.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function showToast(message, type = "success") {
    clearTimeout(toastTimeout);

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    toastTimeout = setTimeout(() => {
        toast.className = "toast";
    }, 4000);
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("Invalid response from server");
    }

    if (!response.ok) {
        throw new Error(
            data.error || `Request failed: ${response.status}`
        );
    }

    return data;
}

// Check backend availability

async function checkBackend() {
    const status = document.getElementById("api-status");
    const indicator = document.querySelector(".status-indicator");

    try {
        await apiRequest("/api/health");
        status.textContent = "API Connected";
        indicator.classList.add("online");
    } catch {
        status.textContent = "API Disconnected";
        indicator.classList.remove("online");
    }
}

// Display available and booked time slots

async function loadSlots() {
    const date = dateInput.value;
    const requestNumber = ++slotRequestNumber;

    selectedTime = null;
    timeInput.value = "";
    slotsContainer.replaceChildren();

    if (!date) {
        slotsContainer.textContent = "Select a date first.";
        return;
    }

    slotsContainer.textContent = "Loading available slots...";

    try {
        const result = await apiRequest(
            `/api/slots?date=${encodeURIComponent(date)}`
        );

        // Ignore older responses if the date was changed quickly.
        if (requestNumber !== slotRequestNumber) return;

        slotsContainer.replaceChildren();

        const bookedSlots = result.booked_slots || [];

        TIME_SLOTS.forEach(time => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "slot";
            button.textContent = formatTime(time);

            const booked = bookedSlots.includes(time);
            const isPast =
                date < todayString() ||
                (date === todayString() &&
                 time <= new Date().toTimeString().slice(0, 5));

            if (booked || isPast) {
                button.disabled = true;
                button.title = booked
                    ? "Already booked"
                    : "Time is in the past";
            }

            button.addEventListener("click", () => {
                document.querySelectorAll(".slot").forEach(
                    slot => slot.classList.remove("selected")
                );

                button.classList.add("selected");
                selectedTime = time;
                timeInput.value = time;
            });

            slotsContainer.appendChild(button);
        });

    } catch (error) {
        if (requestNumber !== slotRequestNumber) return;
        slotsContainer.textContent = "Unable to load slots.";
        showToast(error.message, "error");
    }
}

// Load all appointments from PostgreSQL

async function loadAppointments() {
    try {
        const appointments = await apiRequest("/api/appointments");

        updateStatistics(appointments);
        renderAppointments(appointments);

    } catch (error) {
        tableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = "Unable to load appointments.";

        row.appendChild(cell);
        tableBody.appendChild(row);

        showToast(error.message, "error");
    }
}

// Update dashboard cards

function updateStatistics(appointments) {
    const today = todayString();

    const upcoming = appointments.filter(
        item => item.appointment_date >= today
    ).length;

    const todayBookings = appointments.filter(
        item => item.appointment_date === today
    ).length;

    document.getElementById("total-count").textContent =
        appointments.length;

    document.getElementById("upcoming-count").textContent =
        upcoming;

    document.getElementById("today-count").textContent =
        todayBookings;
}

// Build appointment rows safely using textContent

function renderAppointments(appointments) {
    tableBody.replaceChildren();

    if (appointments.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent =
            "No appointments yet. Create your first booking!";

        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    appointments.forEach(appointment => {
        const row = document.createElement("tr");

        const idCell = document.createElement("td");
        idCell.textContent = appointment.id;

        const customerCell = document.createElement("td");
        const name = document.createElement("span");
        name.className = "customer-name";
        name.textContent = appointment.customer_name;

        const email = document.createElement("span");
        email.className = "customer-email";
        email.textContent = appointment.email;

        customerCell.append(name, email);

        const dateCell = document.createElement("td");
        dateCell.textContent =
            formatDate(appointment.appointment_date);

        const timeCell = document.createElement("td");
        timeCell.textContent =
            formatTime(appointment.appointment_time);

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        const isPast =
            appointment.appointment_date < todayString();

        badge.className = isPast
            ? "status-pill past"
            : "status-pill";

        badge.textContent = isPast ? "Past" : "Scheduled";
        statusCell.appendChild(badge);

        const actionCell = document.createElement("td");
        const cancelButton = document.createElement("button");

        cancelButton.className = "cancel-button";
        cancelButton.textContent = "Cancel";
        cancelButton.type = "button";

        cancelButton.addEventListener("click", () => {
            cancelAppointment(appointment.id);
        });

        actionCell.appendChild(cancelButton);

        row.append(
            idCell,
            customerCell,
            dateCell,
            timeCell,
            statusCell,
            actionCell
        );

        tableBody.appendChild(row);
    });
}

// Submit new appointment

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedTime) {
        showToast("Please choose an available time.", "error");
        return;
    }

    const appointment = {
        customer_name:
            document.getElementById("customer-name").value.trim(),

        email:
            document.getElementById("customer-email").value.trim(),

        appointment_date: dateInput.value,
        appointment_time: selectedTime
    };

    bookButton.disabled = true;
    bookButton.textContent = "Booking...";

    try {
        await apiRequest("/api/appointments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(appointment)
        });

        showToast("Appointment booked successfully!");

        // Keep the selected date but clear the other fields.
        document.getElementById("customer-name").value = "";
        document.getElementById("customer-email").value = "";

        await Promise.all([
            loadSlots(),
            loadAppointments()
        ]);

    } catch (error) {
        showToast(error.message, "error");

        // Refresh slots if another user booked the same time.
        await loadSlots();

    } finally {
        bookButton.disabled = false;
        bookButton.textContent = "Confirm Appointment";
    }
});

// Cancel an appointment

async function cancelAppointment(id) {
    if (!confirm("Are you sure you want to cancel this appointment?")) {
        return;
    }

    try {
        await apiRequest(`/api/appointments/${id}`, {
            method: "DELETE"
        });

        showToast("Appointment cancelled successfully!");

        await Promise.all([
            loadAppointments(),
            loadSlots()
        ]);

    } catch (error) {
        showToast(error.message, "error");
    }
}

// Refresh button

refreshButton.addEventListener("click", async () => {
    await Promise.all([
        loadAppointments(),
        loadSlots(),
        checkBackend()
    ]);
});

// Date change

dateInput.addEventListener("change", loadSlots);

// Initial setup

async function initializeApp() {
    dateInput.min = todayString();
    dateInput.value = todayString();

    await Promise.all([
        checkBackend(),
        loadAppointments(),
        loadSlots()
    ]);
}

initializeApp();
