"""M-Pesa Daraja API integration for Tiko Zetu."""

import os
import base64
import requests
from datetime import datetime


DARAJA_ENV = os.environ.get('MPESA_ENV', 'sandbox')  # sandbox or production
CONSUMER_KEY = os.environ.get('MPESA_CONSUMER_KEY', '')
CONSUMER_SECRET = os.environ.get('MPESA_CONSUMER_SECRET', '')
SHORTCODE = os.environ.get('MPESA_SHORTCODE', '174379')  # sandbox default
PASSKEY = os.environ.get('MPESA_PASSKEY', 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919')
CALLBACK_URL = os.environ.get('MPESA_CALLBACK_URL', '')

BASE_URLS = {
    'sandbox': 'https://sandbox.safaricom.co.ke',
    'production': 'https://api.safaricom.co.ke',
}


def _get_base_url():
    return BASE_URLS.get(DARAJA_ENV, BASE_URLS['sandbox'])


def get_access_token():
    url = f'{_get_base_url()}/oauth/v1/generate?grant_type=client_credentials'
    response = requests.get(url, auth=(CONSUMER_KEY, CONSUMER_SECRET), timeout=30)
    response.raise_for_status()
    return response.json()['access_token']


def _generate_password():
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    raw = f'{SHORTCODE}{PASSKEY}{timestamp}'
    password = base64.b64encode(raw.encode()).decode('utf-8')
    return password, timestamp


def initiate_stk_push(phone_number, amount, booking_ref, callback_url=None):
    """Initiate an M-Pesa STK Push (Lipa Na M-Pesa Online).

    Args:
        phone_number: Customer phone in format 254XXXXXXXXX
        amount: Amount in KES (integer)
        booking_ref: Unique booking reference for the AccountReference
        callback_url: Override callback URL (falls back to env var)

    Returns:
        dict with CheckoutRequestID, MerchantRequestID, ResponseCode, etc.

    Raises:
        MpesaError on failure.
    """
    if not CONSUMER_KEY or not CONSUMER_SECRET:
        raise MpesaError('M-Pesa API credentials not configured')

    cb_url = callback_url or CALLBACK_URL
    if not cb_url:
        raise MpesaError('M-Pesa callback URL not configured')

    access_token = get_access_token()
    password, timestamp = _generate_password()

    url = f'{_get_base_url()}/mpesa/stkpush/v1/processrequest'
    headers = {'Authorization': f'Bearer {access_token}'}
    payload = {
        'BusinessShortCode': SHORTCODE,
        'Password': password,
        'Timestamp': timestamp,
        'TransactionType': 'CustomerPayBillOnline',
        'Amount': int(amount),
        'PartyA': phone_number,
        'PartyB': SHORTCODE,
        'PhoneNumber': phone_number,
        'CallBackURL': cb_url,
        'AccountReference': booking_ref,
        'TransactionDesc': f'Tiko Zetu Ticket - {booking_ref}',
    }

    response = requests.post(url, json=payload, headers=headers, timeout=30)
    data = response.json()

    if data.get('ResponseCode') != '0':
        raise MpesaError(data.get('ResponseDescription', 'STK Push failed'))

    return data


def query_stk_status(checkout_request_id):
    """Query the status of an STK Push transaction."""
    if not CONSUMER_KEY or not CONSUMER_SECRET:
        raise MpesaError('M-Pesa API credentials not configured')

    access_token = get_access_token()
    password, timestamp = _generate_password()

    url = f'{_get_base_url()}/mpesa/stkpushquery/v1/query'
    headers = {'Authorization': f'Bearer {access_token}'}
    payload = {
        'BusinessShortCode': SHORTCODE,
        'Password': password,
        'Timestamp': timestamp,
        'CheckoutRequestID': checkout_request_id,
    }

    response = requests.post(url, json=payload, headers=headers, timeout=30)
    return response.json()


def normalize_phone(phone):
    """Normalize a Kenyan phone number to 254XXXXXXXXX format."""
    phone = phone.strip().replace(' ', '').replace('-', '')
    if phone.startswith('+'):
        phone = phone[1:]
    if phone.startswith('0'):
        phone = '254' + phone[1:]
    if not phone.startswith('254'):
        phone = '254' + phone
    return phone


class MpesaError(Exception):
    pass
