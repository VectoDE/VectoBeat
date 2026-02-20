# Site Analytics Component Documentation

## Overview
The Site Analytics component provides comprehensive tracking and analytics for user interactions, page views, and engagement metrics while respecting user privacy preferences and consent settings.

## Architecture
The site analytics component integrates consent checking, analytics initialization, event tracking, and fallback systems in a privacy-compliant manner.

## Key Features

### Privacy-First Analytics
- **Consent-based Tracking**: Only tracks users who have given consent
- **Anonymization**: Removes personally identifiable information
- **Data Minimization**: Collects only necessary analytics data
- **User Control**: Respects user privacy preferences

### Event Tracking
- **Page Views**: Automatic tracking of page navigation
- **User Interactions**: Click tracking for buttons and links
- **Form Analytics**: Form submission and interaction tracking
- **Custom Events**: Support for custom business events

### Performance Monitoring
- **Page Load Times**: Core Web Vitals tracking
- **User Experience**: Real user monitoring (RUM)
- **Error Tracking**: JavaScript error monitoring
- **Resource Loading**: Asset loading performance

## Analytics Implementation

### Google Analytics 4 Integration
```javascript
// GA4 initialization with privacy settings
window.gtag('config', 'GA_MEASUREMENT_ID', {
  anonymize_ip: true,
  send_page_view: false,
  custom_map: {
    'custom_parameter_1': 'consent_status'
  }
});
```

### Custom Event Tracking
```javascript
// Custom event tracking with consent check
const trackEvent = (eventName, eventData) => {
  if (consent.analytics) {
    window.gtag('event', eventName, {
      ...eventData,
      consent_status: 'granted'
    });
  }
};
```

### Fallback Analytics
```javascript
// Server-side fallback for blocked analytics
const fallbackTrack = async (eventType, eventData) => {
  try {
    await apiClient('/api/analytics/ingest', {
      method: 'POST',
      body: JSON.stringify({
        type: eventType,
        data: eventData,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.warn('Analytics fallback failed:', error);
  }
};
```

## API Integration

### Analytics Ingestion Endpoint
```
POST /api/analytics/ingest
Body: {
  type: string,
  data: object,
  timestamp: number,
  sessionId?: string
}
Headers: Content-Type: application/json
```

### Page View Tracking Endpoint
```
POST /api/analytics/track
Body: {
  page: string,
  title: string,
  referrer?: string,
  loadTime?: number
}
```

## Security Considerations

### Data Privacy
- **IP Anonymization**: Removes last octet of IP addresses
- **User Agent Filtering**: Strips identifying information
- **Referrer Policy**: Controls referrer information
- **Cookie Security**: Secure and HttpOnly flags

### Consent Management
- **Explicit Consent**: Requires user action before tracking
- **Granular Control**: Separate consent for different tracking types
- **Withdrawal Support**: Users can withdraw consent at any time
- **Audit Trail**: Logs consent changes for compliance

### Data Protection
- **Encryption**: All analytics data encrypted in transit
- **Retention Policies**: Automatic data deletion after specified period
- **Access Controls**: Restricted access to analytics data
- **Third-party Compliance**: Ensures third-party analytics compliance

## Privacy Compliance

### GDPR Compliance
- **Lawful Basis**: Legitimate interest with consent fallback
- **Data Minimization**: Only essential data collection
- **Right to Access**: User access to their analytics data
- **Right to Deletion**: User data deletion capabilities

### CCPA Compliance
- **Do Not Sell**: No sale of personal information
- **Consumer Rights**: California consumer privacy rights
- **Opt-out Mechanisms**: Clear opt-out options
- **Transparency**: Clear privacy policy disclosure

### Other Regulations
- **ePrivacy Directive**: Cookie consent requirements
- **PIPEDA**: Canadian privacy compliance
- **LGPD**: Brazilian privacy law compliance
- **Regional Adaptations**: Support for regional privacy laws

## Error Handling

### Analytics Failures
- **Graceful Degradation**: Continues functioning when analytics fail
- **Fallback Systems**: Server-side tracking when client-side fails
- **Error Reporting**: Logs analytics errors for debugging
- **User Experience**: No impact on user experience from analytics errors

### Network Issues
- **Offline Handling**: Queues events when offline
- **Retry Logic**: Automatic retry for failed requests
- **Timeout Handling**: Prevents blocking from analytics timeouts
- **Circuit Breaker**: Prevents analytics from affecting site performance

## Performance Optimizations

### Loading Strategy
- **Lazy Loading**: Analytics scripts load after page content
- **Async Loading**: Non-blocking script loading
- **Conditional Loading**: Only loads when consent is granted
- **Resource Optimization**: Minified and compressed scripts

### Event Debouncing
- **Click Debouncing**: Prevents duplicate event tracking
- **Scroll Throttling**: Efficient scroll event handling
- **Resize Debouncing**: Optimized resize event tracking
- **Form Debouncing**: Prevents multiple form submission events

### Memory Management
- **Event Cleanup**: Proper removal of event listeners
- **State Cleanup**: Clearing of analytics state on unmount
- **Resource Cleanup**: Release of analytics resources
- **Garbage Collection**: Efficient memory usage patterns

## Testing Strategy

### Unit Tests
- Consent checking logic
- Event tracking functions
- Privacy compliance validation
- Error handling scenarios

### Integration Tests
- End-to-end analytics flows
- API integration testing
- Third-party service integration
- Privacy compliance testing

### Performance Testing
- Analytics impact on page load
- Memory usage monitoring
- Event tracking performance
- Fallback system testing

## Future Enhancements

### Advanced Analytics
- Heatmap tracking
- Session recording (with consent)
- Advanced user journey analysis
- Predictive analytics

### Privacy Improvements
- Enhanced anonymization techniques
- Differential privacy implementation
- Federated analytics
- Zero-knowledge analytics

### User Experience
- Analytics dashboard for users
- Privacy controls interface
- Data export functionality
- Advanced consent management