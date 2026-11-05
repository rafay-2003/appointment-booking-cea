
from datetime import date, datetime

import psycopg
from flask import Flask, jsonify, request
from flask_cors import CORS
from psycopg.errors import UniqueViolation

from database import get_connection

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ["http://127.0.0.1:5500"]
        }
    }
)


@app.get("/")
def home():
    return jsonify({
        "message": "Appointment Booking System API",
        "status": "running"
    })


@app.get("/api/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "appointment-booking-backend"
    })


@app.get("/api/appointments")
def get_appointments():
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, customer_name, email,
                       appointment_date, appointment_time,
                       created_at
                FROM appointments
                ORDER BY appointment_date, appointment_time
            """)

            appointments = cursor.fetchall()

    return jsonify([
        {
            "id": item["id"],
            "customer_name": item["customer_name"],
            "email": item["email"],
            "appointment_date":
                item["appointment_date"].isoformat(),
            "appointment_time":
                item["appointment_time"].strftime("%H:%M"),
            "created_at":
                item["created_at"].isoformat()
        }
        for item in appointments
    ])


@app.get("/api/slots")
def get_booked_slots():
    date_text = request.args.get("date", "")

    try:
        requested_date = date.fromisoformat(date_text)
    except ValueError:
        return jsonify({
            "error": "Date must be in YYYY-MM-DD format"
        }), 400

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT appointment_time
                FROM appointments
                WHERE appointment_date = %s
                ORDER BY appointment_time
            """, (requested_date,))

            rows = cursor.fetchall()

    return jsonify({
        "date": requested_date.isoformat(),
        "booked_slots": [
            row["appointment_time"].strftime("%H:%M")
            for row in rows
        ]
    })


@app.post("/api/appointments")
def create_appointment():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required"
        }), 400

    name = data.get("customer_name")
    email = data.get("email")
    date_text = data.get("appointment_date")
    time_text = data.get("appointment_time")

    if not all(isinstance(v, str) for v in [
        name, email, date_text, time_text
    ]):
        return jsonify({
            "error": "All appointment fields are required"
        }), 400

    name = name.strip()
    email = email.strip()

    if not name or len(name) > 100:
        return jsonify({
            "error": "Invalid customer name"
        }), 400

    if (
        not email
        or len(email) > 254
        or "@" not in email
    ):
        return jsonify({
            "error": "Invalid email address"
        }), 400

    try:
        booking_date = date.fromisoformat(date_text)
        booking_time = datetime.strptime(
            time_text, "%H:%M"
        ).time()
    except ValueError:
        return jsonify({
            "error": "Invalid date or time format"
        }), 400

    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO appointments
                    (customer_name, email,
                     appointment_date, appointment_time)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (
                    name,
                    email,
                    booking_date,
                    booking_time
                ))

                appointment_id = cursor.fetchone()["id"]

        except UniqueViolation:
            return jsonify({
                "error": "This appointment slot is already booked"
            }), 409

    return jsonify({
        "message": "Appointment booked successfully",
        "appointment_id": appointment_id
    }), 201


@app.delete("/api/appointments/<int:appointment_id>")
def cancel_appointment(appointment_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM appointments
                WHERE id = %s
                RETURNING id
            """, (appointment_id,))

            deleted = cursor.fetchone()

    if deleted is None:
        return jsonify({
            "error": "Appointment not found"
        }), 404

    return jsonify({
        "message": "Appointment cancelled successfully"
    }), 200


@app.errorhandler(psycopg.OperationalError)
def database_error(error):
    app.logger.error("Database connection failed")
    return jsonify({
        "error": "Database temporarily unavailable"
    }), 503


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
