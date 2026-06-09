/**
 * pushManager.js — Browser-side Web Push subscription manager.
 *
 * Handles:
 *   - Requesting notification permission
 *   - Creating a push subscription via the Push API
 *   - Sending the subscription to the backend
 *   - Unsubscribing and removing from backend
 */

import api from './api';

// ── Permission ────────────────────────────────────────────────
export const getPermissionState = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

export const requestPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  return result;
};

// ── VAPID key helper ─────────────────────────────────────────
const urlBase64ToUint8Array = (base64String) => {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};

// ── Subscribe ─────────────────────────────────────────────────
export const subscribeToPush = async (deviceLabel = '') => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported by your browser');
  }

  const permission = await requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied');
  }

  // Get VAPID public key from server
  const { data: vapidData } = await api.get('/push/vapid-public-key');
  if (!vapidData.configured) {
    throw new Error('Push notifications not configured on server. Add VAPID keys to backend .env');
  }

  const registration = await navigator.serviceWorker.ready;

  // Check if already subscribed
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
    });
  }

  // Send to backend
  const subJSON = subscription.toJSON();
  await api.post('/push/subscribe', {
    endpoint:       subJSON.endpoint,
    expirationTime: subJSON.expirationTime,
    keys:           subJSON.keys,
    deviceLabel:    deviceLabel || navigator.userAgent.slice(0, 60),
    userAgent:      navigator.userAgent,
  });

  return subscription;
};

// ── Unsubscribe ───────────────────────────────────────────────
export const unsubscribeFromPush = async () => {
  const registration   = await navigator.serviceWorker.ready;
  const subscription   = await registration.pushManager.getSubscription();

  if (!subscription) return false;

  // Remove from backend first
  try {
    await api.delete('/push/unsubscribe', { data: { endpoint: subscription.endpoint } });
  } catch (_) {}

  // Then unsubscribe from browser
  await subscription.unsubscribe();
  return true;
};

// ── Check current subscription state ─────────────────────────
export const getSubscriptionState = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, subscribed: false, permission: 'unsupported' };
  }

  const permission = getPermissionState();
  if (permission !== 'granted') {
    return { supported: true, subscribed: false, permission };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  return {
    supported:    true,
    subscribed:   !!subscription,
    permission,
    subscription: subscription?.toJSON() || null,
  };
};
