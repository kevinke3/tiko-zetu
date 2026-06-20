"""Database models for Tiko Zetu event ticketing platform."""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(50), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='attendee')  # attendee, organizer, admin
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    events = db.relationship('Event', backref='organizer', lazy=True, foreign_keys='Event.organizer_id')
    bookings = db.relationship('Booking', backref='attendee', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'public_id': self.public_id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'phone': self.phone,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Event(db.Model):
    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(50), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False, default='general')
    location = db.Column(db.String(200), nullable=False)
    venue = db.Column(db.String(200), nullable=True)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=True)
    price = db.Column(db.Float, nullable=False, default=0.0)
    currency = db.Column(db.String(5), nullable=False, default='KES')
    total_tickets = db.Column(db.Integer, nullable=False, default=100)
    tickets_sold = db.Column(db.Integer, nullable=False, default=0)
    image_url = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending, approved, rejected, cancelled
    is_featured = db.Column(db.Boolean, default=False)
    organizer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    bookings = db.relationship('Booking', backref='event', lazy=True)

    @property
    def tickets_available(self):
        return self.total_tickets - self.tickets_sold

    def to_dict(self):
        return {
            'id': self.id,
            'public_id': self.public_id,
            'title': self.title,
            'description': self.description,
            'category': self.category,
            'location': self.location,
            'venue': self.venue,
            'date': self.date.isoformat() if self.date else None,
            'start_time': self.start_time.strftime('%H:%M') if self.start_time else None,
            'end_time': self.end_time.strftime('%H:%M') if self.end_time else None,
            'price': self.price,
            'currency': self.currency,
            'total_tickets': self.total_tickets,
            'tickets_sold': self.tickets_sold,
            'tickets_available': self.tickets_available,
            'image_url': self.image_url,
            'status': self.status,
            'is_featured': self.is_featured,
            'organizer': self.organizer.to_dict() if self.organizer else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Booking(db.Model):
    __tablename__ = 'bookings'

    id = db.Column(db.Integer, primary_key=True)
    booking_ref = db.Column(db.String(20), unique=True, nullable=False)
    ticket_code = db.Column(db.String(50), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    quantity = db.Column(db.Integer, nullable=False, default=1)
    total_amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='confirmed')  # confirmed, cancelled, used
    is_verified = db.Column(db.Boolean, default=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'booking_ref': self.booking_ref,
            'ticket_code': self.ticket_code,
            'quantity': self.quantity,
            'total_amount': self.total_amount,
            'status': self.status,
            'is_verified': self.is_verified,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'event': self.event.to_dict() if self.event else None,
            'attendee': self.attendee.to_dict() if self.attendee else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
