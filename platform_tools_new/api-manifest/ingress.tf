resource "kubernetes_ingress_v1" "api_ingress" {
  metadata {
    name      = "${var.app_name}-ingress"
    namespace = kubernetes_namespace_v1.smw_namespace.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.class"                    = "nginx"
      "nginx.ingress.kubernetes.io/ssl-redirect"       = "true"
      "nginx.ingress.kubernetes.io/proxy-body-size"    = "50m"
      "nginx.ingress.kubernetes.io/proxy-send-timeout" = "300"
      "nginx.ingress.kubernetes.io/proxy-read-timeout" = "300"
      "cert-manager.io/cluster-issuer"                 = "letsencrypt-prod"
    }
  }

  spec {
    ingress_class_name = "nginx"
    tls {
      hosts = [
        var.api_domain
      ]
      secret_name = "${var.app_name}-tls"
    }

    rule {
      host = var.api_domain
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service_v1.api_service.metadata[0].name
              port {
                number = kubernetes_service_v1.api_service.spec.0.port.0.port
              }
            }
          }
        }
      }
    }
  }
} 