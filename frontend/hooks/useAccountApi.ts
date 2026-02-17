'use client'

import { useCallback } from 'react'
import { apiClient } from '@/lib/api-client'

export interface ContactInfo {
  email?: string
  phone?: string
}

export interface Preferences {
  theme?: string
  compactMode?: boolean
  reducedMotion?: boolean
  language?: string
  timezone?: string
  currency?: string
}

export interface NotificationSettings {
  email: boolean
  sms: boolean
  push: boolean
  marketing: boolean
  updates: boolean
}

export interface PrivacySettings {
  profileVisible: boolean
  activityVisible: boolean
  analyticsEnabled: boolean
}

export interface BillingInfo {
  subscription?: string
  paymentMethod?: string
  nextBillingDate?: string
}

export const useAccountApi = () => {
  const fetchContactInfo = useCallback(async (discordId: string): Promise<ContactInfo> => {
    return apiClient<ContactInfo>(`/api/account/contact?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  const updateContactInfo = useCallback(async (discordId: string, data: ContactInfo): Promise<void> => {
    return apiClient<void>(`/api/account/contact`, {
      method: 'POST',
      body: JSON.stringify({ discordId, ...data })
    })
  }, [])

  const fetchPreferences = useCallback(async (discordId: string): Promise<Preferences> => {
    return apiClient<Preferences>(`/api/preferences?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  const updatePreferences = useCallback(async (discordId: string, preferences: Preferences): Promise<void> => {
    return apiClient<void>(`/api/preferences`, {
      method: 'POST',
      body: JSON.stringify({ discordId, preferences })
    })
  }, [])

  const fetchNotifications = useCallback(async (discordId: string): Promise<NotificationSettings> => {
    return apiClient<NotificationSettings>(`/api/notifications?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  const updateNotifications = useCallback(async (discordId: string, notifications: NotificationSettings): Promise<void> => {
    return apiClient<void>(`/api/notifications`, {
      method: 'POST',
      body: JSON.stringify({ discordId, notifications })
    })
  }, [])

  const fetchPrivacySettings = useCallback(async (discordId: string): Promise<PrivacySettings> => {
    return apiClient<PrivacySettings>(`/api/privacy?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  const updatePrivacySettings = useCallback(async (discordId: string, privacy: PrivacySettings): Promise<void> => {
    return apiClient<void>(`/api/privacy`, {
      method: 'POST',
      body: JSON.stringify({ discordId, privacy })
    })
  }, [])

  const fetchBillingInfo = useCallback(async (discordId: string): Promise<BillingInfo> => {
    return apiClient<BillingInfo>(`/api/billing?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  const updateBillingInfo = useCallback(async (discordId: string, billing: BillingInfo): Promise<void> => {
    return apiClient<void>(`/api/billing`, {
      method: 'POST',
      body: JSON.stringify({ discordId, billing })
    })
  }, [])

  const deleteAccount = useCallback(async (discordId: string): Promise<void> => {
    return apiClient<void>(`/api/account`, {
      method: 'DELETE',
      body: JSON.stringify({ discordId })
    })
  }, [])

  const exportData = useCallback(async (discordId: string): Promise<Blob> => {
    return apiClient<Blob>(`/api/account/export?discordId=${discordId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
  }, [])

  const fetchUserData = useCallback(async (discordId: string): Promise<any> => {
    return apiClient<any>(`/api/account?discordId=${discordId}`, { 
      cache: "no-store" 
    })
  }, [])

  return {
    fetchContactInfo,
    updateContactInfo,
    fetchPreferences,
    updatePreferences,
    fetchNotifications,
    updateNotifications,
    fetchPrivacySettings,
    updatePrivacySettings,
    fetchBillingInfo,
    updateBillingInfo,
    deleteAccount,
    exportData,
    fetchUserData
  }
}