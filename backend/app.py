"""Tiko Zetu - Event Ticketing Platform API."""

import os
import io
import uuid
import random
import string
from datetime import datetime, timezone, date, time, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
import qrcode

from models import db, User, Event, Booking


def create_app():
    app = Flask(__name__, static_folder='../frontend', static_url_path='')
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'tiko-zetu-dev-secret-key-change-in-prod')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
        os.path.abspath(os.path.dirname(__file__)), '..', 'instance', 'tikozetu.db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

    CORS(app, supports_credentials=True)
    db.init_app(app)

    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'error': 'Authentication required'}), 401

    def role_required(*roles):
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                if not current_user.is_authenticated:
                    return jsonify({'error': 'Authentication required'}), 401
                if current_user.role not in roles:
                    return jsonify({'error': 'Access denied'}), 403
                return f(*args, **kwargs)
            return decorated_function
        return decorator

    def generate_booking_ref():
        prefix = 'TZ'
        chars = string.ascii_uppercase + string.digits
        code = ''.join(random.choices(chars, k=8))
        return f'{prefix}-{code}'

    # ─── Serve Frontend ──────────────────────────────────────────────
    @app.route('/')
    def serve_index():
        return send_file('../frontend/index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        full = os.path.join(app.static_folder, path)
        if os.path.isfile(full):
            return send_file(full)
        return send_file('../frontend/index.html')

    # ─── Auth Endpoints ──────────────────────────────────────────────
    @app.route('/api/auth/register', methods=['POST'])
    def register():
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required = ['username', 'email', 'password', 'full_name']
        for field in required:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        if User.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Username already taken'}), 409
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already registered'}), 409

        user = User(
            username=data['username'],
            email=data['email'],
            full_name=data['full_name'],
            phone=data.get('phone', ''),
            role=data.get('role', 'attendee'),
        )
        user.set_password(data['password'])
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return jsonify({'message': 'Registration successful', 'user': user.to_dict()}), 201

    @app.route('/api/auth/login', methods=['POST'])
    def login():
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        identifier = data.get('identifier', '')
        password = data.get('password', '')

        user = User.query.filter(
            (User.username == identifier) | (User.email == identifier)
        ).first()

        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid credentials'}), 401

        if not user.is_active:
            return jsonify({'error': 'Account is deactivated'}), 403

        login_user(user)
        return jsonify({'message': 'Login successful', 'user': user.to_dict()})

    @app.route('/api/auth/logout', methods=['POST'])
    @login_required
    def logout():
        logout_user()
        return jsonify({'message': 'Logged out successfully'})

    @app.route('/api/auth/me')
    @login_required
    def get_current_user():
        return jsonify({'user': current_user.to_dict()})

    # ─── Event Endpoints ─────────────────────────────────────────────
    @app.route('/api/events', methods=['GET'])
    def list_events():
        query = Event.query

        # Filters
        category = request.args.get('category')
        location = request.args.get('location')
        search = request.args.get('search')
        min_price = request.args.get('min_price', type=float)
        max_price = request.args.get('max_price', type=float)
        status = request.args.get('status', 'approved')
        featured = request.args.get('featured')

        if status:
            query = query.filter_by(status=status)
        if category:
            query = query.filter_by(category=category)
        if location:
            query = query.filter(Event.location.ilike(f'%{location}%'))
        if search:
            query = query.filter(
                (Event.title.ilike(f'%{search}%')) |
                (Event.description.ilike(f'%{search}%'))
            )
        if min_price is not None:
            query = query.filter(Event.price >= min_price)
        if max_price is not None:
            query = query.filter(Event.price <= max_price)
        if featured:
            query = query.filter_by(is_featured=True)

        query = query.order_by(Event.date.asc())
        events = query.all()
        return jsonify({'events': [e.to_dict() for e in events]})

    @app.route('/api/events/<string:public_id>', methods=['GET'])
    def get_event(public_id):
        event = Event.query.filter_by(public_id=public_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        return jsonify({'event': event.to_dict()})

    @app.route('/api/events', methods=['POST'])
    @login_required
    @role_required('organizer', 'admin')
    def create_event():
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required = ['title', 'description', 'location', 'date', 'start_time']
        for field in required:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        try:
            event_date = date.fromisoformat(data['date'])
            start_time = time.fromisoformat(data['start_time'])
            end_time = time.fromisoformat(data['end_time']) if data.get('end_time') else None
        except ValueError:
            return jsonify({'error': 'Invalid date or time format'}), 400

        event = Event(
            title=data['title'],
            description=data['description'],
            category=data.get('category', 'general'),
            location=data['location'],
            venue=data.get('venue', ''),
            date=event_date,
            start_time=start_time,
            end_time=end_time,
            price=float(data.get('price', 0)),
            currency=data.get('currency', 'KES'),
            total_tickets=int(data.get('total_tickets', 100)),
            image_url=data.get('image_url', ''),
            status='approved' if current_user.role == 'admin' else 'pending',
            organizer_id=current_user.id,
        )
        db.session.add(event)
        db.session.commit()
        return jsonify({'message': 'Event created successfully', 'event': event.to_dict()}), 201

    @app.route('/api/events/<string:public_id>', methods=['PUT'])
    @login_required
    def update_event(public_id):
        event = Event.query.filter_by(public_id=public_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404

        if current_user.role != 'admin' and event.organizer_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        for field in ['title', 'description', 'category', 'location', 'venue',
                      'image_url', 'currency']:
            if field in data:
                setattr(event, field, data[field])

        if 'price' in data:
            event.price = float(data['price'])
        if 'total_tickets' in data:
            event.total_tickets = int(data['total_tickets'])
        if 'date' in data:
            event.date = date.fromisoformat(data['date'])
        if 'start_time' in data:
            event.start_time = time.fromisoformat(data['start_time'])
        if 'end_time' in data:
            event.end_time = time.fromisoformat(data['end_time']) if data['end_time'] else None

        db.session.commit()
        return jsonify({'message': 'Event updated', 'event': event.to_dict()})

    @app.route('/api/events/<string:public_id>', methods=['DELETE'])
    @login_required
    def delete_event(public_id):
        event = Event.query.filter_by(public_id=public_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404

        if current_user.role != 'admin' and event.organizer_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403

        db.session.delete(event)
        db.session.commit()
        return jsonify({'message': 'Event deleted'})

    @app.route('/api/events/<string:public_id>/approve', methods=['POST'])
    @login_required
    @role_required('admin')
    def approve_event(public_id):
        event = Event.query.filter_by(public_id=public_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        event.status = 'approved'
        db.session.commit()
        return jsonify({'message': 'Event approved', 'event': event.to_dict()})

    @app.route('/api/events/<string:public_id>/reject', methods=['POST'])
    @login_required
    @role_required('admin')
    def reject_event(public_id):
        event = Event.query.filter_by(public_id=public_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        event.status = 'rejected'
        db.session.commit()
        return jsonify({'message': 'Event rejected', 'event': event.to_dict()})

    # ─── My Events (Organizer) ───────────────────────────────────────
    @app.route('/api/my-events', methods=['GET'])
    @login_required
    @role_required('organizer', 'admin')
    def my_events():
        events = Event.query.filter_by(organizer_id=current_user.id).order_by(Event.date.desc()).all()
        return jsonify({'events': [e.to_dict() for e in events]})

    # ─── Booking Endpoints ───────────────────────────────────────────
    @app.route('/api/bookings', methods=['POST'])
    @login_required
    def create_booking():
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        event_id = data.get('event_id')
        quantity = int(data.get('quantity', 1))

        event = Event.query.filter_by(public_id=event_id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404

        if event.status != 'approved':
            return jsonify({'error': 'Event is not available for booking'}), 400

        if quantity > event.tickets_available:
            return jsonify({'error': f'Only {event.tickets_available} tickets available'}), 400

        if quantity < 1:
            return jsonify({'error': 'Quantity must be at least 1'}), 400

        total_amount = event.price * quantity
        booking = Booking(
            booking_ref=generate_booking_ref(),
            quantity=quantity,
            total_amount=total_amount,
            user_id=current_user.id,
            event_id=event.id,
        )
        event.tickets_sold += quantity

        db.session.add(booking)
        db.session.commit()
        return jsonify({'message': 'Booking confirmed!', 'booking': booking.to_dict()}), 201

    @app.route('/api/bookings', methods=['GET'])
    @login_required
    def list_bookings():
        if current_user.role == 'admin':
            bookings = Booking.query.order_by(Booking.created_at.desc()).all()
        else:
            bookings = Booking.query.filter_by(user_id=current_user.id).order_by(
                Booking.created_at.desc()
            ).all()
        return jsonify({'bookings': [b.to_dict() for b in bookings]})

    @app.route('/api/bookings/<string:booking_ref>', methods=['GET'])
    @login_required
    def get_booking(booking_ref):
        booking = Booking.query.filter_by(booking_ref=booking_ref).first()
        if not booking:
            return jsonify({'error': 'Booking not found'}), 404
        if current_user.role != 'admin' and booking.user_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403
        return jsonify({'booking': booking.to_dict()})

    @app.route('/api/bookings/<string:booking_ref>/cancel', methods=['POST'])
    @login_required
    def cancel_booking(booking_ref):
        booking = Booking.query.filter_by(booking_ref=booking_ref).first()
        if not booking:
            return jsonify({'error': 'Booking not found'}), 404
        if current_user.role != 'admin' and booking.user_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403
        if booking.status == 'cancelled':
            return jsonify({'error': 'Booking already cancelled'}), 400

        booking.status = 'cancelled'
        booking.event.tickets_sold -= booking.quantity
        db.session.commit()
        return jsonify({'message': 'Booking cancelled', 'booking': booking.to_dict()})

    # ─── QR Code / Ticket ────────────────────────────────────────────
    @app.route('/api/tickets/<string:ticket_code>/qr', methods=['GET'])
    @login_required
    def get_ticket_qr(ticket_code):
        booking = Booking.query.filter_by(ticket_code=ticket_code).first()
        if not booking:
            return jsonify({'error': 'Ticket not found'}), 404
        if current_user.role != 'admin' and booking.user_id != current_user.id:
            return jsonify({'error': 'Access denied'}), 403

        qr_data = f'TIKOZETU|{booking.booking_ref}|{booking.ticket_code}|{booking.event.title}|{booking.quantity}'
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color='#1a1a2e', back_color='white')

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return send_file(buf, mimetype='image/png', as_attachment=False,
                         download_name=f'ticket-{booking.booking_ref}.png')

    @app.route('/api/tickets/verify', methods=['POST'])
    @login_required
    @role_required('admin', 'organizer')
    def verify_ticket():
        data = request.get_json()
        ticket_code = data.get('ticket_code', '')

        # Support both raw code and QR-scanned pipe-delimited string
        if '|' in ticket_code:
            parts = ticket_code.split('|')
            if len(parts) >= 3:
                ticket_code = parts[2]

        booking = Booking.query.filter_by(ticket_code=ticket_code).first()
        if not booking:
            return jsonify({'valid': False, 'error': 'Ticket not found'}), 404
        if booking.status == 'cancelled':
            return jsonify({'valid': False, 'error': 'Ticket has been cancelled'}), 400
        if booking.is_verified:
            return jsonify({
                'valid': False,
                'error': 'Ticket already used',
                'verified_at': booking.verified_at.isoformat() if booking.verified_at else None
            }), 400

        booking.is_verified = True
        booking.status = 'used'
        booking.verified_at = datetime.now(timezone.utc)
        db.session.commit()

        return jsonify({
            'valid': True,
            'message': 'Ticket verified successfully',
            'booking': booking.to_dict()
        })

    # ─── Admin Endpoints ─────────────────────────────────────────────
    @app.route('/api/admin/users', methods=['GET'])
    @login_required
    @role_required('admin')
    def admin_list_users():
        users = User.query.order_by(User.created_at.desc()).all()
        return jsonify({'users': [u.to_dict() for u in users]})

    @app.route('/api/admin/users/<int:user_id>/toggle', methods=['POST'])
    @login_required
    @role_required('admin')
    def admin_toggle_user(user_id):
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.id == current_user.id:
            return jsonify({'error': 'Cannot deactivate yourself'}), 400
        user.is_active = not user.is_active
        db.session.commit()
        return jsonify({'message': f'User {"activated" if user.is_active else "deactivated"}', 'user': user.to_dict()})

    @app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
    @login_required
    @role_required('admin')
    def admin_change_role(user_id):
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        data = request.get_json()
        new_role = data.get('role')
        if new_role not in ('attendee', 'organizer', 'admin'):
            return jsonify({'error': 'Invalid role'}), 400
        user.role = new_role
        db.session.commit()
        return jsonify({'message': 'Role updated', 'user': user.to_dict()})

    @app.route('/api/admin/events', methods=['GET'])
    @login_required
    @role_required('admin')
    def admin_list_events():
        status = request.args.get('status')
        query = Event.query
        if status:
            query = query.filter_by(status=status)
        events = query.order_by(Event.created_at.desc()).all()
        return jsonify({'events': [e.to_dict() for e in events]})

    @app.route('/api/admin/stats', methods=['GET'])
    @login_required
    @role_required('admin')
    def admin_stats():
        total_users = User.query.count()
        total_events = Event.query.count()
        approved_events = Event.query.filter_by(status='approved').count()
        pending_events = Event.query.filter_by(status='pending').count()
        total_bookings = Booking.query.count()
        total_revenue = db.session.query(db.func.sum(Booking.total_amount)).filter(
            Booking.status != 'cancelled'
        ).scalar() or 0
        verified_tickets = Booking.query.filter_by(is_verified=True).count()

        return jsonify({
            'stats': {
                'total_users': total_users,
                'total_events': total_events,
                'approved_events': approved_events,
                'pending_events': pending_events,
                'total_bookings': total_bookings,
                'total_revenue': total_revenue,
                'verified_tickets': verified_tickets,
            }
        })

    return app


def seed_database(app):
    """Seed the database with sample data."""
    with app.app_context():
        if User.query.first():
            return

        # Admin user
        admin = User(username='admin', email='admin@tikozetu.co.ke',
                     full_name='System Admin', role='admin', phone='+254700000001')
        admin.set_password('admin123')
        db.session.add(admin)

        # Organizer
        organizer = User(username='events_ke', email='organizer@tikozetu.co.ke',
                         full_name='Kenya Events Co.', role='organizer', phone='+254700000002')
        organizer.set_password('organizer123')
        db.session.add(organizer)

        # Attendee
        attendee = User(username='jane_doe', email='jane@example.com',
                        full_name='Jane Doe', role='attendee', phone='+254700000003')
        attendee.set_password('attendee123')
        db.session.add(attendee)

        db.session.flush()

        # Sample events
        sample_events = [
            Event(
                title='Nairobi Tech Summit 2026',
                description='The largest technology conference in East Africa featuring keynotes from industry leaders, hands-on workshops, and networking opportunities. Join 2000+ tech enthusiasts for two days of innovation.',
                category='technology',
                location='Nairobi',
                venue='KICC Convention Center',
                date=date(2026, 8, 15),
                start_time=time(9, 0),
                end_time=time(18, 0),
                price=3500,
                total_tickets=500,
                image_url='https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
                status='approved',
                is_featured=True,
                organizer_id=organizer.id,
            ),
            Event(
                title='Safaricom Jazz Festival',
                description='An evening of world-class jazz performances under the stars. Featuring both local and international artists in a premium open-air setting with gourmet food and craft beverages.',
                category='music',
                location='Nairobi',
                venue='Ngong Racecourse',
                date=date(2026, 9, 5),
                start_time=time(16, 0),
                end_time=time(23, 0),
                price=5000,
                total_tickets=1000,
                image_url='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
                status='approved',
                is_featured=True,
                organizer_id=organizer.id,
            ),
            Event(
                title='Maasai Mara Cultural Experience',
                description='Immerse yourself in Maasai culture with traditional dances, storytelling, and authentic cuisine. A unique cultural event celebrating Kenya\'s rich heritage.',
                category='culture',
                location='Narok',
                venue='Maasai Mara Conservancy',
                date=date(2026, 7, 20),
                start_time=time(8, 0),
                end_time=time(17, 0),
                price=8000,
                total_tickets=200,
                image_url='https://images.unsplash.com/photo-1489392191049-fc10c97e64b6?w=800',
                status='approved',
                is_featured=True,
                organizer_id=organizer.id,
            ),
            Event(
                title='Startup Pitch Night Mombasa',
                description='Watch 10 of the most promising startups pitch their ideas to a panel of investors. Networking session and drinks included.',
                category='business',
                location='Mombasa',
                venue='Swahili Beach Hotel',
                date=date(2026, 8, 25),
                start_time=time(18, 0),
                end_time=time(22, 0),
                price=1500,
                total_tickets=300,
                image_url='https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800',
                status='approved',
                organizer_id=organizer.id,
            ),
            Event(
                title='Lamu Food Festival',
                description='A three-day celebration of coastal Kenyan cuisine. Enjoy cooking demonstrations, food tastings, and cultural performances on the beautiful Lamu waterfront.',
                category='food',
                location='Lamu',
                venue='Lamu Waterfront',
                date=date(2026, 10, 10),
                start_time=time(10, 0),
                end_time=time(20, 0),
                price=2000,
                total_tickets=400,
                image_url='https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
                status='approved',
                organizer_id=organizer.id,
            ),
            Event(
                title='Nairobi Marathon 2026',
                description='Join thousands of runners in the annual Nairobi Marathon. Categories include full marathon, half marathon, and 10K fun run. All proceeds go to charity.',
                category='sports',
                location='Nairobi',
                venue='Uhuru Gardens',
                date=date(2026, 11, 8),
                start_time=time(6, 0),
                end_time=time(14, 0),
                price=1000,
                total_tickets=2000,
                image_url='https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=800',
                status='approved',
                organizer_id=organizer.id,
            ),
            Event(
                title='Kisumu Lakeside Art Exhibition',
                description='Discover contemporary East African art at this lakeside gallery event. Meet the artists, enjoy live painting demonstrations, and purchase original works.',
                category='art',
                location='Kisumu',
                venue='Kisumu Yacht Club',
                date=date(2026, 9, 18),
                start_time=time(10, 0),
                end_time=time(18, 0),
                price=500,
                total_tickets=150,
                image_url='https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800',
                status='pending',
                organizer_id=organizer.id,
            ),
        ]

        for event in sample_events:
            db.session.add(event)

        db.session.commit()
        print('Database seeded successfully.')


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
        seed_database(app)
    app.run(debug=True, host='0.0.0.0', port=5000)
