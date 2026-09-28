import { Injectable, Logger } from '@nestjs/common';

export interface TeamsAlertPayload {
  title: string;
  message: string;
  errorType?: string;
  environment?: string;
  timestamp?: string;
  url?: string;
  level?: 'error' | 'warning' | 'info';
  stackTrace?: string;
  userId?: string;
  requestId?: string;
}

@Injectable()
export class TeamsAlertService {
  private readonly logger = new Logger(TeamsAlertService.name);
  private readonly webhookUrl: string | null;

  constructor() {
    this.webhookUrl = process.env.MICROSOFT_TEAMS_WEBHOOK_URL || null;
    
    if (!this.webhookUrl) {
      this.logger.warn(
        '⚠️  Microsoft Teams webhook URL not configured. Teams alerts will be disabled.',
      );
    } else {
      this.logger.log('✅ Microsoft Teams alert service initialized');
    }
  }

  /**
   * Sends an alert to Microsoft Teams
   * @param payload Alert payload with error details
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async sendAlert(payload: TeamsAlertPayload): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    try {
      const card = this.createAdaptiveCard(payload);
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(card),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send Teams alert: ${response.status} ${response.statusText} - ${errorText}`,
        );
        return false;
      }

      this.logger.debug('Teams alert sent successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error sending Teams alert: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Creates an adaptive card for Microsoft Teams
   * Uses adaptive card format for rich, interactive messages
   */
  private createAdaptiveCard(payload: TeamsAlertPayload): any {
    const color = this.getColorForLevel(payload.level || 'error');
    const emoji = this.getEmojiForLevel(payload.level || 'error');

    // Truncate stack trace if too long
    const stackTrace = payload.stackTrace
      ? payload.stackTrace.substring(0, 2000) + (payload.stackTrace.length > 2000 ? '...' : '')
      : '';

    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `${emoji} ${payload.title}`,
      themeColor: color,
      title: `${emoji} ${payload.title}`,
      sections: [
        {
          activityTitle: payload.message,
          activitySubtitle: `Environment: ${payload.environment || 'unknown'}`,
          facts: [
            {
              name: 'Error Type:',
              value: payload.errorType || 'Unknown',
            },
            {
              name: 'Timestamp:',
              value: payload.timestamp || new Date().toISOString(),
            },
            ...(payload.url
              ? [
                  {
                    name: 'URL:',
                    value: payload.url,
                  },
                ]
              : []),
            ...(payload.userId
              ? [
                  {
                    name: 'User ID:',
                    value: payload.userId,
                  },
                ]
              : []),
            ...(payload.requestId
              ? [
                  {
                    name: 'Request ID:',
                    value: payload.requestId,
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
      potentialAction: payload.url
        ? [
            {
              '@type': 'OpenUri',
              name: 'View in Sentry',
              targets: [
                {
                  os: 'default',
                  uri: payload.url,
                },
              ],
            },
          ]
        : [],
    };
  }

  /**
   * Gets color code based on alert level
   */
  private getColorForLevel(level: string): string {
    switch (level) {
      case 'error':
        return 'FF0000'; // Red
      case 'warning':
        return 'FFA500'; // Orange
      case 'info':
        return '0078D4'; // Blue
      default:
        return '808080'; // Gray
    }
  }

  /**
   * Gets emoji based on alert level
   */
  private getEmojiForLevel(level: string): string {
    switch (level) {
      case 'error':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  }

  /**
   * Sends a quick alert (simplified version for immediate notifications)
   */
  async sendQuickAlert(
    title: string,
    message: string,
    error?: Error,
    metadata?: Record<string, any>,
  ): Promise<boolean> {
    return this.sendAlert({
      title,
      message,
      errorType: error?.name || 'Error',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      level: 'error',
      stackTrace: error?.stack,
      ...metadata,
    });
  }
}
