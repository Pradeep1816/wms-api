resource "kubernetes_deployment_v1" "api_deployment" {
  metadata {
    name      = "${var.app_name}-deployment"
    namespace = kubernetes_namespace_v1.smw_namespace.metadata[0].name
  }

  spec {
    replicas = var.api_replicas

    selector {
      match_labels = {
        app = var.app_name
      }
    }

    template {
      metadata {
        labels = {
          app = var.app_name
        }
        annotations = {
          "kubernetes.io/change-cause" = "Terraform deployment at ${timestamp()}"
        }
      }

      spec {
        image_pull_secrets {
          name = kubernetes_secret_v1.ghcr_secret.metadata[0].name
        }

        container {
          image             = var.api_docker_image
          name              = var.app_name
          image_pull_policy = "Always"

          port {
            container_port = var.api_port
          }

          resources {
            limits   = var.api_resource_config.limits
            requests = var.api_resource_config.requests
          }

          env {
            name  = "APP_ENV"
            value = var.environment
          }

          env {
            name  = "BACKEND_COOKIE_VALIDATION_KEY"
            value = var.backend_cookie_validation_key
          }

          env {
            name  = "FRONTEND_COOKIE_VALIDATION_KEY"
            value = var.frontend_cookie_validation_key
          }

          env {
            name  = "APP_PORT"
            value = tostring(var.api_port)
          }

          env {
            name  = "DB_HOST"
            value = var.db_host
          }

          env {
            name  = "DB_PORT"
            value = var.db_port
          }

          env {
            name  = "DB_DATABASE"
            value = var.db_database
          }

          env {
            name  = "DB_USERNAME"
            value = var.db_username
          }

          env {
            name  = "DB_PASSWORD"
            value = var.db_password
          }

          env {
            name  = "DB_TYPE"
            value = var.db_type
          }

          env {
            name  = "NODE_ENV"
            value = var.env
          }

          env {
            name  = "MAIL_USER"
            value = var.mail_user
          }

          env {
            name  = "MAIL_PASS"
            value = var.mail_pass
          }

          env {
            name  = "FROM_MAIL_USER"
            value = var.from_mail_user
          }

          env {
            name  = "MAIL_HOST"
            value = var.mail_host
          }

          env {
            name  = "MAIL_PORT"
            value = var.mail_port
          }

          env {
            name  = "REDIS_HOST"
            value = var.REDIS_HOST
          }

          env {
            name  = "REDIS_PORT"
            value = var.REDIS_PORT
          }

          env {
            name  = "REDIS_CACHE_TTL"
            value = var.REDIS_CACHE_TTL
          }

          env {
            name  = "REDIS_CACHE_PREFIX"
            value = var.REDIS_CACHE_PREFIX
          }

          env {
            name  = "OTEL_SERVICE_NAME"
            value = var.OTEL_SERVICE_NAME
          }

          env {
            name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
            value = var.OTEL_EXPORTER_OTLP_ENDPOINT
          }

          env {
            name  = "BASE_URL"
            value = var.base_url
          }

          env {
            name  = "SENTRY_DSN"
            value = var.sentry_dns
          }

          env {
            name  = "MICROSOFT_TEAMS_WEBHOOK_URL"
            value = var.microsoft_teams_webhook_url
          }

          startup_probe {
            http_get {
              path = "/health/livez"
              port = var.api_port
            }
            failure_threshold = 60
            period_seconds    = 10
            timeout_seconds   = 5
          }

          liveness_probe {
            http_get {
              path = "/health/livez"
              port = var.api_port
            }
            initial_delay_seconds = 60
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 5
          }

          readiness_probe {
            http_get {
              path = "/health/readyz"
              port = var.api_port
            }
            initial_delay_seconds = 30
            period_seconds        = 15
            timeout_seconds       = 10
            failure_threshold     = 5
          }
        }
      }
    }
  }
}
