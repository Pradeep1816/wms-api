# Production Environment Configuration for API
env         = "prod"
environment = "production"
# API Domain
api_domain = "prod-api.studiomanagerweb.com"

# API Replicas
api_replicas = 2

# API Resource Configuration
api_resource_config = {
  limits = {
    cpu    = "1000m"
    memory = "2Gi"
  }
  requests = {
    cpu    = "1000m"
    memory = "1Gi"
  }
}

# Database Configuration
db_host     = "94.130.225.62"
db_port     = "3306"
db_database = "smw_full"
db_username = "application_user"
db_type     = "mysql"

# Mail Configuration
mail_port      = "587"
from_mail_user = "traininglocation@arcadiamusicacademy.com"
mail_host      = "email-smtp.us-east-1.amazonaws.com"
mail_user      = "AKIAT7MV6LAT4T2UHALV"

# Redis Configuration
REDIS_HOST         = "94.130.225.62"
REDIS_PORT         = "6379"
REDIS_CACHE_TTL    = "300"
REDIS_CACHE_PREFIX = "prod-smw-api"

# Observability / OpenTelemetry
OTEL_SERVICE_NAME           = "SMW-API-PROD"
OTEL_EXPORTER_OTLP_ENDPOINT = "http://88.99.187.72:4318/v1/traces"

base_url = "https://smw.arcadiamusicacademy.com"
sentry_dns = "https://0681bc3bd3e8bff23352d61bcacf4e40@o4510582872539136.ingest.us.sentry.io/4510583242555392%27"
microsoft_teams_webhook_url = "https://pearlthoughts.webhook.office.com/webhookb2/4aa0ecf9-8315-4529-aecd-c795231fc0f8@01539d20-c779-4da8-aca2-5c1d5a6fc8bb/IncomingWebhook/2635526dcedb40f980fca1bdd50d07ef/ad063866-8f3b-4052-8393-5f4d77bbbae8/V27mKLA1l60AfoZi6sx-3KgcUlmhUtA_M_NUpsgveuQR41"
