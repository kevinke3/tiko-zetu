/**
 * Tiko Zetu — Main Application Logic
 */

let currentUser = null;
let currentPage = 'home';
let searchTimeout = null;
let currentBookingQty = 1;
let currentEventData = null;

// ─── Initialization ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    loadFeaturedEvents();

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('userDropdown');
        const avatar = document.getElementById('userAvatar');
        if (dropdown && !dropdown.contains(e.target) && !avatar.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
});

// ─── Auth ───────────────────────────────────────────────────
async function checkAuth() {
    try {
        const data = await api.me();
        currentUser = data.user;
        updateUIForUser();
    } catch {
        currentUser = null;
        updateUIForGuest();
    }
}

function updateUIForUser() {
    document.getElementById('guestActions').style.display = 'none';
    document.getElementById('userActions').style.display = 'block';
    document.getElementById('avatarInitial').textContent = currentUser.full_name.charAt(0).toUpperCase();
    document.getElementById('dropdownName').textContent = currentUser.full_name;
    document.getElementById('dropdownRole').textContent = currentUser.role;

    document.querySelectorAll('.auth-only').forEach(el => el.style.display = '');
    document.querySelectorAll('.organizer-only').forEach(el => {
        el.style.display = ['organizer', 'admin'].includes(currentUser.role) ? '' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = currentUser.role === 'admin' ? '' : 'none';
    });
}

function updateUIForGuest() {
    document.getElementById('guestActions').style.display = 'flex';
    document.getElementById('userActions').style.display = 'none';
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.organizer-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('show');
}

