import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Basic OpenTelemetry tracing setup for SigNoz (or any OTLP-compatible backend).
// Configuration is controlled via environment variables so it works across
// local/dev/prod without code changes.
//
// Key env vars:
// - OTEL_SERVICE_NAME: logical service name (default: 'smw-api')
// - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP HTTP endpoint, e.g.
//     http://signoz-otel-collector:4318/v1/traces
// - OTEL_EXPORTER_OTLP_HEADERS: optional JSON of headers for auth, e.g.
//     {"signoz-access-token":"<token>"}

let sdk: NodeSDK | null = null;

export const startTracing = async () => {
  if (sdk) {
    return;
  }

  const traceExporter = new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      'http://localhost:4318/v1/traces',
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'smw-api',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      // Auto-detects and enables common Node.js instrumentations
      getNodeAutoInstrumentations(),
    ],
  });

  try {
    await sdk.start();
    // eslint-disable-next-line no-console
    console.log('[Tracing] OpenTelemetry SDK initialized');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Tracing] Error initializing OpenTelemetry SDK', error);
    sdk = null;
  }
};

export const shutdownTracing = async () => {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    // eslint-disable-next-line no-console
    console.log('[Tracing] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Tracing] Error during OpenTelemetry SDK shutdown', error);
  } finally {
    sdk = null;
  }
};
