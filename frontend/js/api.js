/**
 * Tiko Zetu — API Client
 * Centralized fetch wrapper for backend communication.
 */

const API_BASE = '/api';

const api = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            ...options,
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw { status: response.status, message: data.error || 'Something went wrong' };
            }

            return data;
        } catch (err) {
            if (err.status) throw err;
            throw { status: 0, message: 'Network error. Please check your connection.' };
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    // ─── Auth ───────────────────────────────────
    login(identifier, password) {
        return this.post('/auth/login', { identifier, password });
    },

    register(data) {
        return this.post('/auth/register', data);
    },

    logout() {
        return this.post('/auth/logout');
    },

    me() {
        return this.get('/auth/me');
    },

    // ─── Events ─────────────────────────────────
    getEvents(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.get(`/events${query ? '?' + query : ''}`);
    },

    getEvent(publicId) {
        return this.get(`/events/${publicId}`);
    },

    createEvent(data) {
        return this.post('/events', data);
    },

    updateEvent(publicId, data) {
        return this.put(`/events/${publicId}`, data);
    },

    deleteEvent(publicId) {
        return this.delete(`/events/${publicId}`);
    },

    getMyEvents() {
        return this.get('/my-events');
    },

    approveEvent(publicId) {
        return this.post(`/events/${publicId}/approve`);
    },

    rejectEvent(publicId) {
        return this.post(`/events/${publicId}/reject`);
    },

    // ─── Bookings ───────────────────────────────
    createBooking(eventId, quantity, phoneNumber) {
        return this.post('/bookings', { event_id: eventId, quantity, phone_number: phoneNumber });
    },

    getBookings() {
        return this.get('/bookings');
    },

    getBooking(bookingRef) {
        return this.get(`/bookings/${bookingRef}`);
    },

    getBookingStatus(bookingRef) {
        return this.get(`/bookings/${bookingRef}/status`);
    },

    cancelBooking(bookingRef) {
        return this.post(`/bookings/${bookingRef}/cancel`);
    },

    // ─── Payments ────────────────────────────────
    queryMpesaStatus(bookingRef) {
        return this.get(`/payments/mpesa/query/${bookingRef}`);
    },

    // ─── Tickets ────────────────────────────────
    getTicketQRUrl(ticketCode) {
        return `${API_BASE}/tickets/${ticketCode}/qr`;
    },

    verifyTicket(ticketCode) {
        return this.post('/tickets/verify', { ticket_code: ticketCode });
    },

    // ─── Organizer Earnings ─────────────────────
    getOrganizerEarnings() {
        return this.get('/organizer/earnings');
    },

    // ─── Admin ──────────────────────────────────
    getAdminStats() {
        return this.get('/admin/stats');
    },

    getAdminUsers() {
        return this.get('/admin/users');
    },

    toggleUser(userId) {
        return this.post(`/admin/users/${userId}/toggle`);
    },

    changeUserRole(userId, role) {
        return this.put(`/admin/users/${userId}/role`, { role });
    },

    getAdminEvents(status) {
        const query = status ? `?status=${status}` : '';
        return this.get(`/admin/events${query}`);
    },

    getAdminOrganizerEarnings() {
        return this.get('/admin/organizer-earnings');
    },

    getAdminPayouts(status) {
        const query = status ? `?status=${status}` : '';
        return this.get(`/admin/payouts${query}`);
    },

    createPayout(organizerId, amount, notes) {
        return this.post('/admin/payouts', { organizer_id: organizerId, amount, notes });
    },

    processPayout(payoutId, action, paymentReference, notes) {
        return this.post(`/admin/payouts/${payoutId}/process`, { action, payment_reference: paymentReference, notes });
    },

    getAdminPayments(status) {
        const query = status ? `?status=${status}` : '';
        return this.get(`/admin/payments${query}`);
    },
};