function toggleMobileNav() {
    document.getElementById('navLinks').classList.toggle('show');
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    try {
        const identifier = document.getElementById('loginIdentifier').value;
        const password = document.getElementById('loginPassword').value;
        const data = await api.login(identifier, password);
        currentUser = data.user;
        updateUIForUser();
        showToast('Welcome back, ' + currentUser.full_name + '!', 'success');
        navigate('home');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Log In</span>';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

    try {
        const data = await api.register({
            full_name: document.getElementById('regFullName').value,
            username: document.getElementById('regUsername').value,
            email: document.getElementById('regEmail').value,
            phone: document.getElementById('regPhone').value,
            role: document.getElementById('regRole').value,
            password: document.getElementById('regPassword').value,
        });
        currentUser = data.user;
        updateUIForUser();
        showToast('Account created successfully!', 'success');
        navigate('home');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Create Account</span>';
    }
}

async function handleLogout() {
    try {
        await api.logout();
    } catch {}
    currentUser = null;
    updateUIForGuest();
    showToast('Logged out successfully', 'info');
    navigate('home');
}

// ─── Navigation ─────────────────────────────────────────────
function navigate(page, data) {
    document.getElementById('navLinks').classList.remove('show');
    document.getElementById('userDropdown')?.classList.remove('show');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const pageEl = document.getElementById('page-' + page);
    if (pageEl) {
        pageEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const navMap = { home: 0, events: 1, 'my-tickets': 2, 'organizer-dashboard': 3, admin: 4 };
    const navLinks = document.querySelectorAll('.nav-link');
    if (navMap[page] !== undefined && navLinks[navMap[page]]) {
        navLinks[navMap[page]].classList.add('active');
    }

    currentPage = page;

    switch (page) {
        case 'events': loadAllEvents(); break;
        case 'event-detail': loadEventDetail(data); break;
        case 'my-tickets': loadMyTickets(); break;
        case 'organizer-dashboard': loadOrganizerDashboard(); break;
        case 'organizer-earnings': loadOrganizerEarnings(); break;
        case 'admin': loadAdminPanel(); break;
    }
}

// ─── Events ─────────────────────────────────────────────────
async function loadFeaturedEvents() {
    const grid = document.getElementById('featuredEventsGrid');
    try {
        const data = await api.getEvents({ featured: 'true', status: 'approved' });
        grid.innerHTML = data.events.length
            ? data.events.map(renderEventCard).join('')
            : '<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>No featured events yet</h3></div>';
    } catch {
        grid.innerHTML = '<div class="empty-state"><h3>Unable to load events</h3></div>';
    }
}

async function loadAllEvents() {
    const grid = document.getElementById('allEventsGrid');
    grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading events...</div>';

    const params = { status: 'approved' };
    const search = document.getElementById('searchInput')?.value;
    const category = document.getElementById('categoryFilter')?.value;
    const location = document.getElementById('locationFilter')?.value;
    const priceRange = document.getElementById('priceFilter')?.value;

    if (search) params.search = search;
    if (category) params.category = category;
    if (location) params.location = location;
    if (priceRange) {
        const [min, max] = priceRange.split('-');
        params.min_price = min;
        params.max_price = max;
    }

    try {
        const data = await api.getEvents(params);
        grid.innerHTML = data.events.length
            ? data.events.map(renderEventCard).join('')
            : '<div class="empty-state"><i class="fas fa-search"></i><h3>No events found</h3><p>Try adjusting your filters</p></div>';
    } catch {
        grid.innerHTML = '<div class="empty-state"><h3>Unable to load events</h3></div>';
    }
}

function renderEventCard(event) {
    const imageHtml = event.image_url
        ? `<img src="${event.image_url}" alt="${escapeHtml(event.title)}" class="event-card-image" onerror="this.outerHTML='<div class=\\'event-card-image-placeholder\\'><i class=\\'fas fa-calendar-alt\\'></i></div>'">`
        : '<div class="event-card-image-placeholder"><i class="fas fa-calendar-alt"></i></div>';

    const ticketsLeft = event.tickets_available;
    const ticketClass = ticketsLeft <= 20 ? 'low' : '';

    const priceText = event.price === 0
        ? '<span class="event-price">Free</span>'
        : `<span class="event-price">${event.currency} ${event.price.toLocaleString()}<small>/ticket</small></span>`;

    return `
        <div class="event-card" onclick="navigate('event-detail', '${event.public_id}')">
            ${imageHtml}
            <div class="event-card-body">
                <span class="event-card-category">${escapeHtml(event.category)}</span>
                <h3 class="event-card-title">${escapeHtml(event.title)}</h3>
                <div class="event-card-meta">
                    <span><i class="fas fa-calendar"></i> ${formatDate(event.date)}</span>
                    <span><i class="fas fa-clock"></i> ${event.start_time}${event.end_time ? ' - ' + event.end_time : ''}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}${event.venue ? ', ' + escapeHtml(event.venue) : ''}</span>
                </div>
                <div class="event-card-footer">
                    ${priceText}
                    <span class="event-tickets-left ${ticketClass}">${ticketsLeft} left</span>
                </div>
            </div>
        </div>
    `;
}

async function loadEventDetail(publicId) {
    const container = document.getElementById('eventDetailContent');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const data = await api.getEvent(publicId);
        const event = data.event;
        currentEventData = event;
        currentBookingQty = 1;

        const imageHtml = event.image_url
            ? `<img src="${event.image_url}" alt="${escapeHtml(event.title)}" class="event-detail-image" onerror="this.style.display='none'">`
            : '';

        const priceDisplay = event.price === 0 ? 'Free' : `${event.currency} ${event.price.toLocaleString()}`;
        const totalDisplay = event.price === 0 ? 'Free' : `${event.currency} ${(event.price * currentBookingQty).toLocaleString()}`;

        container.innerHTML = `
            <div>
                ${imageHtml}
                <div class="event-detail-info" style="margin-top: 24px;">
                    <span class="event-detail-category">${escapeHtml(event.category)}</span>
                    <h1 class="event-detail-title">${escapeHtml(event.title)}</h1>
                    <div class="event-detail-meta">
                        <div class="meta-item"><i class="fas fa-calendar"></i><span>${formatDate(event.date)}</span></div>
                        <div class="meta-item"><i class="fas fa-clock"></i><span>${event.start_time}${event.end_time ? ' - ' + event.end_time : ''}</span></div>
                        <div class="meta-item"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(event.location)}${event.venue ? ', ' + escapeHtml(event.venue) : ''}</span></div>
                        <div class="meta-item"><i class="fas fa-user"></i><span>by ${escapeHtml(event.organizer?.full_name || 'Unknown')}</span></div>
                    </div>
                    <div class="event-detail-description">${escapeHtml(event.description)}</div>
                </div>
            </div>
            <div>
                <div class="event-detail-booking-card">
                    <div class="booking-price">${priceDisplay}<small> /ticket</small></div>
                    <div class="booking-availability">${event.tickets_available} tickets available out of ${event.total_tickets}</div>

                    ${event.tickets_available > 0 ? `
                    <div class="booking-quantity">
                        <label>Quantity:</label>
                        <div class="qty-control">
                            <button type="button" onclick="updateQty(-1)"><i class="fas fa-minus"></i></button>
                            <span id="qtyDisplay">1</span>
                            <button type="button" onclick="updateQty(1)"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                    ${event.price > 0 ? `
                    <div class="form-group" style="margin: 16px 0;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px; display: block;">M-Pesa Phone Number</label>
                        <div class="input-wrapper">
                            <i class="fas fa-phone"></i>
                            <input type="tel" id="mpesaPhone" placeholder="e.g. 0712345678" value="${currentUser?.phone || ''}" style="width: 100%;">
                        </div>
                        <small style="color: var(--text-muted); font-size: 0.75rem;">You'll receive an STK push on this number</small>
                    </div>
                    ` : ''}
                    <div class="booking-total">
                        <span>Total</span>
                        <span class="booking-total-amount" id="bookingTotalAmount">${totalDisplay}</span>
                    </div>
                    ${event.price > 0 ? `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 10px; background: rgba(0,200,83,0.08); border-radius: 8px; font-size: 0.82rem; color: var(--secondary);">
                        <i class="fas fa-shield-alt"></i>
                        <span>Secured by M-Pesa Lipa Na M-Pesa</span>
                    </div>
                    ` : ''}
                    <button class="btn btn-primary btn-block btn-lg" onclick="handleBooking('${event.public_id}')" id="bookNowBtn">
                        <i class="fas fa-${event.price > 0 ? 'mobile-alt' : 'ticket-alt'}"></i> ${event.price > 0 ? 'Pay with M-Pesa' : 'Book Now'}
                    </button>
                    ` : `
                    <button class="btn btn-ghost btn-block btn-lg" disabled>
                        <i class="fas fa-times-circle"></i> Sold Out
                    </button>
                    `}
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Event not found</h3></div>';
    }
}

function updateQty(delta) {
    if (!currentEventData) return;
    const newQty = currentBookingQty + delta;
    if (newQty < 1 || newQty > currentEventData.tickets_available) return;
    currentBookingQty = newQty;
    document.getElementById('qtyDisplay').textContent = newQty;
    const total = currentEventData.price * newQty;
    const totalDisplay = currentEventData.price === 0 ? 'Free' : `${currentEventData.currency} ${total.toLocaleString()}`;
    document.getElementById('bookingTotalAmount').textContent = totalDisplay;
}

async function handleBooking(eventPublicId) {
    if (!currentUser) {
        showToast('Please log in to book tickets', 'error');
        navigate('login');
        return;
    }

    const btn = document.getElementById('bookNowBtn');
    const phoneInput = document.getElementById('mpesaPhone');
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (currentEventData && currentEventData.price > 0 && !phone) {
        showToast('Please enter your M-Pesa phone number', 'error');
        if (phoneInput) phoneInput.focus();
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initiating payment...';

    try {
        const data = await api.createBooking(eventPublicId, currentBookingQty, phone);

        if (data.payment_pending) {
            showToast('Check your phone for the M-Pesa prompt!', 'success');
            showPaymentPendingModal(data.booking.booking_ref, data.checkout_request_id);
        } else {
            const msg = data.simulated
                ? 'Booking confirmed! (Payment simulated — configure M-Pesa for real payments)'
                : 'Booking confirmed! Check My Tickets for your QR code.';
            showToast(msg, 'success');
            navigate('my-tickets');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        const isPaid = currentEventData && currentEventData.price > 0;
        btn.innerHTML = `<i class="fas fa-${isPaid ? 'mobile-alt' : 'ticket-alt'}"></i> ${isPaid ? 'Pay with M-Pesa' : 'Book Now'}`;
    }
}

function showPaymentPendingModal(bookingRef, checkoutRequestId) {
    const modal = document.getElementById('ticketModal');
    const body = document.getElementById('ticketModalBody');

    body.innerHTML = `
        <div class="ticket-detail" style="text-align: center;">
            <div style="font-size: 3rem; color: var(--accent-warm); margin-bottom: 16px;"><i class="fas fa-mobile-alt"></i></div>
            <h3>Waiting for M-Pesa Payment</h3>
            <p style="color: var(--text-secondary); margin: 12px 0;">Please check your phone and enter your M-Pesa PIN to complete the payment.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Booking Ref: <strong>${bookingRef}</strong></p>
            <div style="margin: 24px 0;">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--secondary);"></i></div>
                <p id="paymentStatusText" style="margin-top: 12px; color: var(--text-secondary);">Waiting for payment confirmation...</p>
            </div>
            <button class="btn btn-ghost" onclick="closeModal('ticketModal'); navigate('my-tickets');" style="margin-top: 12px;">Check My Tickets</button>
        </div>
    `;

    modal.classList.add('show');
    pollPaymentStatus(bookingRef, 0);
}

async function pollPaymentStatus(bookingRef, attempts) {
    if (attempts > 30) {
        const el = document.getElementById('paymentStatusText');
        if (el) el.textContent = 'Payment timeout. Check My Tickets for status.';
        return;
    }

    try {
        const data = await api.getBookingStatus(bookingRef);
        if (data.payment_status === 'completed') {
            showToast('Payment received! Your ticket is ready.', 'success');
            closeModal('ticketModal');
            navigate('my-tickets');
            return;
        } else if (data.payment_status === 'failed') {
            const el = document.getElementById('paymentStatusText');
            if (el) {
                el.textContent = 'Payment failed or was cancelled.';
                el.style.color = 'var(--danger)';
            }
            showToast('Payment failed. Please try again.', 'error');
            return;
        }
    } catch (err) {
        // ignore and retry
    }

    setTimeout(() => pollPaymentStatus(bookingRef, attempts + 1), 3000);
}

// ─── Filters ────────────────────────────────────────────────
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => applyFilters(), 400);
}

function applyFilters() {
    if (currentPage === 'events') loadAllEvents();
}

function filterByCategory(category) {
    navigate('events');
    setTimeout(() => {
        document.getElementById('categoryFilter').value = category;
        applyFilters();
    }, 100);
}

// ─── My Tickets ─────────────────────────────────────────────
async function loadMyTickets() {
    if (!currentUser) {
        navigate('login');
        return;
    }

    const container = document.getElementById('ticketsList');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading tickets...</div>';

    try {
        const data = await api.getBookings();
        const bookings = data.bookings;

        if (!bookings.length) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-ticket-alt"></i>
                    <h3>No tickets yet</h3>
                    <p>Browse events and book your first ticket!</p>
                    <button class="btn btn-primary" onclick="navigate('events')" style="margin-top: 16px;">
                        <i class="fas fa-search"></i> Browse Events
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = bookings.map(booking => {
            const event = booking.event;
            const paymentBadge = booking.payment_status === 'completed'
                ? '<span style="color: var(--secondary); font-size: 0.75rem;"><i class="fas fa-check-circle"></i> Paid</span>'
                : booking.payment_status === 'pending'
                    ? '<span style="color: var(--accent-warm); font-size: 0.75rem;"><i class="fas fa-clock"></i> Payment Pending</span>'
                    : booking.payment_status === 'failed'
                        ? '<span style="color: var(--danger); font-size: 0.75rem;"><i class="fas fa-times-circle"></i> Payment Failed</span>'
                        : '';
            return `
                <div class="ticket-card">
                    <div class="ticket-card-header">
                        <span class="ticket-card-event-name">${escapeHtml(event.title)}</span>
                        <span class="ticket-status ${booking.status}">${booking.status === 'pending_payment' ? 'pending' : booking.status}</span>
                    </div>
                    <div class="ticket-card-body">
                        <div class="meta-row"><i class="fas fa-hashtag"></i> Ref: ${booking.booking_ref}</div>
                        <div class="meta-row"><i class="fas fa-calendar"></i> ${formatDate(event.date)}</div>
                        <div class="meta-row"><i class="fas fa-clock"></i> ${event.start_time}</div>
                        <div class="meta-row"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div>
                        <div class="meta-row"><i class="fas fa-users"></i> ${booking.quantity} ticket(s)</div>
                        <div class="meta-row"><i class="fas fa-money-bill"></i> ${event.currency} ${booking.total_amount.toLocaleString()}</div>
                        <div class="meta-row">${paymentBadge}</div>
                        ${booking.payment && booking.payment.mpesa_receipt ? `<div class="meta-row"><i class="fas fa-receipt"></i> M-Pesa: ${booking.payment.mpesa_receipt}</div>` : ''}
                    </div>
                    <div class="ticket-card-footer">
                        ${booking.status === 'confirmed' ? `
                            <button class="btn btn-primary btn-sm" onclick="showTicketQR('${booking.booking_ref}', '${booking.ticket_code}', '${escapeHtml(event.title)}', '${formatDate(event.date)}', ${booking.quantity})">
                                <i class="fas fa-qrcode"></i> View QR
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="cancelBooking('${booking.booking_ref}')">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        ` : booking.status === 'pending_payment' ? `
                            <button class="btn btn-primary btn-sm" onclick="showPaymentPendingModal('${booking.booking_ref}')">
                                <i class="fas fa-clock"></i> Check Payment
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="cancelBooking('${booking.booking_ref}')">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        ` : booking.status === 'used' ? `
                            <span style="font-size: 0.85rem; color: var(--accent-warm);"><i class="fas fa-check-circle"></i> Attended</span>
                        ` : `
                            <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fas fa-ban"></i> Cancelled</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load tickets</h3></div>';
    }
}

function showTicketQR(bookingRef, ticketCode, eventTitle, eventDate, quantity) {
    const modal = document.getElementById('ticketModal');
    const body = document.getElementById('ticketModalBody');

    body.innerHTML = `
        <div class="ticket-detail">
            <h3>${eventTitle}</h3>
            <p class="ticket-ref">Booking Ref: ${bookingRef}</p>
            <div class="ticket-qr-container">
                <img src="${api.getTicketQRUrl(ticketCode)}" alt="QR Code" onerror="this.alt='QR code unavailable'">
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">Scan this QR code at the event entrance</p>
            <div class="ticket-info-grid">
                <div class="ticket-info-item"><label>Date</label><span>${eventDate}</span></div>
                <div class="ticket-info-item"><label>Tickets</label><span>${quantity}</span></div>
                <div class="ticket-info-item"><label>Ref</label><span>${bookingRef}</span></div>
                <div class="ticket-info-item"><label>Status</label><span style="color: var(--secondary);">Confirmed</span></div>
            </div>
        </div>
    `;

    modal.classList.add('show');
}

async function cancelBooking(bookingRef) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
        await api.cancelBooking(bookingRef);
        showToast('Booking cancelled', 'info');
        loadMyTickets();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Organizer Dashboard ────────────────────────────────────
async function loadOrganizerDashboard() {
    if (!currentUser || !['organizer', 'admin'].includes(currentUser.role)) {
        navigate('login');
        return;
    }

    const container = document.getElementById('organizerEventsContainer');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const data = await api.getMyEvents();
        const events = data.events;

        if (!events.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <h3>No events yet</h3>
                    <p>Create your first event to get started</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Price</th>
                        <th>Tickets</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${events.map(e => `
                        <tr>
                            <td><strong>${escapeHtml(e.title)}</strong></td>
                            <td>${formatDate(e.date)}</td>
                            <td>${e.price === 0 ? 'Free' : e.currency + ' ' + e.price.toLocaleString()}</td>
                            <td>${e.tickets_sold}/${e.total_tickets}</td>
                            <td><span class="status-badge ${e.status}">${e.status}</span></td>
                            <td>
                                <div class="table-actions">
                                    <button class="btn btn-outline btn-sm" onclick="openEditEventModal('${e.public_id}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteEvent('${e.public_id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load events</h3></div>';
    }
}

function openCreateEventModal() {
    document.getElementById('eventFormTitle').textContent = 'Create New Event';
    document.getElementById('eventFormSubmitBtn').textContent = 'Create Event';
    document.getElementById('eventForm').reset();
    document.getElementById('evtEditId').value = '';
    openModal('eventFormModal');
}

async function openEditEventModal(publicId) {
    try {
        const data = await api.getEvent(publicId);
        const e = data.event;
        document.getElementById('eventFormTitle').textContent = 'Edit Event';
        document.getElementById('eventFormSubmitBtn').textContent = 'Save Changes';
        document.getElementById('evtEditId').value = publicId;
        document.getElementById('evtTitle').value = e.title;
        document.getElementById('evtCategory').value = e.category;
        document.getElementById('evtDescription').value = e.description;
        document.getElementById('evtLocation').value = e.location;
        document.getElementById('evtVenue').value = e.venue || '';
        document.getElementById('evtDate').value = e.date;
        document.getElementById('evtStartTime').value = e.start_time;
        document.getElementById('evtEndTime').value = e.end_time || '';
        document.getElementById('evtPrice').value = e.price;
        document.getElementById('evtTickets').value = e.total_tickets;
        document.getElementById('evtImage').value = e.image_url || '';
        openModal('eventFormModal');
    } catch (err) {
        showToast('Error loading event', 'error');
    }
}

async function handleEventSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('evtEditId').value;
    const btn = document.getElementById('eventFormSubmitBtn');
    btn.disabled = true;

    const payload = {
        title: document.getElementById('evtTitle').value,
        category: document.getElementById('evtCategory').value,
        description: document.getElementById('evtDescription').value,
        location: document.getElementById('evtLocation').value,
        venue: document.getElementById('evtVenue').value,
        date: document.getElementById('evtDate').value,
        start_time: document.getElementById('evtStartTime').value,
        end_time: document.getElementById('evtEndTime').value || null,
        price: parseFloat(document.getElementById('evtPrice').value),
        total_tickets: parseInt(document.getElementById('evtTickets').value),
        image_url: document.getElementById('evtImage').value,
    };

    try {
        if (editId) {
            await api.updateEvent(editId, payload);
            showToast('Event updated!', 'success');
        } else {
            await api.createEvent(payload);
            showToast('Event created! It will be reviewed by admin.', 'success');
        }
        closeModal('eventFormModal');
        loadOrganizerDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteEvent(publicId) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
        await api.deleteEvent(publicId);
        showToast('Event deleted', 'info');
        loadOrganizerDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Organizer Earnings ────────────────────────────────────────
async function loadOrganizerEarnings() {
    const container = document.getElementById('organizerEarningsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading earnings...</div>';

    try {
        const data = await api.getOrganizerEarnings();
        const e = data.earnings;
        const commPct = (e.commission_rate * 100).toFixed(0);

        container.innerHTML = `
            <div class="admin-stats" style="margin-bottom: 32px;">
                <div class="stat-card">
                    <div class="stat-card-icon green"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="stat-card-value">KES ${e.total_sales.toLocaleString()}</div>
                    <div class="stat-card-label">Total Sales</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon yellow"><i class="fas fa-percentage"></i></div>
                    <div class="stat-card-value">KES ${e.platform_fee.toLocaleString()}</div>
                    <div class="stat-card-label">Platform Fee (${commPct}%)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon purple"><i class="fas fa-wallet"></i></div>
                    <div class="stat-card-value">KES ${e.net_earnings.toLocaleString()}</div>
                    <div class="stat-card-label">Net Earnings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon green"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-card-value">KES ${e.total_paid.toLocaleString()}</div>
                    <div class="stat-card-label">Paid Out</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon pink"><i class="fas fa-coins"></i></div>
                    <div class="stat-card-value">KES ${e.balance.toLocaleString()}</div>
                    <div class="stat-card-label">Available Balance</div>
                </div>
            </div>

            <h3 style="font-family: var(--font-display); margin-bottom: 16px;">Earnings by Event</h3>
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Bookings</th>
                            <th>Total Sales</th>
                            <th>Fee (${commPct}%)</th>
                            <th>Net Earnings</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${e.event_breakdown.map(ev => `
                            <tr>
                                <td><strong>${escapeHtml(ev.event.title)}</strong></td>
                                <td>${ev.bookings}</td>
                                <td>KES ${ev.total_sales.toLocaleString()}</td>
                                <td>KES ${ev.commission.toLocaleString()}</td>
                                <td>KES ${ev.net.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            ${e.payouts.length > 0 ? `
            <h3 style="font-family: var(--font-display); margin: 32px 0 16px;">Payout History</h3>
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr><th>Ref</th><th>Amount</th><th>Fee</th><th>Net</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                        ${e.payouts.map(p => `
                            <tr>
                                <td>${p.payout_ref}</td>
                                <td>KES ${p.amount.toLocaleString()}</td>
                                <td>KES ${p.commission_amount.toLocaleString()}</td>
                                <td>KES ${p.net_amount.toLocaleString()}</td>
                                <td><span class="status-badge ${p.status}">${p.status}</span></td>
                                <td>${formatDate(p.created_at?.split('T')[0])}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}
        `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load earnings</h3></div>';
    }
}

// ─── Admin Panel ────────────────────────────────────────────
async function loadAdminPanel() {
    if (!currentUser || currentUser.role !== 'admin') {
        navigate('login');
        return;
    }

    loadAdminStats();
    switchAdminTab('events');
}

async function loadAdminStats() {
    const container = document.getElementById('adminStats');
    try {
        const data = await api.getAdminStats();
        const s = data.stats;
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon purple"><i class="fas fa-users"></i></div>
                <div class="stat-card-value">${s.total_users}</div>
                <div class="stat-card-label">Total Users</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon green"><i class="fas fa-calendar"></i></div>
                <div class="stat-card-value">${s.total_events}</div>
                <div class="stat-card-label">Total Events</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon yellow"><i class="fas fa-clock"></i></div>
                <div class="stat-card-value">${s.pending_events}</div>
                <div class="stat-card-label">Pending Approval</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon pink"><i class="fas fa-ticket-alt"></i></div>
                <div class="stat-card-value">${s.total_bookings}</div>
                <div class="stat-card-label">Total Bookings</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon green"><i class="fas fa-money-bill-wave"></i></div>
                <div class="stat-card-value">KES ${s.total_revenue.toLocaleString()}</div>
                <div class="stat-card-label">Total Revenue</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon purple"><i class="fas fa-check-circle"></i></div>
                <div class="stat-card-value">${s.verified_tickets}</div>
                <div class="stat-card-label">Verified Tickets</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon yellow"><i class="fas fa-hand-holding-usd"></i></div>
                <div class="stat-card-value">KES ${(s.total_commission || 0).toLocaleString()}</div>
                <div class="stat-card-label">Commission Earned</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon pink"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-card-value">${s.pending_payouts || 0}</div>
                <div class="stat-card-label">Pending Payouts</div>
            </div>
        `;
    } catch {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load stats</h3></div>';
    }
}

async function switchAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.dataset.tab === tab) b.classList.add('active');
    });

    const container = document.getElementById('adminTabContent');

    switch (tab) {
        case 'events': await loadAdminEvents(container); break;
        case 'users': await loadAdminUsers(container); break;
        case 'verify': renderVerifySection(container); break;
        case 'payouts': await loadAdminPayouts(container); break;
        case 'settlements': await loadAdminSettlements(container); break;
    }
}

