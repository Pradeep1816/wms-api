# Application Name
variable "app_name" {
  description = "Name of the API Application"
  type        = string
  default     = "smw-api"
}

# Environment
variable "env" {
  description = "Environment to deploy the resources"
  type        = string
}

variable "environment" {
  description = "Environment to deploy the resources"
  type        = string
}

variable "backend_cookie_validation_key" {
  description = "Validation key used for backend cookies"
  type        = string
  sensitive   = true
}

variable "frontend_cookie_validation_key" {
  description = "Validation key used for frontend cookies"
  type        = string
  sensitive   = true
}

# Application Namespace
variable "namespace" {
  description = "Namespace of the application"
  type        = string
  default     = "smw-v2"
}

# Kubernetes Context
variable "kube_context" {
  description = "Kubernetes context to use"
  type        = string
  default     = "default"
}

# Github Username
variable "github_username" {
  description = "Github Username to pull the image from GHCR"
  type        = string
}

# Github PAT Token
variable "github_pat_token" {
  description = "Github PAT Token to pull the image from GHCR"
  type        = string
}

# Github Email ID
variable "github_email_id" {
  description = "Github Email ID to pull the image from GHCR"
  type        = string
}

# API Domain Name
variable "api_domain" {
  description = "Domain for the API application"
  type        = string
}

# API Resource Configuration
variable "api_resource_config" {
  description = "Resource configuration for CPU and memory limits and requests"
  type = object({
    limits = object({
      cpu    = string
      memory = string
    })
    requests = object({
      cpu    = string
      memory = string
    })
  })
}

# API Docker Image
variable "api_docker_image" {
  description = "Docker Image with repository name and tag for API"
  type        = string
}

# API Port
variable "api_port" {
  description = "Port for the API service"
  type        = number
  default     = 3000
}

# API Replicas
variable "api_replicas" {
  description = "Number of replicas for the API deployment"
  type        = number
  default     = 1
}

# Database Configuration Variables
variable "db_host" {
  description = "Database host"
  type        = string
}

variable "db_port" {
  description = "Database port"
  type        = string
  default     = "3306"
}

variable "db_database" {
  description = "Database name"
  type        = string
}

variable "db_username" {
  description = "Database user"
  type        = string
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_type" {
  description = "Database type"
  type        = string
  default     = "mysql"
}

# Mail Configuration Variables
variable "mail_user" {
  description = "Mail user for SMTP authentication"
  type        = string
}

variable "mail_pass" {
  description = "Mail password for SMTP authentication"
  type        = string
  sensitive   = true
}

variable "from_mail_user" {
  description = "From email address for outgoing emails"
  type        = string
}

variable "mail_host" {
  description = "SMTP mail host"
  type        = string
}

variable "mail_port" {
  description = "SMTP mail port"
  type        = string
  default     = "587"
}

variable "REDIS_HOST" {
  type        = string
  description = "Redis server hostname or IP"
}

variable "REDIS_PORT" {
  type        = string
  description = "Redis server port"
  default     = "6379"
}

variable "REDIS_CACHE_TTL" {
  type        = string
  description = "Default Redis TTL for cached items"
  default     = "300"
}

variable "REDIS_CACHE_PREFIX" {
  type        = string
  description = "Prefix for all Redis cache keys"
  default     = "smw-api"
}

variable "OTEL_SERVICE_NAME" {
  type        = string
  description = "Logical service name reported to OpenTelemetry / SigNoz"
}

variable "OTEL_EXPORTER_OTLP_ENDPOINT" {
  type        = string
  description = "OTLP HTTP endpoint for exporting traces to SigNoz"
}

variable "base_url" {
  type        = string
  description = "base url for api"
}

variable "sentry_dns" {
  type        = string
  description = "dns for sentry"
}

variable "microsoft_teams_webhook_url" {
  type        = string
  description = "microsoft teams url"
}
