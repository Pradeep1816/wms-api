# Development Environment Configuration for API
env         = "dev"
environment = "development"

# API Domain
api_domain = "api.dev2.studiomanagerweb.com"


# API Replicas
api_replicas = 1

# API Resource Configuration
api_resource_config = {
  limits = {
    cpu    = "2000m"
    memory = "4Gi"
  }
  requests = {
    cpu    = "1000m"
    memory = "2Gi"
  }
}

# Database Configuration
db_host     = "88.198.205.24"
db_port     = "3306"
db_database = "smw_may_4"
db_username = "application_user"
db_type     = "mysql"

# Mail Configuration
mail_port      = "2525"
from_mail_user = "traininglocation@arcadiamusicacademy.com"
mail_host      = "sandbox.smtp.mailtrap.io"
mail_user      = "4f49503a9cd3c7"

# Redis Configuration
REDIS_HOST         = "88.198.205.24"
REDIS_PORT         = "6379"
REDIS_CACHE_TTL    = "300"
REDIS_CACHE_PREFIX = "dev-smw-api"

# Observability / OpenTelemetry
OTEL_SERVICE_NAME           = "SMW-API-DEV"
OTEL_EXPORTER_OTLP_ENDPOINT = "http://88.99.187.72:4318/v1/traces"

base_url   = "https://dev2.studiomanagerweb.com"
sentry_dns = "https://dfbb7e67545f73675bdba344471bbe47@o4510582872539136.ingest.us.sentry.io/4510582875553792%27"
microsoft_teams_webhook_url = "https://pearlthoughts.webhook.office.com/webhookb2/4aa0ecf9-8315-4529-aecd-c795231fc0f8@01539d20-c779-4da8-aca2-5c1d5a6fc8bb/IncomingWebhook/c67c78adc2164c9aaef6a195fc1ebb49/ad063866-8f3b-4052-8393-5f4d77bbbae8/V2841zj6hSPP04N0VsF5gY-UmXhb-_X3jq31_wHuTiZtY1"