async function loadAdminPayouts(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await api.getAdminOrganizerEarnings();
        const organizers = data.organizer_earnings;

        container.innerHTML = `
            <h3 style="font-family: var(--font-display); margin-bottom: 16px;">Organizer Earnings & Settlements</h3>
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Organizer</th>
                            <th>Events</th>
                            <th>Total Sales</th>
                            <th>Commission (10%)</th>
                            <th>Net Earnings</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${organizers.map(o => `
                            <tr>
                                <td><strong>${escapeHtml(o.organizer.full_name)}</strong></td>
                                <td>${o.event_count}</td>
                                <td>KES ${o.total_sales.toLocaleString()}</td>
                                <td>KES ${o.commission.toLocaleString()}</td>
                                <td>KES ${o.net_earnings.toLocaleString()}</td>
                                <td>KES ${o.total_paid.toLocaleString()}</td>
                                <td><strong>KES ${o.balance.toLocaleString()}</strong></td>
                                <td>
                                    <div class="table-actions">
                                        ${o.balance > 0 ? `
                                        <button class="btn btn-success btn-sm" onclick="initPayout(${o.organizer.id}, '${escapeHtml(o.organizer.full_name)}', ${o.balance})">
                                            <i class="fas fa-paper-plane"></i> Pay
                                        </button>
                                        ` : '<span style="color: var(--text-muted); font-size: 0.8rem;">Settled</span>'}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load organizer earnings</h3></div>';
    }
}

