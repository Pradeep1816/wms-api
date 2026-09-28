// Load environment variables first (before Sentry initialization)
import { config } from 'dotenv';
config();

// Import with `const Sentry = require("@sentry/nestjs");` if you are using CJS
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN || '';
const teamsWebhookUrl = process.env.MICROSOFT_TEAMS_WEBHOOK_URL || '';

/**
 * Sends an alert to Microsoft Teams (standalone function for use before NestJS bootstrap)
 */
async function sendTeamsAlert(
  title: string,
  message: string,
  error?: Error,
  event?: Sentry.Event,
): Promise<void> {
  if (!teamsWebhookUrl) {
    return;
  }

  try {
    const color = 'FF0000'; // Red for errors
    const emoji = '🚨';
    const stackTrace = error?.stack
      ? error.stack.substring(0, 2000) + (error.stack.length > 2000 ? '...' : '')
      : event?.exception?.values?.[0]?.stacktrace?.frames
        ? JSON.stringify(event.exception.values[0].stacktrace.frames.slice(-5))
        : '';

    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `${emoji} ${title}`,
      themeColor: color,
      title: `${emoji} ${title}`,
      sections: [
        {
          activityTitle: message,
          activitySubtitle: `Environment: ${process.env.NODE_ENV || 'unknown'}`,
          facts: [
            {
              name: 'Error Type:',
              value: error?.name || event?.exception?.values?.[0]?.type || 'Unknown',
            },
            {
              name: 'Timestamp:',
              value: new Date().toISOString(),
            },
            ...(event?.request?.url
              ? [
                  {
                    name: 'URL:',
                    value: event.request.url,
                  },
                ]
              : []),
            ...(event?.user?.id
              ? [
                  {
                    name: 'User ID:',
                    value: String(event.user.id),
                  },
                ]
              : []),
            ...(event?.event_id
              ? [
                  {
                    name: 'Event ID:',
                    value: event.event_id,
                  },
                ]
              : []),
          ],
          markdown: true,
        },
        ...(stackTrace
          ? [
              {
                title: 'Stack Trace',
                text: `\`\`\`\n${stackTrace}\n\`\`\``,
              },
            ]
          : []),
      ],
      ...(event?.event_id
        ? {
            potentialAction: [
              {
                '@type': 'OpenUri',
                name: 'View in Sentry',
                targets: [
                  {
                    os: 'default',
                    uri: `https://sentry.io/organizations/${process.env.SENTRY_ORG}/issues/${event.event_id}/`,
                  },
                ],
              },
            ],
          }
        : {}),
    };

    const response = await fetch(teamsWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to send Teams alert: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
  } catch (error) {
    // Don't throw - we don't want Teams alert failures to break the app
    console.error(`Error sending Teams alert: ${error.message}`);
  }
}

// Only initialize Sentry if DSN is provided
if (dsn && dsn.trim() !== '') {
  Sentry.init({
    dsn,
    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
    // Environment configuration
    environment: process.env.NODE_ENV || 'development',
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Debug mode (set to true to see Sentry logs in console)
    debug: false,
    // Before sending to Sentry, also send to Teams for immediate alerts
    beforeSend(event, hint) {
      // Send immediate alert to Teams
      const error = hint.originalException || hint.syntheticException;
      const errorMessage =
        (event as any).message ||
        event.exception?.values?.[0]?.value ||
        (error instanceof Error ? error.message : error ? String(error) : undefined) ||
        'An error occurred';

      // Fire and forget - don't wait for Teams response
      sendTeamsAlert(
        '🚨 Application Error Alert',
        errorMessage,
        error instanceof Error ? error : undefined,
        event,
      ).catch(() => {
        // Silently fail - we don't want Teams failures to affect Sentry
      });

      // Return event to continue sending to Sentry
      return event;
    },
  });

  console.log('✅ Sentry initialized successfully');
  if (process.env.NODE_ENV === 'development') {
    console.log(`📡 Sentry DSN: ${dsn.substring(0, 20)}...`);
  }

  if (teamsWebhookUrl) {
    console.log('✅ Microsoft Teams alerts enabled');
  } else {
    console.warn('⚠️  Microsoft Teams webhook URL not configured. Teams alerts are disabled.');
  }
} else {
  console.warn('⚠️  Sentry DSN not found. Sentry error tracking is disabled.');
}