async function initPayout(organizerId, name, maxAmount) {
    const amount = prompt(`Enter payout amount for ${name} (max KES ${maxAmount.toLocaleString()}):`, maxAmount);
    if (!amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        showToast('Invalid amount', 'error');
        return;
    }
    try {
        await api.createPayout(organizerId, amountNum, `Payout to ${name}`);
        showToast('Payout created!', 'success');
        switchAdminTab('payouts');
        loadAdminStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminSettlements(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await api.getAdminPayouts();
        const payouts = data.payouts;

        if (!payouts.length) {
            container.innerHTML = '<div class="empty-state"><h3>No payouts yet</h3><p>Create payouts from the Payouts tab.</p></div>';
            return;
        }

        container.innerHTML = `
            <h3 style="font-family: var(--font-display); margin-bottom: 16px;">Payout History</h3>
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr><th>Ref</th><th>Organizer</th><th>Gross</th><th>Fee</th><th>Net</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        ${payouts.map(p => `
                            <tr>
                                <td>${p.payout_ref}</td>
                                <td>${escapeHtml(p.organizer?.full_name || 'N/A')}</td>
                                <td>KES ${p.amount.toLocaleString()}</td>
                                <td>KES ${p.commission_amount.toLocaleString()}</td>
                                <td>KES ${p.net_amount.toLocaleString()}</td>
                                <td><span class="status-badge ${p.status}">${p.status}</span></td>
                                <td>
                                    <div class="table-actions">
                                        ${p.status === 'pending' ? `
                                            <button class="btn btn-success btn-sm" onclick="completePayout(${p.id})" title="Mark completed">
                                                <i class="fas fa-check"></i>
                                            </button>
                                            <button class="btn btn-danger btn-sm" onclick="failPayout(${p.id})" title="Mark failed">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        ` : p.status === 'completed' ? `
                                            <span style="color: var(--secondary); font-size: 0.8rem;"><i class="fas fa-check-circle"></i> Done</span>
                                        ` : `
                                            <span style="color: var(--danger); font-size: 0.8rem;"><i class="fas fa-times-circle"></i> Failed</span>
                                        `}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load settlements</h3></div>';
    }
}

async function completePayout(payoutId) {
    const ref = prompt('Enter payment reference (e.g. M-Pesa receipt):');
    if (ref === null) return;
    try {
        await api.processPayout(payoutId, 'complete', ref);
        showToast('Payout completed!', 'success');
        switchAdminTab('settlements');
        loadAdminStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function failPayout(payoutId) {
    if (!confirm('Mark this payout as failed?')) return;
    try {
        await api.processPayout(payoutId, 'fail', '', 'Marked failed by admin');
        showToast('Payout marked as failed', 'info');
        switchAdminTab('settlements');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminEvents(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await api.getAdminEvents();
        const events = data.events;

        container.innerHTML = `
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Organizer</th>
                            <th>Date</th>
                            <th>Tickets</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(e => `
                            <tr>
                                <td><strong>${escapeHtml(e.title)}</strong></td>
                                <td>${escapeHtml(e.organizer?.full_name || 'N/A')}</td>
                                <td>${formatDate(e.date)}</td>
                                <td>${e.tickets_sold}/${e.total_tickets}</td>
                                <td><span class="status-badge ${e.status}">${e.status}</span></td>
                                <td>
                                    <div class="table-actions">
                                        ${e.status === 'pending' ? `
                                            <button class="btn btn-success btn-sm" onclick="adminApproveEvent('${e.public_id}')">
                                                <i class="fas fa-check"></i>
                                            </button>
                                            <button class="btn btn-danger btn-sm" onclick="adminRejectEvent('${e.public_id}')">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-danger btn-sm" onclick="deleteEvent('${e.public_id}'); setTimeout(() => switchAdminTab('events'), 500);">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load events</h3></div>';
    }
}

async function loadAdminUsers(container) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await api.getAdminUsers();
        const users = data.users;

        container.innerHTML = `
            <div class="events-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td><strong>${escapeHtml(u.full_name)}</strong></td>
                                <td>${escapeHtml(u.username)}</td>
                                <td>${escapeHtml(u.email)}</td>
                                <td>
                                    <select onchange="changeUserRole(${u.id}, this.value)" style="background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); font-size: 0.82rem;">
                                        <option value="attendee" ${u.role === 'attendee' ? 'selected' : ''}>Attendee</option>
                                        <option value="organizer" ${u.role === 'organizer' ? 'selected' : ''}>Organizer</option>
                                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </td>
                                <td><span class="status-badge ${u.is_active ? 'approved' : 'rejected'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                                <td>
                                    <div class="table-actions">
                                        <button class="btn ${u.is_active ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleUserStatus(${u.id})">
                                            <i class="fas fa-${u.is_active ? 'ban' : 'check'}"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch {
        container.innerHTML = '<div class="empty-state"><h3>Unable to load users</h3></div>';
    }
}

function renderVerifySection(container) {
    container.innerHTML = `
        <div class="verify-section">
            <h3 style="margin-bottom: 8px; font-family: var(--font-display);">Verify Ticket</h3>
            <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 0.9rem;">
                Enter a ticket code or scan a QR code to verify entry
            </p>
            <div class="verify-input-group">
                <input type="text" id="verifyInput" placeholder="Enter ticket code or scanned QR data...">
                <button class="btn btn-primary" onclick="verifyTicketAction()">
                    <i class="fas fa-search"></i> Verify
                </button>
            </div>
            <div id="verifyResult"></div>
        </div>
    `;
}

async function verifyTicketAction() {
    const input = document.getElementById('verifyInput');
    const resultDiv = document.getElementById('verifyResult');
    const code = input.value.trim();

    if (!code) {
        showToast('Please enter a ticket code', 'error');
        return;
    }

    resultDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Verifying...</div>';

    try {
        const data = await api.verifyTicket(code);
        const b = data.booking;
        resultDiv.innerHTML = `
            <div class="verify-result success">
                <h3><i class="fas fa-check-circle"></i> Ticket Valid!</h3>
                <p><strong>Event:</strong> ${escapeHtml(b.event.title)}</p>
                <p><strong>Attendee:</strong> ${escapeHtml(b.attendee.full_name)}</p>
                <p><strong>Quantity:</strong> ${b.quantity} ticket(s)</p>
                <p><strong>Ref:</strong> ${b.booking_ref}</p>
            </div>
        `;
        input.value = '';
    } catch (err) {
        resultDiv.innerHTML = `
            <div class="verify-result error">
                <h3><i class="fas fa-times-circle"></i> Verification Failed</h3>
                <p>${escapeHtml(err.message)}</p>
            </div>
        `;
    }
}

async function adminApproveEvent(publicId) {
    try {
        await api.approveEvent(publicId);
        showToast('Event approved!', 'success');
        loadAdminStats();
        switchAdminTab('events');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function adminRejectEvent(publicId) {
    if (!confirm('Reject this event?')) return;
    try {
        await api.rejectEvent(publicId);
        showToast('Event rejected', 'info');
        loadAdminStats();
        switchAdminTab('events');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleUserStatus(userId) {
    try {
        const data = await api.toggleUser(userId);
        showToast(data.message, 'success');
        switchAdminTab('users');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function changeUserRole(userId, role) {
    try {
        await api.changeUserRole(userId, role);
        showToast('Role updated', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        switchAdminTab('users');
    }
}

// ─── Modals ─────────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
    document.body.style.overflow = '';
}

// ─── Toast ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${icons[type] || 'info-circle'}"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

// ─── Helpers ────────────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-KE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
